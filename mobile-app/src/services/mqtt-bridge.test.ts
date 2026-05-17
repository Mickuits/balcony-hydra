import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MqttBridge, type MqttLikeClient, type MqttConnectFn } from './mqtt-bridge';
import { HardwareStore } from '@/stores/hardware.store';
import { LiveLogStore } from '@/stores/live-log.store';
import { StorageService, STORAGE_KEYS } from './storage';

/**
 * Fake MQTT client — capture les listeners et expose `emit()` pour
 * piloter les transitions FSM dans les tests.
 */
class FakeMqttClient implements MqttLikeClient {
  private listeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();
  public published: Array<{ topic: string; msg: string }> = [];
  public subscribed: string[] = [];
  public ended = false;

  on(event: string, cb: (...args: unknown[]) => void): this {
    const arr = this.listeners.get(event) ?? [];
    arr.push(cb);
    this.listeners.set(event, arr);
    return this;
  }
  subscribe(topics: string[] | string, cb?: (err: Error | null) => void): this {
    const arr = Array.isArray(topics) ? topics : [topics];
    this.subscribed.push(...arr);
    cb?.(null);
    return this;
  }
  publish(topic: string, msg: string | Buffer): this {
    this.published.push({ topic, msg: typeof msg === 'string' ? msg : msg.toString('utf-8') });
    return this;
  }
  end(_force?: boolean): this {
    this.ended = true;
    return this;
  }
  removeAllListeners(): void {
    this.listeners.clear();
  }
  emit(event: string, ...args: unknown[]): void {
    const arr = this.listeners.get(event);
    if (!arr) return;
    for (const cb of [...arr]) cb(...args);
  }
}

describe('MqttBridge', () => {
  let bridge: MqttBridge;
  let hardware: HardwareStore;
  let liveLog: LiveLogStore;
  let storage: StorageService;
  let fakeClient: FakeMqttClient;
  let connectFn: MqttConnectFn;

  beforeEach(() => {
    localStorage.clear();
    hardware = new HardwareStore();
    liveLog = new LiveLogStore(20);
    storage = new StorageService();
    fakeClient = new FakeMqttClient();
    connectFn = vi.fn(() => fakeClient) as unknown as MqttConnectFn;
    bridge = new MqttBridge({ hardware, liveLog, storage, connectFn });
  });

  afterEach(() => {
    bridge.dispose();
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('starts in mock state', () => {
      expect(bridge.state).toBe('mock');
      expect(bridge.cfg).toBeNull();
      expect(bridge.isLive()).toBe(false);
    });
  });

  describe('init() from storage', () => {
    it('no-op when no stored config', () => {
      bridge.init();
      expect(bridge.state).toBe('mock');
      expect(connectFn).not.toHaveBeenCalled();
    });

    it('restores config and triggers connect', async () => {
      storage.set(STORAGE_KEYS.MQTT_CONFIG, { url: 'ws://broker:9001', user: 'u', pass: 'p' });
      bridge.init();
      await flushMicrotasks();
      expect(bridge.cfg?.url).toBe('ws://broker:9001');
      expect(connectFn).toHaveBeenCalledOnce();
      expect(bridge.state).toBe('connecting');
    });
  });

  describe('setConfig + connect lifecycle', () => {
    it('transitions to connected on connect event', async () => {
      bridge.setConfig({ url: 'ws://h', user: '', pass: '' });
      await flushMicrotasks();
      expect(bridge.state).toBe('connecting');
      fakeClient.emit('connect');
      expect(bridge.state).toBe('connected');
      expect(bridge.isLive()).toBe(true);
    });

    it('subscribes to 3 topics on connect', async () => {
      bridge.setConfig({ url: 'ws://h', user: '', pass: '' });
      await flushMicrotasks();
      fakeClient.emit('connect');
      expect(fakeClient.subscribed).toEqual(
        expect.arrayContaining(['hydra/sensors', 'hydra/pump', 'hydra/alerts'])
      );
    });

    it('persists config to localStorage', async () => {
      bridge.setConfig({ url: 'ws://h', user: 'admin', pass: 'sec' });
      expect(storage.get(STORAGE_KEYS.MQTT_CONFIG, null)).toEqual({
        url: 'ws://h',
        user: 'admin',
        pass: 'sec',
      });
    });

    it('emits statechange event', async () => {
      const spy = vi.fn();
      bridge.addEventListener('statechange', (e) => spy((e as CustomEvent).detail));
      bridge.setConfig({ url: 'ws://h', user: '', pass: '' });
      await flushMicrotasks();
      expect(spy).toHaveBeenCalledWith('connecting');
      fakeClient.emit('connect');
      expect(spy).toHaveBeenCalledWith('connected');
    });
  });

  describe('error handling', () => {
    it('on error during connecting → state error', async () => {
      bridge.setConfig({ url: 'ws://h', user: '', pass: '' });
      await flushMicrotasks();
      fakeClient.emit('error', new Error('boom'));
      expect(bridge.state).toBe('error');
      expect(bridge.lastError).toBe('boom');
    });

    it('on close after connected → state error + schedule reconnect', async () => {
      vi.useFakeTimers();
      bridge.setConfig({ url: 'ws://h', user: '', pass: '' });
      await flushMicrotasks();
      fakeClient.emit('connect');
      expect(bridge.state).toBe('connected');
      fakeClient.emit('close');
      expect(bridge.state).toBe('error');
      // Reconnect avec backoff 2s
      vi.advanceTimersByTime(2100);
      await flushMicrotasks();
      expect(connectFn).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });
  });

  describe('backoff exponential', () => {
    it('uses 2s → 4s → 8s schedule', async () => {
      vi.useFakeTimers();
      bridge.setConfig({ url: 'ws://h', user: '', pass: '' });
      await flushMicrotasks();
      const callCount = () =>
        (connectFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
      expect(callCount()).toBe(1);

      // 1ère panne → reconnect dans 2s
      fakeClient.emit('error', new Error('e1'));
      fakeClient.emit('close');
      vi.advanceTimersByTime(2100);
      await flushMicrotasks();
      expect(callCount()).toBe(2);

      // 2ème panne → reconnect dans 4s
      fakeClient.emit('error', new Error('e2'));
      fakeClient.emit('close');
      vi.advanceTimersByTime(2100);
      await flushMicrotasks();
      expect(callCount()).toBe(2); // pas encore (4s pas atteint)
      vi.advanceTimersByTime(2100);
      await flushMicrotasks();
      expect(callCount()).toBe(3);

      vi.useRealTimers();
    });
  });

  describe('message dispatching', () => {
    beforeEach(async () => {
      bridge.setConfig({ url: 'ws://h', user: '', pass: '' });
      await flushMicrotasks();
      fakeClient.emit('connect');
    });

    it('dispatches hydra/sensors → HardwareStore.updateFromMqttSensors', () => {
      const payload = {
        avgMoisture: 55,
        tankLevel: 80,
        temperature: 23.4,
        humidity: 60,
        pressure: 1015,
      };
      fakeClient.emit('message', 'hydra/sensors', JSON.stringify(payload));
      expect(hardware.get().master.avgHum).toBe(55);
    });

    it('dispatches hydra/pump → HardwareStore.updateFromMqttPump', () => {
      const payload = {
        balcon: {
          state: 1,
          stateLabel: 'RUN',
          running: true,
          runningForS: 10,
          avgMoisture: 40,
          totalCycles: 1,
          lastCurrent: 800,
          failsafe: false,
          lastStopReason: 0,
        },
        interieur: {
          state: 0,
          stateLabel: 'IDLE',
          running: false,
          runningForS: 0,
          avgMoisture: 70,
          totalCycles: 0,
          lastCurrent: 0,
          failsafe: false,
          lastStopReason: 0,
        },
      };
      fakeClient.emit('message', 'hydra/pump', JSON.stringify(payload));
      expect(hardware.get().slaves.SLAVE?.pumpRunning).toBe(true);
      expect(hardware.get().master.pumpRunning).toBe(false);
    });

    it('logs alert message on hydra/alerts', () => {
      const payload = { alert: 'tank low', timestamp: Date.now() };
      fakeClient.emit('message', 'hydra/alerts', JSON.stringify(payload));
      const last = liveLog.get().entries.at(-1);
      expect(last?.msg).toContain('tank low');
      expect(last?.tag).toBe('warn');
    });

    it('handles invalid JSON gracefully', () => {
      const initialAvg = hardware.get().master.avgHum;
      fakeClient.emit('message', 'hydra/sensors', '{ broken json');
      expect(hardware.get().master.avgHum).toBe(initialAvg);
    });

    it('rejects malformed payloads (missing fields)', () => {
      const initialAvg = hardware.get().master.avgHum;
      fakeClient.emit('message', 'hydra/sensors', JSON.stringify({ avgMoisture: 99 }));
      expect(hardware.get().master.avgHum).toBe(initialAvg);
    });

    it('handles Uint8Array payload (real mqtt.js behavior)', () => {
      const payload = {
        avgMoisture: 42,
        tankLevel: 50,
        temperature: 20,
        humidity: 50,
        pressure: 1000,
      };
      const bytes = new TextEncoder().encode(JSON.stringify(payload));
      fakeClient.emit('message', 'hydra/sensors', bytes);
      expect(hardware.get().master.avgHum).toBe(42);
    });

    it('rejects oversize payload (>1 MB) — DoS protection', () => {
      const initialAvg = hardware.get().master.avgHum;
      const huge = 'x'.repeat(2 * 1024 * 1024);
      fakeClient.emit('message', 'hydra/sensors', huge);
      expect(hardware.get().master.avgHum).toBe(initialAvg);
      const last = liveLog.get().entries.at(-1);
      expect(last?.msg).toMatch(/trop volumineux/);
    });

    it('rejects __proto__ pollution attempt', () => {
      const initialAvg = hardware.get().master.avgHum;
      const evil =
        '{"__proto__":{"polluted":true},"avgMoisture":99,"tankLevel":50,"temperature":20,"humidity":50,"pressure":1000}';
      fakeClient.emit('message', 'hydra/sensors', evil);
      expect(hardware.get().master.avgHum).toBe(initialAvg);
      const last = liveLog.get().entries.at(-1);
      expect(last?.msg).toMatch(/structurellement non-sûr/);
    });

    it('sanitizes alert message (strips control chars)', () => {
      const payload = { alert: 'tank\x00\x07low\x1Fcrit', timestamp: Date.now() };
      fakeClient.emit('message', 'hydra/alerts', JSON.stringify(payload));
      const last = liveLog.get().entries.at(-1);
      expect(last?.msg).toContain('tanklowcrit');
      expect(last?.msg).not.toContain('\x00');
    });

    it('truncates alert message to 200 chars max', () => {
      const longAlert = 'A'.repeat(500);
      const payload = { alert: longAlert, timestamp: Date.now() };
      fakeClient.emit('message', 'hydra/alerts', JSON.stringify(payload));
      const last = liveLog.get().entries.at(-1);
      // 'Alerte: ' (8 chars) + 200 chars max
      expect((last?.msg ?? '').length).toBeLessThanOrEqual(8 + 200);
    });
  });

  describe('stop()', () => {
    it('returns to mock + closes client', async () => {
      bridge.setConfig({ url: 'ws://h', user: '', pass: '' });
      await flushMicrotasks();
      fakeClient.emit('connect');
      bridge.stop();
      expect(bridge.state).toBe('mock');
      expect(fakeClient.ended).toBe(true);
    });
  });

  describe('forceReconnect()', () => {
    it('triggers fresh connect attempt', async () => {
      bridge.setConfig({ url: 'ws://h', user: '', pass: '' });
      await flushMicrotasks();
      const before = (connectFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
      bridge.forceReconnect();
      await flushMicrotasks();
      const after = (connectFn as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
      expect(after).toBe(before + 1);
    });

    it('no-op when no config', () => {
      bridge.forceReconnect();
      expect(connectFn).not.toHaveBeenCalled();
    });
  });

  describe('dispose()', () => {
    it('prevents further reconnects', async () => {
      vi.useFakeTimers();
      bridge.setConfig({ url: 'ws://h', user: '', pass: '' });
      await flushMicrotasks();
      fakeClient.emit('connect');
      fakeClient.emit('close');
      bridge.dispose();
      vi.advanceTimersByTime(60000);
      await flushMicrotasks();
      // After dispose: state mock, no further connect
      expect(bridge.state).toBe('mock');
      vi.useRealTimers();
    });
  });
});

/** Flush microtask queue (utile pour les async/await dans connect()). */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
