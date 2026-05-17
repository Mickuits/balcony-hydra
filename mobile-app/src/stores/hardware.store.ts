/**
 * HardwareStore — état live ESP32 (master, slaves, safety, pairing, pots, tanks).
 * Mutateurs typés pour les transitions courantes.
 */
import { Store } from './store';
import { INITIAL_HARDWARE } from '@/data';
import type {
  HardwareState,
  SafetyManagerState,
  SafetyState,
  PairingState,
  MqttSensorsPayload,
  MqttPumpPayload,
} from '@/types';
import { clampNumber } from '@/utils/sanitize';

export class HardwareStore extends Store<HardwareState> {
  constructor(initial: HardwareState = INITIAL_HARDWARE) {
    super(initial);
  }

  // ─── Safety ────────────────────────────────────────────────
  setSafetyState(state: SafetyManagerState, reason: string | null = null): void {
    this.update((s) => ({
      ...s,
      safety: {
        ...s.safety,
        state,
        reason,
        sinceLockoutS: state === 'NORMAL' ? 0 : s.safety.sinceLockoutS,
        thermalCoolingRemainS: state === 'THERMAL_LOCKOUT' ? 218 : 0,
        relayArmed: state === 'NORMAL',
        pumpEnabled: state === 'NORMAL',
        bootCrashCount:
          state === 'SAFE_MODE' ? 3 : state === 'NORMAL' ? 0 : s.safety.bootCrashCount,
      },
    }));
  }

  patchSafety(partial: Partial<SafetyState>): void {
    this.update((s) => ({ ...s, safety: { ...s.safety, ...partial } }));
  }

  // ─── Pairing ───────────────────────────────────────────────
  patchPairing(partial: Partial<PairingState>): void {
    this.update((s) => ({ ...s, pairing: { ...s.pairing, ...partial } }));
  }

  resetPairing(): void {
    this.update((s) => ({
      ...s,
      pairing: {
        ...s.pairing,
        status: 'UNPAIRED',
        slaveMac: null,
        lastSeq: 0,
        rssi: -127,
        pairedSince: 0,
      },
      slaves: {
        ...s.slaves,
        SLAVE: { ...s.slaves.SLAVE!, online: false },
      },
    }));
  }

  confirmPairing(slaveMac: string): void {
    this.update((s) => ({
      ...s,
      pairing: {
        ...s.pairing,
        status: 'PAIRED',
        slaveMac,
        lastSeq: 1,
        rssi: -38,
        lastPingMs: 92,
        pairedSince: 0,
      },
      slaves: {
        ...s.slaves,
        SLAVE: { ...s.slaves.SLAVE!, online: true, rssi: -38 },
      },
    }));
  }

  // ─── Pump ──────────────────────────────────────────────────
  setMasterPumpRunning(running: boolean): void {
    this.update((s) => ({ ...s, master: { ...s.master, pumpRunning: running } }));
  }

  setSlavePumpRunning(slaveId: string, running: boolean): void {
    this.update((s) => {
      const slave = s.slaves[slaveId];
      if (!slave) return undefined;
      return {
        ...s,
        slaves: { ...s.slaves, [slaveId]: { ...slave, pumpRunning: running } },
      };
    });
  }

  // ─── MQTT updates ──────────────────────────────────────────
  updateFromMqttSensors(payload: MqttSensorsPayload): void {
    this.update((s) => {
      const tank = s.tanks.T02;
      const newTankVol =
        tank && payload.tankLevel >= 0
          ? (clampNumber(payload.tankLevel, 0, 100, 0) / 100) * tank.cap
          : (tank?.vol ?? 0);
      return {
        ...s,
        master: {
          ...s.master,
          avgHum: clampNumber(payload.avgMoisture, 0, 100, s.master.avgHum),
        },
        safety: {
          ...s.safety,
          tempPcb:
            payload.temperature > -50
              ? clampNumber(payload.temperature, -50, 100, s.safety.tempPcb)
              : s.safety.tempPcb,
        },
        tanks: tank ? { ...s.tanks, T02: { ...tank, vol: newTankVol } } : s.tanks,
      };
    });
  }

  updateFromMqttPump(payload: MqttPumpPayload): void {
    this.update((s) => {
      const next = { ...s };
      if (payload.balcon) {
        const slave = s.slaves.SLAVE;
        if (slave) {
          next.slaves = {
            ...s.slaves,
            SLAVE: {
              ...slave,
              pumpRunning: !!payload.balcon.running,
              avgHum: clampNumber(payload.balcon.avgMoisture, 0, 100, slave.avgHum),
            },
          };
        }
      }
      if (payload.interieur) {
        next.master = { ...s.master, pumpRunning: !!payload.interieur.running };
      }
      return next;
    });
  }
}

/** Singleton — exporté pour usage app */
export const hardwareStore = new HardwareStore();
