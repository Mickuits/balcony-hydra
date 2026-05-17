import { describe, it, expect, beforeEach } from 'vitest';
import { HardwareStore } from './hardware.store';
import { INITIAL_HARDWARE } from '@/data';

describe('HardwareStore', () => {
  let store: HardwareStore;

  beforeEach(() => {
    store = new HardwareStore(structuredClone(INITIAL_HARDWARE));
  });

  describe('safety', () => {
    it('setSafetyState NORMAL resets lockout fields', () => {
      store.setSafetyState('HARD_LOCKOUT', 'test');
      store.setSafetyState('NORMAL');
      const s = store.get().safety;
      expect(s.state).toBe('NORMAL');
      expect(s.relayArmed).toBe(true);
      expect(s.pumpEnabled).toBe(true);
      expect(s.bootCrashCount).toBe(0);
    });

    it('setSafetyState THERMAL_LOCKOUT sets cooling timer', () => {
      store.setSafetyState('THERMAL_LOCKOUT', 'T° > 58');
      const s = store.get().safety;
      expect(s.state).toBe('THERMAL_LOCKOUT');
      expect(s.reason).toBe('T° > 58');
      expect(s.thermalCoolingRemainS).toBeGreaterThan(0);
      expect(s.relayArmed).toBe(false);
    });

    it('setSafetyState SAFE_MODE sets bootCrashCount to 3', () => {
      store.setSafetyState('SAFE_MODE');
      expect(store.get().safety.bootCrashCount).toBe(3);
    });

    it('patchSafety merges partial', () => {
      store.patchSafety({ tempPcb: 50.5 });
      expect(store.get().safety.tempPcb).toBe(50.5);
      expect(store.get().safety.state).toBe(INITIAL_HARDWARE.safety.state);
    });
  });

  describe('pairing', () => {
    it('resetPairing clears slave + sets UNPAIRED', () => {
      store.resetPairing();
      const p = store.get().pairing;
      expect(p.status).toBe('UNPAIRED');
      expect(p.slaveMac).toBeNull();
      expect(p.rssi).toBe(-127);
      expect(store.get().slaves.SLAVE?.online).toBe(false);
    });

    it('confirmPairing sets PAIRED + slave online', () => {
      store.resetPairing();
      store.confirmPairing('AA:BB:CC:DD:EE:FF');
      const p = store.get().pairing;
      expect(p.status).toBe('PAIRED');
      expect(p.slaveMac).toBe('AA:BB:CC:DD:EE:FF');
      expect(p.lastSeq).toBe(1);
      expect(store.get().slaves.SLAVE?.online).toBe(true);
    });

    it('patchPairing merges partial', () => {
      store.patchPairing({ lastSeq: 9999, rssi: -55 });
      expect(store.get().pairing.lastSeq).toBe(9999);
      expect(store.get().pairing.rssi).toBe(-55);
    });
  });

  describe('pump', () => {
    it('setMasterPumpRunning toggles flag', () => {
      store.setMasterPumpRunning(true);
      expect(store.get().master.pumpRunning).toBe(true);
      store.setMasterPumpRunning(false);
      expect(store.get().master.pumpRunning).toBe(false);
    });

    it('setSlavePumpRunning no-op for unknown slave', () => {
      const before = store.get();
      store.setSlavePumpRunning('UNKNOWN', true);
      expect(store.get()).toEqual(before);
    });

    it('setSlavePumpRunning updates the right slave', () => {
      store.setSlavePumpRunning('SLAVE', true);
      expect(store.get().slaves.SLAVE?.pumpRunning).toBe(true);
    });
  });

  describe('updateFromMqttSensors', () => {
    it('updates avgHum, tempPcb, tank.T02.vol', () => {
      store.updateFromMqttSensors({
        avgMoisture: 75,
        tankLevel: 50, // 50% of 25L = 12.5L
        temperature: 22.5,
        humidity: 60,
        pressure: 1013,
      });
      expect(store.get().master.avgHum).toBe(75);
      expect(store.get().safety.tempPcb).toBe(22.5);
      expect(store.get().tanks.T02?.vol).toBeCloseTo(12.5, 1);
    });

    it('ignores invalid temperature (< -50)', () => {
      const before = store.get().safety.tempPcb;
      store.updateFromMqttSensors({
        avgMoisture: 50,
        tankLevel: 50,
        temperature: -99, // firmware "invalid"
        humidity: 50,
        pressure: 1013,
      });
      expect(store.get().safety.tempPcb).toBe(before);
    });

    it('ignores negative tank level', () => {
      const before = store.get().tanks.T02?.vol;
      store.updateFromMqttSensors({
        avgMoisture: 50,
        tankLevel: -1,
        temperature: 20,
        humidity: 50,
        pressure: 1013,
      });
      expect(store.get().tanks.T02?.vol).toBe(before);
    });

    it('clamps avgMoisture to [0..100]', () => {
      store.updateFromMqttSensors({
        avgMoisture: 150,
        tankLevel: 50,
        temperature: 20,
        humidity: 50,
        pressure: 1013,
      });
      expect(store.get().master.avgHum).toBe(100);
    });
  });

  describe('updateFromMqttPump', () => {
    it('updates balcon (slave) running + avgHum', () => {
      store.updateFromMqttPump({
        balcon: {
          state: 1,
          stateLabel: 'En marche',
          running: true,
          runningForS: 5,
          avgMoisture: 60,
          totalCycles: 1,
          lastCurrent: 1800,
          failsafe: false,
          lastStopReason: 0,
        },
        interieur: {
          state: 0,
          stateLabel: 'Arrêt',
          running: false,
          runningForS: 0,
          avgMoisture: 55,
          totalCycles: 0,
          lastCurrent: 0,
          failsafe: false,
          lastStopReason: 0,
        },
      });
      expect(store.get().slaves.SLAVE?.pumpRunning).toBe(true);
      expect(store.get().slaves.SLAVE?.avgHum).toBe(60);
      expect(store.get().master.pumpRunning).toBe(false);
    });
  });
});
