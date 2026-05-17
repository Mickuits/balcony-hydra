import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UpdateChecker, type UpdateAvailableDetail } from './update-checker';

function mockResponse(data: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => data,
  } as Response;
}

describe('UpdateChecker', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let checker: UpdateChecker;

  beforeEach(() => {
    fetchSpy = vi.fn();
    checker = new UpdateChecker({
      currentBuildId: 'build-A',
      fetchFn: fetchSpy as unknown as typeof fetch,
    });
  });

  describe('check()', () => {
    it('emits updateAvailable when remote buildId differs', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ buildId: 'build-B', builtAt: '2026-05-17T18:00' }));
      const spy = vi.fn();
      checker.addEventListener('updateAvailable', (e) =>
        spy((e as CustomEvent<UpdateAvailableDetail>).detail)
      );

      await checker.check();
      expect(spy).toHaveBeenCalledWith({
        currentBuildId: 'build-A',
        remoteBuildId: 'build-B',
        remoteBuiltAt: '2026-05-17T18:00',
      });
    });

    it('does NOT emit when buildIds match', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ buildId: 'build-A', builtAt: 'x' }));
      const spy = vi.fn();
      checker.addEventListener('updateAvailable', spy);
      await checker.check();
      expect(spy).not.toHaveBeenCalled();
    });

    it('emits ONCE — second check with new build is silent until reset', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ buildId: 'build-B', builtAt: 'x' }));
      const spy = vi.fn();
      checker.addEventListener('updateAvailable', spy);
      await checker.check();
      await checker.check();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('reset() re-arms notification', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ buildId: 'build-B', builtAt: 'x' }));
      const spy = vi.fn();
      checker.addEventListener('updateAvailable', spy);
      await checker.check();
      checker.reset();
      await checker.check();
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('silently skips when response.ok is false', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ buildId: 'build-B' }, false));
      const spy = vi.fn();
      checker.addEventListener('updateAvailable', spy);
      await checker.check();
      expect(spy).not.toHaveBeenCalled();
    });

    it('silently skips on fetch error (network down)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      fetchSpy.mockRejectedValue(new Error('network'));
      const spy = vi.fn();
      checker.addEventListener('updateAvailable', spy);
      await checker.check();
      expect(spy).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('skips when remote payload missing buildId field', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ wrong: 'shape' }));
      const spy = vi.fn();
      checker.addEventListener('updateAvailable', spy);
      await checker.check();
      expect(spy).not.toHaveBeenCalled();
    });

    it('passes cache: no-store to fetch', async () => {
      fetchSpy.mockResolvedValue(mockResponse({ buildId: 'build-A' }));
      await checker.check();
      expect(fetchSpy).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
    });
  });

  describe('start() / stop()', () => {
    it('start triggers an immediate check + interval polling', async () => {
      vi.useFakeTimers();
      fetchSpy.mockResolvedValue(mockResponse({ buildId: 'build-A' }));
      const userSetInterval = vi.fn().mockReturnValue(42);
      const userClearInterval = vi.fn();
      checker = new UpdateChecker({
        currentBuildId: 'build-A',
        fetchFn: fetchSpy as unknown as typeof fetch,
        setIntervalFn: userSetInterval as unknown as typeof setInterval,
        clearIntervalFn: userClearInterval as unknown as typeof clearInterval,
      });
      checker.start();
      await Promise.resolve();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(userSetInterval).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('start is idempotent', async () => {
      const userSetInterval = vi.fn().mockReturnValue(42);
      checker = new UpdateChecker({
        currentBuildId: 'A',
        fetchFn: fetchSpy as unknown as typeof fetch,
        setIntervalFn: userSetInterval as unknown as typeof setInterval,
      });
      fetchSpy.mockResolvedValue(mockResponse({ buildId: 'A' }));
      checker.start();
      checker.start();
      // setInterval seul devrait être appelé 1×
      expect(userSetInterval).toHaveBeenCalledTimes(1);
    });
  });
});
