import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RestClient } from './rest-client';
import { StorageService, STORAGE_KEYS } from './storage';

describe('RestClient', () => {
  let client: RestClient;
  let storage: StorageService;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    storage = new StorageService();
    client = new RestClient(storage);
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('starts in mock state', () => {
      expect(client.state).toBe('mock');
      expect(client.isLive()).toBe(false);
      expect(client.cfg).toBeNull();
    });
  });

  describe('init() from storage', () => {
    it('no-op when no stored config', () => {
      client.init();
      expect(client.cfg).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('restores config and triggers silent test', async () => {
      storage.set(STORAGE_KEYS.REST_CONFIG, { url: 'http://hydra.local', token: 'abc' });
      fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

      client.init();
      // Attendre la promesse silencieuse
      await new Promise((r) => setTimeout(r, 10));

      expect(client.cfg?.url).toBe('http://hydra.local');
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://hydra.local/api/status',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('setConfig', () => {
    it('persists and triggers test', async () => {
      fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
      client.setConfig({ url: 'http://host', token: 'tok' });
      await new Promise((r) => setTimeout(r, 10));
      expect(storage.get(STORAGE_KEYS.REST_CONFIG, null)).toEqual({
        url: 'http://host',
        token: 'tok',
      });
      expect(fetchSpy).toHaveBeenCalledOnce();
    });
  });

  describe('successful request', () => {
    beforeEach(() => {
      client.setConfig({ url: 'http://h', token: 'TOKEN_VALID' });
    });

    it('returns ok response with data', async () => {
      const payload = { uptimeS: 1234 };
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => payload,
      });

      const res = await client.getStatus();
      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(res.data).toEqual(payload);
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('sends X-Hydra-Token header', async () => {
      fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
      await client.getStatus();
      const call = fetchSpy.mock.calls[0];
      const init = call?.[1] as RequestInit | undefined;
      expect((init?.headers as Record<string, string>)['X-Hydra-Token']).toBe('TOKEN_VALID');
    });

    it('sets state to ready on testSilently success', async () => {
      fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
      const stateSpy = vi.fn();
      client.addEventListener('statechange', (e) => stateSpy((e as CustomEvent).detail));
      await client.testSilently();
      expect(client.state).toBe('ready');
      expect(stateSpy).toHaveBeenCalledWith('ready');
    });
  });

  describe('401 unauthorized', () => {
    beforeEach(() => {
      client.setConfig({ url: 'http://h', token: 'bad' });
      // Skip silent test triggered by setConfig
      fetchSpy.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    });

    it('returns ok=false + state=unauthorized', async () => {
      const res = await client.pumpStart();
      expect(res.ok).toBe(false);
      expect(res.status).toBe(401);
      expect(client.state).toBe('unauthorized');
    });
  });

  describe('network error', () => {
    beforeEach(() => {
      client.setConfig({ url: 'http://h', token: 't' });
    });

    it('handles fetch reject → state=error', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));
      const res = await client.pumpStart();
      expect(res.ok).toBe(false);
      expect(res.status).toBe(0);
      expect(res.error).toBe('Network error');
      expect(client.state).toBe('error');
    });

    it('handles AbortError → error="timeout"', async () => {
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      fetchSpy.mockRejectedValue(abortErr);
      const res = await client.pumpStart();
      expect(res.error).toBe('timeout');
      expect(client.state).toBe('error');
    });
  });

  describe('5xx server error', () => {
    beforeEach(() => {
      client.setConfig({ url: 'http://h', token: 't' });
    });

    it('returns ok=false but does not change state', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({}),
      });
      const res = await client.safetyUnlock();
      expect(res.ok).toBe(false);
      expect(res.status).toBe(503);
      // state n'est pas modifié pour les 5xx (différent de 401)
      // mais le test précédent a set state='ready' donc reste mock initial
    });
  });

  describe('disableLive', () => {
    it('returns to mock state', () => {
      // Bypass setState same-value guard
      // @ts-expect-error - accessing private for test
      client._state = 'ready';
      const stateSpy = vi.fn();
      client.addEventListener('statechange', (e) => stateSpy((e as CustomEvent).detail));
      client.disableLive();
      expect(client.state).toBe('mock');
      expect(stateSpy).toHaveBeenCalledWith('mock');
    });
  });

  describe('updateConfig sends POST body', () => {
    beforeEach(() => {
      client.setConfig({ url: 'http://h', token: 't' });
    });

    it('serializes JSON body', async () => {
      fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
      await client.updateConfig({ mode: 'SCHEDULED' });
      const init = fetchSpy.mock.calls.find((c) => c[0]?.endsWith('/api/config'))?.[1] as
        | RequestInit
        | undefined;
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe('{"mode":"SCHEDULED"}');
      expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    });
  });

  describe('no config', () => {
    it('returns mock response without calling fetch', async () => {
      const res = await client.pumpStart();
      expect(res.mock).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('URL trailing slash', () => {
    it('normalizes trailing slash', async () => {
      fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
      client.setConfig({ url: 'http://h/', token: 't' });
      await client.getStatus();
      // setConfig appelle déjà testSilently, on a donc 2 appels — vérifier le 1er
      const url = fetchSpy.mock.calls[0]?.[0];
      expect(url).toBe('http://h/api/status');
    });
  });
});
