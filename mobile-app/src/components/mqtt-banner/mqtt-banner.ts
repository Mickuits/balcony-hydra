/**
 * MqttBanner — bandeau d'état MQTT en haut d'écran.
 *
 * Réagit aux changements de `mqttBridge.state` :
 *   - mock        → bandeau caché (UI en mode démo)
 *   - connecting  → bandeau orange "Connexion…"
 *   - connected   → bandeau vert "Live" (auto-hide après 2s par défaut)
 *   - error       → bandeau rouge "Reconnexion dans …s" (clickable → forceReconnect)
 *
 * Le composant **n'agit pas directement** sur le bridge — il déclare une
 * intention via `onAction()` que le caller (main.ts) interprète.
 */
import type { MqttBridge } from '@/services/mqtt-bridge';
import type { MqttBridgeState } from '@/types';

export interface MqttBannerDeps {
  root: HTMLElement;
  bridge: MqttBridge;
  /** Callback déclenché quand l'utilisateur clique "Reconnecter". */
  onAction?: () => void;
  /** Délai d'auto-hide après "connected" (ms). 0 = jamais. */
  autoHideMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

const DEFAULT_AUTOHIDE_MS = 2000;

export class MqttBanner {
  private readonly root: HTMLElement;
  private readonly bridge: MqttBridge;
  private readonly onAction: (() => void) | null;
  private readonly autoHideMs: number;
  private readonly userSetTimeout: typeof setTimeout | undefined;
  private readonly userClearTimeout: typeof clearTimeout | undefined;
  private listener: ((e: Event) => void) | null = null;
  private clickHandler: (() => void) | null = null;
  private hideHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: MqttBannerDeps) {
    this.root = deps.root;
    this.bridge = deps.bridge;
    this.onAction = deps.onAction ?? null;
    this.autoHideMs = deps.autoHideMs ?? DEFAULT_AUTOHIDE_MS;
    this.userSetTimeout = deps.setTimeoutFn;
    this.userClearTimeout = deps.clearTimeoutFn;
  }

  private get setTimeoutFn(): typeof setTimeout {
    return this.userSetTimeout ?? globalThis.setTimeout;
  }

  private get clearTimeoutFn(): typeof clearTimeout {
    return this.userClearTimeout ?? globalThis.clearTimeout;
  }

  mount(): void {
    this.listener = (e: Event) => {
      const state = (e as CustomEvent<MqttBridgeState>).detail;
      this.render(state);
    };
    this.bridge.addEventListener('statechange', this.listener);

    this.clickHandler = () => this.onAction?.();
    this.root.addEventListener('click', this.clickHandler);

    this.render(this.bridge.state);
  }

  unmount(): void {
    if (this.listener) this.bridge.removeEventListener('statechange', this.listener);
    if (this.clickHandler) this.root.removeEventListener('click', this.clickHandler);
    this.listener = null;
    this.clickHandler = null;
    this.cancelAutoHide();
  }

  private render(state: MqttBridgeState): void {
    this.cancelAutoHide();
    this.root.dataset['state'] = state;
    switch (state) {
      case 'mock':
        this.root.hidden = true;
        this.root.textContent = '';
        return;
      case 'connecting':
        this.root.hidden = false;
        this.root.textContent = 'Connexion MQTT…';
        this.root.setAttribute('aria-label', 'Connexion MQTT en cours');
        return;
      case 'connected':
        this.root.hidden = false;
        this.root.textContent = 'Live';
        this.root.setAttribute('aria-label', 'Connexion MQTT établie');
        if (this.autoHideMs > 0) {
          this.hideHandle = this.setTimeoutFn(() => {
            this.root.hidden = true;
          }, this.autoHideMs);
        }
        return;
      case 'error': {
        this.root.hidden = false;
        const errMsg = this.bridge.lastError ?? 'connexion perdue';
        this.root.textContent = `Erreur MQTT : ${errMsg} — Appuyer pour reconnecter`;
        this.root.setAttribute('aria-label', `Erreur MQTT: ${errMsg}`);
        this.root.setAttribute('role', 'button');
        return;
      }
    }
  }

  private cancelAutoHide(): void {
    if (this.hideHandle !== null) {
      this.clearTimeoutFn(this.hideHandle);
      this.hideHandle = null;
    }
  }
}
