/**
 * MqttBridge — pont MQTT vers le broker (firmware master publie sensors/pump/alerts).
 *
 * Source de vérité : docs/mobile_api_contract.md §2.1
 *
 * Caractéristiques :
 * - FSM : mock → connecting → connected → error (+ retour mock via stop()).
 * - Backoff exponentiel borné (2s → 4s → 8s → 16s → 30s max).
 * - Lazy load `mqtt` (dynamic import) pour ne pas charger ~80kb au boot.
 * - Subscriptions : hydra/sensors, hydra/pump, hydra/alerts.
 * - Parse + dispatch vers HardwareStore (sanitization via clampNumber).
 * - EventTarget : événements `statechange` (CustomEvent<MqttBridgeState>) et
 *   `log` (CustomEvent<{ tag, msg }>) — consommés par UI et LiveLogStore.
 * - Injection d'un `MqttConnectFn` pour tests (sinon import dynamique réel).
 */
import type { HardwareStore } from '@/stores/hardware.store';
import type { LiveLogStore } from '@/stores/live-log.store';
import { StorageService, STORAGE_KEYS } from './storage';
import type {
  MqttBridgeState,
  MqttConfig,
  MqttSensorsPayload,
  MqttPumpPayload,
  MqttAlertPayload,
  MqttTopicName,
} from '@/types';

/** Backoff schedule en secondes (clamp progressif). */
const BACKOFF_SCHEDULE_S = [2, 4, 8, 16, 30] as const;

const TOPICS: readonly MqttTopicName[] = ['hydra/sensors', 'hydra/pump', 'hydra/alerts'] as const;

/**
 * Interface minimaliste partagée entre mqtt.js réel et un fake.
 * On ne dépend que de ce sous-ensemble pour pouvoir mocker.
 */
export interface MqttLikeClient {
  on(
    event: 'connect' | 'reconnect' | 'error' | 'message' | 'close' | 'offline',
    cb: (...args: unknown[]) => void
  ): MqttLikeClient;
  subscribe(topics: string[] | string, cb?: (err: Error | null) => void): MqttLikeClient;
  publish(topic: string, msg: string | Buffer): MqttLikeClient;
  end(force?: boolean): MqttLikeClient;
  /** Optionnel : forcer une reconnexion (présent sur mqtt.js réel). */
  reconnect?: () => void;
  removeAllListeners?: () => void;
}

export interface MqttConnectOptions {
  username?: string;
  password?: string;
  /** Le bridge gère le reconnect explicitement → on désactive l'auto-reconnect interne. */
  reconnectPeriod?: number;
  connectTimeout?: number;
  clientId?: string;
  clean?: boolean;
}

/** Fonction d'ouverture de connexion — par défaut import dynamique de `mqtt`. */
export type MqttConnectFn = (url: string, opts: MqttConnectOptions) => MqttLikeClient;

export interface MqttBridgeDeps {
  hardware: HardwareStore;
  liveLog?: LiveLogStore;
  storage?: StorageService;
  /** Override pour les tests — sinon dynamic import('mqtt'). */
  connectFn?: MqttConnectFn;
  /** Override scheduler — sinon globalThis.setTimeout/clearTimeout. */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export class MqttBridge extends EventTarget {
  private _state: MqttBridgeState = 'mock';
  private _cfg: MqttConfig | null = null;
  private _client: MqttLikeClient | null = null;
  private _attempt = 0;
  private _reconnectHandle: ReturnType<typeof setTimeout> | null = null;
  private _disposed = false;
  private _lastError: string | null = null;
  private _lastMessageAt = 0;

  private readonly hardware: HardwareStore;
  private readonly liveLog: LiveLogStore | null;
  private readonly storage: StorageService;
  private readonly userSetTimeout: typeof setTimeout | undefined;
  private readonly userClearTimeout: typeof clearTimeout | undefined;
  private readonly userConnectFn: MqttConnectFn | undefined;

  constructor(deps: MqttBridgeDeps) {
    super();
    this.hardware = deps.hardware;
    this.liveLog = deps.liveLog ?? null;
    this.storage = deps.storage ?? new StorageService();
    this.userConnectFn = deps.connectFn;
    this.userSetTimeout = deps.setTimeoutFn;
    this.userClearTimeout = deps.clearTimeoutFn;
  }

  /**
   * Accès dynamique au setTimeout courant (permet à vi.useFakeTimers()
   * de prendre effet même après la construction du bridge).
   */
  private get setTimeoutFn(): typeof setTimeout {
    return this.userSetTimeout ?? globalThis.setTimeout;
  }

  private get clearTimeoutFn(): typeof clearTimeout {
    return this.userClearTimeout ?? globalThis.clearTimeout;
  }

  // ─── Public API ────────────────────────────────────────────
  get state(): MqttBridgeState {
    return this._state;
  }

  get cfg(): MqttConfig | null {
    return this._cfg;
  }

  get lastError(): string | null {
    return this._lastError;
  }

  get lastMessageAt(): number {
    return this._lastMessageAt;
  }

  isLive(): boolean {
    return this._state === 'connected';
  }

  /**
   * Restore config from storage + auto-connect.
   * No-op si pas de config persistée.
   */
  init(): void {
    const cfg = this.storage.get<MqttConfig | null>(STORAGE_KEYS.MQTT_CONFIG, null);
    if (cfg?.url) {
      this._cfg = cfg;
      this._attempt = 0;
      void this.connect();
    }
  }

  /**
   * Set new config + persist + reconnect (reset backoff).
   */
  setConfig(cfg: MqttConfig): void {
    this._cfg = cfg;
    this.storage.set(STORAGE_KEYS.MQTT_CONFIG, cfg);
    this._attempt = 0;
    void this.connect();
  }

  /**
   * Démarre une tentative de connexion. Si déjà connecté/connecting,
   * ferme proprement et redémarre.
   *
   * NB : ne reset PAS `_attempt` — c'est `setConfig`/`forceReconnect`/`init`
   * qui le font (fresh start). Les reconnects automatiques préservent
   * le compteur pour faire grandir le backoff.
   */
  async connect(): Promise<void> {
    if (this._disposed) return;
    if (!this._cfg?.url) {
      this.setState('mock');
      return;
    }

    // Reset état avant nouvelle tentative
    this.teardownClient();
    this.cancelReconnect();
    this.setState('connecting');
    this.log('info', `Connexion à ${this._cfg.url}…`);

    try {
      const connectFn = this.userConnectFn ?? (await this.loadRealMqtt());
      this.openClient(connectFn);
    } catch (err) {
      const msg = (err as Error).message ?? 'mqtt load failed';
      this._lastError = msg;
      this.setState('error');
      this.log('error', `Chargement mqtt.js échoué : ${msg}`);
      this.scheduleReconnect();
    }
  }

  /**
   * Bascule en mock (UI utilise mock-service) et ferme la connexion.
   */
  stop(): void {
    this.cancelReconnect();
    this.teardownClient();
    this._attempt = 0;
    this.setState('mock');
  }

  /**
   * Libère toutes les ressources. Le bridge n'est plus utilisable après.
   */
  dispose(): void {
    this._disposed = true;
    this.stop();
  }

  /** Force une reconnexion immédiate (utilisé par UI bouton "reconnecter"). */
  forceReconnect(): void {
    if (!this._cfg?.url) return;
    this.cancelReconnect();
    this._attempt = 0;
    void this.connect();
  }

  // ─── Private — connection lifecycle ─────────────────────────
  private async loadRealMqtt(): Promise<MqttConnectFn> {
    // Lazy import — ne bundle pas mqtt.js dans le chunk principal.
    const mod = (await import('mqtt')) as {
      connect?: MqttConnectFn;
      default?: { connect: MqttConnectFn };
    };
    const connect = mod.connect ?? mod.default?.connect;
    if (typeof connect !== 'function') {
      throw new Error('mqtt module: connect() introuvable');
    }
    return connect;
  }

  private openClient(connectFn: MqttConnectFn): void {
    if (!this._cfg) return;
    const opts: MqttConnectOptions = {
      username: this._cfg.user || undefined,
      password: this._cfg.pass || undefined,
      // On gère le reconnect nous-mêmes → 0 désactive l'auto interne.
      reconnectPeriod: 0,
      connectTimeout: 8000,
      clientId: `hydra-mobile-${Math.random().toString(16).slice(2, 10)}`,
      clean: true,
    };

    const client = connectFn(this._cfg.url, opts);
    this._client = client;

    client.on('connect', () => this.onConnect());
    client.on('error', (err) => this.onError(err as Error));
    client.on('close', () => this.onClose());
    client.on('offline', () => this.onOffline());
    client.on('message', (topic, payload) =>
      this.onMessage(topic as string, payload as Uint8Array | string)
    );
  }

  private teardownClient(): void {
    if (!this._client) return;
    try {
      this._client.removeAllListeners?.();
      this._client.end(true);
    } catch (err) {
      // ignore — le client était peut-être déjà fermé
      console.warn('[mqtt] teardown', err);
    }
    this._client = null;
  }

  private cancelReconnect(): void {
    if (this._reconnectHandle !== null) {
      this.clearTimeoutFn(this._reconnectHandle);
      this._reconnectHandle = null;
    }
  }

  private scheduleReconnect(): void {
    if (this._disposed) return;
    if (!this._cfg?.url) return;
    this.cancelReconnect();
    const idx = Math.min(this._attempt, BACKOFF_SCHEDULE_S.length - 1);
    const delayS = BACKOFF_SCHEDULE_S[idx] ?? 30;
    this._attempt += 1;
    this.log('info', `Reconnexion dans ${delayS}s (tentative ${this._attempt})`);
    this._reconnectHandle = this.setTimeoutFn(() => {
      this._reconnectHandle = null;
      void this.connect();
    }, delayS * 1000);
  }

  // ─── Private — MQTT event handlers ─────────────────────────
  private onConnect(): void {
    this._attempt = 0;
    this._lastError = null;
    this.setState('connected');
    this.log('ok', 'MQTT connecté');
    this._client?.subscribe([...TOPICS], (err) => {
      if (err) {
        this.log('error', `subscribe: ${err.message}`);
      }
    });
  }

  private onError(err: Error): void {
    this._lastError = err.message;
    this.log('error', `MQTT erreur : ${err.message}`);
    // Ne pas setState ici — close suivra et déclenchera scheduleReconnect.
    if (this._state === 'connecting') {
      this.setState('error');
    }
  }

  private onClose(): void {
    if (this._disposed) return;
    if (this._state === 'connected') {
      this.setState('error');
      this.log('warn', 'Connexion MQTT fermée');
    }
    this.scheduleReconnect();
  }

  private onOffline(): void {
    if (this._state === 'connected') {
      this.setState('error');
      this.log('warn', 'MQTT offline');
    }
  }

  private onMessage(topic: string, raw: Uint8Array | string): void {
    this._lastMessageAt = Date.now();
    let parsed: unknown;
    try {
      const text = typeof raw === 'string' ? raw : new TextDecoder('utf-8').decode(raw);
      parsed = JSON.parse(text);
    } catch (err) {
      this.log('warn', `${topic}: JSON invalide`);
      console.warn('[mqtt] parse failed', topic, err);
      return;
    }

    switch (topic) {
      case 'hydra/sensors':
        if (isSensorsPayload(parsed)) {
          this.hardware.updateFromMqttSensors(parsed);
        } else {
          this.log('warn', 'hydra/sensors: payload invalide');
        }
        break;
      case 'hydra/pump':
        if (isPumpPayload(parsed)) {
          this.hardware.updateFromMqttPump(parsed);
        } else {
          this.log('warn', 'hydra/pump: payload invalide');
        }
        break;
      case 'hydra/alerts':
        if (isAlertPayload(parsed)) {
          this.log('warn', `Alerte: ${parsed.alert}`);
        } else {
          this.log('warn', 'hydra/alerts: payload invalide');
        }
        break;
      default:
        // topic inattendu → ignore
        break;
    }
  }

  // ─── Private — helpers ─────────────────────────────────────
  private setState(next: MqttBridgeState): void {
    if (this._state === next) return;
    this._state = next;
    this.dispatchEvent(new CustomEvent('statechange', { detail: next }));
  }

  private log(tag: 'ok' | 'warn' | 'error' | 'info', msg: string): void {
    this.dispatchEvent(new CustomEvent('log', { detail: { tag, msg } }));
    if (this.liveLog) {
      const liveTag = tag === 'info' ? 'sys' : tag;
      this.liveLog.pushEvent(liveTag, msg);
    }
  }
}

// ─── Type guards ───────────────────────────────────────────────
function isSensorsPayload(v: unknown): v is MqttSensorsPayload {
  if (!isObject(v)) return false;
  return (
    isNum(v.avgMoisture) &&
    isNum(v.tankLevel) &&
    isNum(v.temperature) &&
    isNum(v.humidity) &&
    isNum(v.pressure)
  );
}

function isPumpPayload(v: unknown): v is MqttPumpPayload {
  if (!isObject(v)) return false;
  return isObject(v.balcon) && isObject(v.interieur);
}

function isAlertPayload(v: unknown): v is MqttAlertPayload {
  if (!isObject(v)) return false;
  return typeof v.alert === 'string' && isNum(v.timestamp);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
