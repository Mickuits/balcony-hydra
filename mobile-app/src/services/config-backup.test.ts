import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigBackupService } from './config-backup';
import { StorageService, STORAGE_KEYS } from './storage';

describe('ConfigBackupService', () => {
  let svc: ConfigBackupService;
  let storage: StorageService;

  beforeEach(() => {
    localStorage.clear();
    storage = new StorageService();
    svc = new ConfigBackupService({ storage, buildId: 'v4.3-test' });
  });

  describe('build()', () => {
    it('includes only known keys (whitelist)', async () => {
      storage.set(STORAGE_KEYS.MQTT_CONFIG, { url: 'ws://h' });
      storage.set(STORAGE_KEYS.REST_CONFIG, { url: 'http://h', token: 'tok' });
      // Une clé NON listée → ne doit pas apparaître
      localStorage.setItem('hydra-not-in-backup', 'sensitive');

      const backup = await svc.build();
      expect(backup.entries[STORAGE_KEYS.MQTT_CONFIG]).toBeDefined();
      expect(backup.entries[STORAGE_KEYS.REST_CONFIG]).toBeDefined();
      expect(backup.entries['hydra-not-in-backup']).toBeUndefined();
    });

    it('produces version + exportedAt + buildId', async () => {
      const backup = await svc.build();
      expect(backup.version).toBe(1);
      expect(backup.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(backup.buildId).toBe('v4.3-test');
    });

    it('computes SHA-256 checksum over entries', async () => {
      storage.set(STORAGE_KEYS.MQTT_CONFIG, { url: 'ws://h' });
      const backup = await svc.build();
      expect(backup.checksum).toMatch(/^[0-9a-f]{64}$/);
    });

    it('empty config produces backup with no entries', async () => {
      const backup = await svc.build();
      expect(Object.keys(backup.entries)).toHaveLength(0);
    });
  });

  describe('exportJson()', () => {
    it('returns pretty-printed JSON parseable back', async () => {
      storage.set(STORAGE_KEYS.MQTT_CONFIG, { url: 'ws://h' });
      const json = await svc.exportJson();
      expect(json).toContain('\n  '); // indent
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe(1);
    });
  });

  describe('parse()', () => {
    it('rejects invalid JSON', async () => {
      await expect(svc.parse('{ broken')).rejects.toThrow(/JSON invalide/);
    });

    it('rejects payload with __proto__ pollution (raw JSON string)', async () => {
      // JSON.stringify drops __proto__, on doit le construire en string brute
      const evil =
        '{"__proto__":{"polluted":true},"version":1,"exportedAt":"x","buildId":"x","entries":{},"checksum":"x"}';
      await expect(svc.parse(evil)).rejects.toThrow(/non sûre/);
    });

    it('rejects backup with missing fields', async () => {
      const incomplete = JSON.stringify({ version: 1 });
      await expect(svc.parse(incomplete)).rejects.toThrow(/Schéma/);
    });

    it('rejects version mismatch', async () => {
      const exported = await svc.exportJson();
      const tampered = exported.replace('"version": 1', '"version": 999');
      await expect(svc.parse(tampered)).rejects.toThrow(/Version/);
    });

    it('rejects checksum mismatch (file tampering)', async () => {
      storage.set(STORAGE_KEYS.MQTT_CONFIG, { url: 'ws://h' });
      const exported = await svc.exportJson();
      // Modifie le contenu sans recomputer le checksum
      const tampered = exported.replace('ws://h', 'ws://EVIL');
      await expect(svc.parse(tampered)).rejects.toThrow(/Checksum invalide/);
    });

    it('accepts a valid backup', async () => {
      storage.set(STORAGE_KEYS.MQTT_CONFIG, { url: 'ws://h' });
      const json = await svc.exportJson();
      const parsed = await svc.parse(json);
      expect(parsed.version).toBe(1);
      expect(parsed.entries[STORAGE_KEYS.MQTT_CONFIG]).toBeDefined();
    });
  });

  describe('apply()', () => {
    it('writes entries to localStorage', async () => {
      storage.set(STORAGE_KEYS.MQTT_CONFIG, { url: 'ws://source' });
      const backup = await svc.build();
      localStorage.clear();

      const count = svc.apply(backup);
      expect(count).toBe(1);
      expect(storage.get(STORAGE_KEYS.MQTT_CONFIG, null)).toEqual({ url: 'ws://source' });
    });

    it('replace=false merges (keeps non-backup keys)', async () => {
      storage.set(STORAGE_KEYS.MQTT_CONFIG, { url: 'ws://old' });
      const backup = await svc.build();
      storage.set(STORAGE_KEYS.REST_CONFIG, { url: 'http://kept', token: 'X' });

      svc.apply(backup); // merge
      expect(storage.get(STORAGE_KEYS.REST_CONFIG, null)).toEqual({
        url: 'http://kept',
        token: 'X',
      });
    });

    it('replace=true clears missing keys', async () => {
      const backup = await svc.build(); // empty entries
      storage.set(STORAGE_KEYS.REST_CONFIG, { url: 'http://to-clear', token: 'X' });

      svc.apply(backup, true);
      expect(storage.get(STORAGE_KEYS.REST_CONFIG, null)).toBeNull();
    });
  });

  describe('importJson() roundtrip', () => {
    it('export → import restores identical state', async () => {
      storage.set(STORAGE_KEYS.MQTT_CONFIG, { url: 'ws://h', user: 'u', pass: 'p' });
      storage.set(STORAGE_KEYS.REST_CONFIG, { url: 'http://h', token: 'TOK' });

      const json = await svc.exportJson();
      localStorage.clear();

      const count = await svc.importJson(json);
      expect(count).toBe(2);
      expect(storage.get(STORAGE_KEYS.MQTT_CONFIG, null)).toEqual({
        url: 'ws://h',
        user: 'u',
        pass: 'p',
      });
      expect(storage.get(STORAGE_KEYS.REST_CONFIG, null)).toEqual({
        url: 'http://h',
        token: 'TOK',
      });
    });
  });

  describe('downloadFile()', () => {
    it('creates blob URL + clicks anchor + cleanup', async () => {
      // jsdom n'implémente pas URL.createObjectURL — stub manuel
      const createSpy = vi.fn(() => 'blob:mock-url');
      const revokeSpy = vi.fn();
      const originalCreate = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      Object.defineProperty(URL, 'createObjectURL', { value: createSpy, configurable: true });
      Object.defineProperty(URL, 'revokeObjectURL', { value: revokeSpy, configurable: true });

      const clickSpy = vi.fn();
      const origCreate = document.createElement.bind(document);
      const docSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreate(tag);
        if (tag === 'a') {
          (el as HTMLAnchorElement).click = clickSpy as never;
        }
        return el;
      });

      try {
        await svc.downloadFile('test.json');
        expect(createSpy).toHaveBeenCalled();
        expect(clickSpy).toHaveBeenCalled();
        await new Promise((r) => setTimeout(r, 10));
        expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url');
      } finally {
        docSpy.mockRestore();
        Object.defineProperty(URL, 'createObjectURL', {
          value: originalCreate,
          configurable: true,
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
          value: originalRevoke,
          configurable: true,
        });
      }
    });
  });
});
