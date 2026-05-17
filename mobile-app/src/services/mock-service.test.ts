import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockService, classifyPotState } from './mock-service';
import { HardwareStore } from '@/stores/hardware.store';
import { LiveLogStore } from '@/stores/live-log.store';
import { INITIAL_PROFILES } from '@/data/mock-profiles';
import type { MqttBridge } from './mqtt-bridge';

describe('MockService', () => {
  let svc: MockService;
  let hw: HardwareStore;
  let log: LiveLogStore;

  beforeEach(() => {
    hw = new HardwareStore();
    log = new LiveLogStore(20);
    // RNG déterministe à 0.5 → noise = 0
    svc = new MockService({
      hardware: hw,
      liveLog: log,
      profiles: INITIAL_PROFILES,
      tickMs: 1000,
      random: () => 0.5,
    });
  });

  describe('lifecycle', () => {
    it('is idle at construction', () => {
      expect(svc.isRunning()).toBe(false);
    });

    it('start / stop toggle running state', () => {
      vi.useFakeTimers();
      svc.start();
      expect(svc.isRunning()).toBe(true);
      svc.stop();
      expect(svc.isRunning()).toBe(false);
      vi.useRealTimers();
    });

    it('start is idempotent', () => {
      vi.useFakeTimers();
      svc.start();
      svc.start();
      expect(svc.isRunning()).toBe(true);
      svc.stop();
      vi.useRealTimers();
    });
  });

  describe('tickNow() — manual tick (mock mode, no MQTT bridge)', () => {
    it('advances master.uptime by tickMs/1000 seconds', () => {
      const before = hw.get().master.uptime;
      svc.tickNow();
      expect(hw.get().master.uptime).toBe(before + 1);
    });

    it('decays humidity on non-watering pots', () => {
      const potIds = Object.keys(hw.get().pots);
      const id = potIds[0]!;
      const before = hw.get().pots[id]!.hum;
      svc.tickNow();
      const after = hw.get().pots[id]!.hum;
      // noise=0 (random()=0.5), rate=-0.05/tick
      expect(after).toBeCloseTo(before - 0.05, 5);
    });

    it('drains tanks', () => {
      const t01Before = hw.get().tanks.T01!.vol;
      const t02Before = hw.get().tanks.T02!.vol;
      svc.tickNow();
      expect(hw.get().tanks.T01!.vol).toBeCloseTo(t01Before - 0.0008, 6);
      expect(hw.get().tanks.T02!.vol).toBeCloseTo(t02Before - 0.0003, 6);
    });

    it('advances pairing.pairedSince when PAIRED', () => {
      const before = hw.get().pairing.pairedSince;
      svc.tickNow();
      expect(hw.get().pairing.pairedSince).toBe(before + 1);
    });

    it('updates pairing.lastSeq every 3rd tick', () => {
      const before = hw.get().pairing.lastSeq;
      svc.tickNow(); // 1
      expect(hw.get().pairing.lastSeq).toBe(before);
      svc.tickNow(); // 2
      expect(hw.get().pairing.lastSeq).toBe(before);
      svc.tickNow(); // 3 → +1
      expect(hw.get().pairing.lastSeq).toBe(before + 1);
    });

    it('reclassifies pot state when humidity drops below thresholds', () => {
      const potIds = Object.keys(hw.get().pots);
      const id = potIds[0]!;
      // Force hum près du seuil dry
      const profile =
        INITIAL_PROFILES[hw.get().pots[id]!.profileId as keyof typeof INITIAL_PROFILES];
      hw.update((s) => ({
        ...s,
        pots: { ...s.pots, [id]: { ...s.pots[id]!, hum: profile.dry + 0.02 } },
      }));
      svc.tickNow();
      // -0.05 → passe sous dry → état 'crit'
      expect(hw.get().pots[id]!.state).toBe('crit');
    });
  });

  describe('LIVE mode (mqttBridge.isLive() === true)', () => {
    let bridge: { isLive: () => boolean } & Partial<MqttBridge>;

    beforeEach(() => {
      bridge = { isLive: () => true };
      svc = new MockService({
        hardware: hw,
        liveLog: log,
        profiles: INITIAL_PROFILES,
        tickMs: 1000,
        random: () => 0.5,
        mqttBridge: bridge as unknown as MqttBridge,
      });
    });

    it('does NOT decay humidity (MQTT pilote)', () => {
      const id = Object.keys(hw.get().pots)[0]!;
      const before = hw.get().pots[id]!.hum;
      svc.tickNow();
      expect(hw.get().pots[id]!.hum).toBe(before);
    });

    it('does NOT drain tanks (MQTT pilote)', () => {
      const before = hw.get().tanks.T01!.vol;
      svc.tickNow();
      expect(hw.get().tanks.T01!.vol).toBe(before);
    });

    it('still advances master.uptime + lastWater counters', () => {
      const id = Object.keys(hw.get().pots)[0]!;
      const uptimeBefore = hw.get().master.uptime;
      const lwBefore = hw.get().pots[id]!.lastWater;
      svc.tickNow();
      expect(hw.get().master.uptime).toBe(uptimeBefore + 1);
      expect(hw.get().pots[id]!.lastWater).toBe(lwBefore + 1);
    });
  });

  describe('Safety auto-recovery', () => {
    it('exits THERMAL_LOCKOUT when cooling timer reaches 0', () => {
      hw.update((s) => ({
        ...s,
        safety: {
          ...s.safety,
          state: 'THERMAL_LOCKOUT',
          reason: 'T° > 58°C',
          thermalCoolingRemainS: 2,
          relayArmed: false,
          pumpEnabled: false,
        },
      }));
      svc.tickNow(); // -1s → 1
      expect(hw.get().safety.state).toBe('THERMAL_LOCKOUT');
      svc.tickNow(); // -1s → 0 → recovery
      expect(hw.get().safety.state).toBe('NORMAL');
      expect(hw.get().safety.relayArmed).toBe(true);
      expect(hw.get().safety.pumpEnabled).toBe(true);
    });
  });

  describe('log events', () => {
    it('emits a log event every 4 ticks', () => {
      svc.tickNow();
      svc.tickNow();
      svc.tickNow();
      const before = log.get().entries.length;
      svc.tickNow(); // 4th tick → log
      expect(log.get().entries.length).toBeGreaterThan(before);
    });
  });

  describe('reset()', () => {
    it('zeros internal tick counter (lastSeq increment resumes from tick 3)', () => {
      svc.tickNow();
      svc.tickNow();
      svc.tickNow(); // lastSeq +1
      const beforeReset = hw.get().pairing.lastSeq;
      svc.reset();
      svc.tickNow(); // 1
      svc.tickNow(); // 2
      expect(hw.get().pairing.lastSeq).toBe(beforeReset);
      svc.tickNow(); // 3
      expect(hw.get().pairing.lastSeq).toBe(beforeReset + 1);
    });
  });
});

describe('classifyPotState', () => {
  const profile = {
    name: 'HERB_MED',
    label: 'x',
    dry: 30,
    ok: 45,
    vol: 80,
    cooldown: 7200,
    potCount: 0,
    k: 0.1,
  } as const;

  it('returns crit when hum < dry', () => {
    expect(classifyPotState(20, profile)).toBe('crit');
  });
  it('returns dry when dry <= hum < ok', () => {
    expect(classifyPotState(40, profile)).toBe('dry');
  });
  it('returns ok when ok <= hum < ok+15', () => {
    expect(classifyPotState(50, profile)).toBe('ok');
  });
  it('returns high when hum >= ok+15', () => {
    expect(classifyPotState(70, profile)).toBe('high');
  });
  it('returns ok when profile is undefined', () => {
    expect(classifyPotState(50, undefined)).toBe('ok');
  });
});
