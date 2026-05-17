/**
 * MockService — simule l'activité firmware quand le MqttBridge est en mode `mock`.
 *
 * Comportement (calque sur `startLiveUpdates()` du prototype legacy) :
 *  - Tick 3s par défaut.
 *  - Avance les compteurs temps (uptime, lastSync, lastWater, lastFill).
 *  - Random walk sur l'humidité des pots (~ -0.05 %/3s) → mode AUTO réaliste.
 *  - Consommation lente des réservoirs (drip steady).
 *  - Drift PING ESP-NOW, RSSI, MQTT RTT.
 *  - Auto-recovery thermal lockout (timer décrément → état NORMAL).
 *
 * **Pas de DOM ici.** Le service ne fait que muter les stores ; le re-render
 * est géré par les subscribers (UiStore / HardwareStore listeners).
 *
 * Démarrage / arrêt via `start()` / `stop()`. Idempotent.
 */
import type { HardwareStore } from '@/stores/hardware.store';
import type { LiveLogStore } from '@/stores/live-log.store';
import type { MqttBridge } from './mqtt-bridge';
import type { Pot, PlantProfile, ProfilesMap, ProfileId } from '@/types';

const DEFAULT_TICK_MS = 3000;
const HUMIDITY_DRY_RATE_PER_TICK = 0.05; // -0.05 %/tick
const HUMIDITY_NOISE_AMPLITUDE = 0.2;
const TANK_DRAIN_T01_PER_TICK = 0.0008; // L
const TANK_DRAIN_T02_PER_TICK = 0.0003;

export interface MockServiceDeps {
  hardware: HardwareStore;
  liveLog?: LiveLogStore;
  /** Si fourni, suspend la mutation des capteurs quand le bridge est LIVE. */
  mqttBridge?: MqttBridge;
  /** Map des profils plante (pour recalcul état visuel). */
  profiles: ProfilesMap;
  /** Tick interval en ms (par défaut 3000). */
  tickMs?: number;
  /** Injection RNG pour tests déterministes. */
  random?: () => number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

export class MockService {
  private readonly hardware: HardwareStore;
  private readonly liveLog: LiveLogStore | null;
  private readonly bridge: MqttBridge | null;
  private readonly profiles: ProfilesMap;
  private readonly tickMs: number;
  private readonly random: () => number;
  private readonly userSetInterval: typeof setInterval | undefined;
  private readonly userClearInterval: typeof clearInterval | undefined;
  private handle: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;

  constructor(deps: MockServiceDeps) {
    this.hardware = deps.hardware;
    this.liveLog = deps.liveLog ?? null;
    this.bridge = deps.mqttBridge ?? null;
    this.profiles = deps.profiles;
    this.tickMs = deps.tickMs ?? DEFAULT_TICK_MS;
    this.random = deps.random ?? Math.random;
    this.userSetInterval = deps.setIntervalFn;
    this.userClearInterval = deps.clearIntervalFn;
  }

  private get setIntervalFn(): typeof setInterval {
    return this.userSetInterval ?? globalThis.setInterval;
  }

  private get clearIntervalFn(): typeof clearInterval {
    return this.userClearInterval ?? globalThis.clearInterval;
  }

  isRunning(): boolean {
    return this.handle !== null;
  }

  start(): void {
    if (this.handle !== null) return;
    this.handle = this.setIntervalFn(() => this.tick(), this.tickMs);
  }

  stop(): void {
    if (this.handle === null) return;
    this.clearIntervalFn(this.handle);
    this.handle = null;
  }

  /** Exécute un tick à la main (utile pour les tests). */
  tickNow(): void {
    this.tick();
  }

  /** Reset l'état interne (compteur de ticks). Ne touche pas aux stores. */
  reset(): void {
    this.tickCount = 0;
  }

  private tick(): void {
    this.tickCount += 1;
    const liveMqtt = this.bridge?.isLive() ?? false;

    this.hardware.update((s) => {
      const next = { ...s };
      const tickS = this.tickMs / 1000;

      // ─── Master clock ────────────────────────────────────────
      next.master = {
        ...s.master,
        uptime: s.master.uptime + tickS,
        lastSync: (s.master.lastSync + tickS) % 30,
        mqttRtt: 80 + Math.round(this.random() * 20),
        wanLatency: 75 + Math.round(this.random() * 25),
        ramUsed: 140 + Math.round(this.random() * 10),
      };

      // ─── Pairing ─────────────────────────────────────────────
      if (s.pairing.status === 'PAIRED') {
        next.pairing = {
          ...s.pairing,
          pairedSince: s.pairing.pairedSince + tickS,
          // PING ESP-NOW toutes les 3 ticks (~9s)
          lastSeq: this.tickCount % 3 === 0 ? s.pairing.lastSeq + 1 : s.pairing.lastSeq,
        };
      }

      // ─── Safety auto-recovery ────────────────────────────────
      if (s.safety.state !== 'NORMAL') {
        const remain = Math.max(0, s.safety.thermalCoolingRemainS - tickS);
        next.safety = {
          ...s.safety,
          sinceLockoutS: s.safety.sinceLockoutS + tickS,
          thermalCoolingRemainS: remain,
        };
        if (s.safety.state === 'THERMAL_LOCKOUT' && remain === 0) {
          next.safety = {
            ...next.safety,
            state: 'NORMAL',
            reason: null,
            sinceLockoutS: 0,
            relayArmed: true,
            pumpEnabled: true,
          };
          this.log('info', 'SafetyManager auto-recovery · réarmement');
        }
      }

      // ─── Pots & tanks ────────────────────────────────────────
      const pots: Record<string, Pot> = {};
      for (const [id, p] of Object.entries(s.pots)) {
        pots[id] = this.updatePot(p, liveMqtt, tickS);
      }
      next.pots = pots;

      const t01 = s.tanks.T01;
      const t02 = s.tanks.T02;
      next.tanks = { ...s.tanks };
      if (t01) {
        next.tanks.T01 = {
          ...t01,
          vol: liveMqtt ? t01.vol : Math.max(0, t01.vol - TANK_DRAIN_T01_PER_TICK),
          lastFill: t01.lastFill + tickS,
        };
      }
      if (t02) {
        next.tanks.T02 = {
          ...t02,
          vol: liveMqtt ? t02.vol : Math.max(0, t02.vol - TANK_DRAIN_T02_PER_TICK),
          lastFill: t02.lastFill + tickS,
        };
      }

      // ─── Slave seq + RSSI jitter ─────────────────────────────
      const slave = s.slaves.SLAVE;
      if (slave?.online) {
        next.slaves = {
          ...s.slaves,
          SLAVE: {
            ...slave,
            lastSeq: slave.lastSeq + 1,
            rssi: -42 + Math.round((this.random() - 0.5) * 4),
          },
        };
      }

      return next;
    });

    // ─── Log events occasionnels ───────────────────────────────
    if (this.tickCount % 4 === 0) {
      this.emitRandomLogEvent();
    }
  }

  private updatePot(p: Pot, liveMqtt: boolean, tickS: number): Pot {
    // En LIVE, on ne fait avancer que le compteur "lastWater" — l'humidité
    // est pilotée par MQTT.
    if (liveMqtt) {
      return { ...p, lastWater: p.lastWater + tickS };
    }
    if (p.state === 'off' || p.state === 'watering') {
      return { ...p, lastWater: p.lastWater + tickS };
    }

    const noise = (this.random() - 0.5) * HUMIDITY_NOISE_AMPLITUDE;
    const newHum = Math.max(0, p.hum - HUMIDITY_DRY_RATE_PER_TICK + noise);
    const profile = this.profiles[p.profileId as ProfileId];
    return {
      ...p,
      hum: newHum,
      lastWater: p.lastWater + tickS,
      state: classifyPotState(newHum, profile),
    };
  }

  private emitRandomLogEvent(): void {
    if (!this.liveLog) return;
    const messages: readonly string[] = [
      'MQTT PUB hydra/sensors',
      'ESP-NOW SLAVE frame OK',
      'SCHED eval cycle',
      'heap free 168kB · stack ok',
    ];
    const idx = Math.floor(this.random() * messages.length);
    const msg = messages[idx] ?? 'tick';
    this.liveLog.pushEvent('info', msg);
  }

  private log(tag: 'info' | 'warn' | 'error', msg: string): void {
    if (this.liveLog) this.liveLog.pushEvent(tag, msg);
  }
}

/** Recalcule l'état visuel d'un pot d'après son humidité + profil. */
export function classifyPotState(hum: number, profile: PlantProfile | undefined): Pot['state'] {
  if (!profile) return 'ok';
  if (hum < profile.dry) return 'crit';
  if (hum < profile.ok) return 'dry';
  if (hum < profile.ok + 15) return 'ok';
  return 'high';
}
