import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorTracking } from './error-tracking';
import { StorageService } from './storage';

describe('ErrorTracking', () => {
  let storage: StorageService;
  let target: EventTarget;
  let tracker: ErrorTracking;

  beforeEach(() => {
    localStorage.clear();
    storage = new StorageService();
    target = new EventTarget();
    tracker = new ErrorTracking({
      storage,
      buildId: 'test-build',
      maxEntries: 5,
      errorTarget: target,
    });
  });

  describe('capture()', () => {
    it('appends an entry with timestamp + buildId', () => {
      const entry = tracker.capture({
        severity: 'error',
        source: 'test',
        message: 'something broke',
      });
      expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(entry.buildId).toBe('test-build');
      expect(entry.message).toBe('something broke');
    });

    it('respects ring buffer maxEntries', () => {
      for (let i = 0; i < 10; i++) {
        tracker.capture({ severity: 'info', source: 's', message: `msg${i}` });
      }
      const entries = tracker.getEntries();
      expect(entries).toHaveLength(5);
      expect(entries[0]?.message).toBe('msg5');
      expect(entries[4]?.message).toBe('msg9');
    });

    it('sanitizes message (strip control chars, truncate)', () => {
      const longMsg = 'A'.repeat(1000);
      const entry = tracker.capture({
        severity: 'warn',
        source: 's\x00with\x01ctrl',
        message: longMsg + '\x07ctrl',
      });
      expect(entry.message.length).toBeLessThanOrEqual(500);
      // eslint-disable-next-line no-control-regex
      expect(entry.source).not.toMatch(/\x00/);
    });

    it('emits "capture" event', () => {
      const spy = vi.fn();
      tracker.addEventListener('capture', (e) => spy((e as CustomEvent).detail));
      tracker.capture({ severity: 'error', source: 's', message: 'm' });
      expect(spy).toHaveBeenCalledOnce();
    });

    it('persists entries to localStorage', () => {
      tracker.capture({ severity: 'error', source: 's', message: 'persisted' });
      const stored = storage.get<unknown[]>('hydra-error-log' as never, []);
      expect(stored).toHaveLength(1);
    });
  });

  describe('captureException()', () => {
    it('extracts name + message + stack from Error', () => {
      const err = new TypeError('Cannot read foo');
      const entry = tracker.captureException(err, 'screen:detail');
      expect(entry.source).toBe('TypeError');
      expect(entry.message).toBe('Cannot read foo');
      expect(entry.stack).toBeDefined();
      expect(entry.context).toBe('screen:detail');
    });

    it('handles non-Error values', () => {
      const entry = tracker.captureException('string error');
      expect(entry.message).toBe('string error');
    });
  });

  describe('install() / uninstall()', () => {
    it('captures errors dispatched on target', () => {
      tracker.install();
      const event = new ErrorEvent('error', {
        message: 'boom',
        filename: 'a.js',
        error: new Error('boom'),
      });
      target.dispatchEvent(event);
      const entries = tracker.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.message).toBe('boom');
      expect(entries[0]?.context).toBe('global');
    });

    it('captures unhandledrejection', () => {
      tracker.install();
      // jsdom n'a pas PromiseRejectionEvent — utilisons CustomEvent avec reason
      const event = new Event('unhandledrejection') as Event & { reason?: unknown };
      (event as { reason: unknown }).reason = new Error('rejected');
      target.dispatchEvent(event);
      const entries = tracker.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.message).toBe('rejected');
      expect(entries[0]?.context).toBe('promise');
    });

    it('uninstall removes listeners', () => {
      tracker.install();
      tracker.uninstall();
      target.dispatchEvent(new ErrorEvent('error', { message: 'late' }));
      expect(tracker.getEntries()).toHaveLength(0);
    });

    it('install is idempotent', () => {
      tracker.install();
      tracker.install();
      target.dispatchEvent(new ErrorEvent('error', { message: 'once' }));
      // Si install était appelé 2x, l'event serait capturé 2x
      expect(tracker.getEntries()).toHaveLength(1);
    });
  });

  describe('clear()', () => {
    it('removes all entries + emits "clear"', () => {
      tracker.capture({ severity: 'error', source: 's', message: 'm' });
      const spy = vi.fn();
      tracker.addEventListener('clear', spy);
      tracker.clear();
      expect(tracker.getEntries()).toHaveLength(0);
      expect(spy).toHaveBeenCalledOnce();
    });
  });

  describe('exportJson()', () => {
    it('produces pretty JSON parseable back', () => {
      tracker.capture({ severity: 'error', source: 's', message: 'a' });
      tracker.capture({ severity: 'warn', source: 's', message: 'b' });
      const json = tracker.exportJson();
      const parsed = JSON.parse(json);
      expect(parsed.buildId).toBe('test-build');
      expect(parsed.entries).toHaveLength(2);
    });
  });

  describe('persistence restore', () => {
    it('restores entries from previous session', () => {
      tracker.capture({ severity: 'error', source: 's', message: 'before reload' });
      // Simule un reload : nouvelle instance lisant le même storage
      const restored = new ErrorTracking({
        storage,
        buildId: 'test-build',
        maxEntries: 5,
        errorTarget: new EventTarget(),
      });
      const entries = restored.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.message).toBe('before reload');
    });

    it('truncates restored entries to maxEntries', () => {
      // Persist 20 entries via le tracker à 5 max
      for (let i = 0; i < 20; i++) {
        tracker.capture({ severity: 'info', source: 's', message: `m${i}` });
      }
      const restored = new ErrorTracking({
        storage,
        buildId: 'test-build',
        maxEntries: 3,
        errorTarget: new EventTarget(),
      });
      expect(restored.getEntries()).toHaveLength(3);
    });
  });
});
