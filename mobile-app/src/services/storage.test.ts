import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService, STORAGE_KEYS } from './storage';

describe('StorageService', () => {
  let svc: StorageService;

  beforeEach(() => {
    svc = new StorageService();
    localStorage.clear();
  });

  describe('get', () => {
    it('returns fallback when key missing', () => {
      expect(svc.get(STORAGE_KEYS.MQTT_CONFIG, { default: true })).toEqual({ default: true });
    });

    it('returns parsed JSON when key present', () => {
      localStorage.setItem(STORAGE_KEYS.MQTT_CONFIG, JSON.stringify({ url: 'ws://x' }));
      expect(svc.get(STORAGE_KEYS.MQTT_CONFIG, { url: '' })).toEqual({ url: 'ws://x' });
    });

    it('returns fallback when JSON corrupted', () => {
      localStorage.setItem(STORAGE_KEYS.MQTT_CONFIG, 'not valid json {{');
      expect(svc.get(STORAGE_KEYS.MQTT_CONFIG, { url: 'fallback' })).toEqual({ url: 'fallback' });
    });

    it('preserves null in JSON', () => {
      localStorage.setItem(STORAGE_KEYS.REST_CONFIG, JSON.stringify(null));
      expect(svc.get(STORAGE_KEYS.REST_CONFIG, 'def')).toBeNull();
    });
  });

  describe('set', () => {
    it('writes and returns true', () => {
      const ok = svc.set(STORAGE_KEYS.MQTT_CONFIG, { url: 'ws://x', port: 9001 });
      expect(ok).toBe(true);
      expect(localStorage.getItem(STORAGE_KEYS.MQTT_CONFIG)).toBe('{"url":"ws://x","port":9001}');
    });

    it('overwrites existing', () => {
      svc.set(STORAGE_KEYS.MQTT_CONFIG, { v: 1 });
      svc.set(STORAGE_KEYS.MQTT_CONFIG, { v: 2 });
      expect(svc.get(STORAGE_KEYS.MQTT_CONFIG, {})).toEqual({ v: 2 });
    });
  });

  describe('remove', () => {
    it('removes key', () => {
      svc.set(STORAGE_KEYS.MQTT_CONFIG, { x: 1 });
      svc.remove(STORAGE_KEYS.MQTT_CONFIG);
      expect(localStorage.getItem(STORAGE_KEYS.MQTT_CONFIG)).toBeNull();
    });

    it('no-op when absent', () => {
      expect(() => svc.remove(STORAGE_KEYS.MQTT_CONFIG)).not.toThrow();
    });
  });

  describe('isAvailable', () => {
    it('returns true in jsdom', () => {
      expect(svc.isAvailable()).toBe(true);
    });
  });
});
