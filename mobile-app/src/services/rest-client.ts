/**
 * RestClient — pont vers l'API HTTP du firmware master.
 *
 * Source de vérité : docs/mobile_api_contract.md §1
 *
 * Caractéristiques :
 * - Auth header `X-Hydra-Token` automatique sur tous les requests.
 * - Timeout 4s via AbortController.
 * - Gestion 401/403 → state UNAUTHORIZED.
 * - Gestion 5xx + timeout → state ERROR.
 * - EventTarget pour signaler les changements d'état.
 */
import type {
  ApiConfigUpdate,
  ApiMessageResponse,
  ApiSafetyStatusResponse,
  ApiSensorsResponse,
  ApiStatusResponse,
  RestConfig,
  RestResponse,
  RestState,
} from '@/types';
import { StorageService, STORAGE_KEYS } from './storage';

const TIMEOUT_MS = 4000;

export interface RestClientEvents {
  statechange: CustomEvent<RestState>;
}

export class RestClient extends EventTarget {
  private _state: RestState = 'mock';
  private _cfg: RestConfig | null = null;
  private _lastCallAt = 0;
  private _lastLatencyMs = 0;
  private _lastError: string | null = null;

  constructor(private storage: StorageService = new StorageService()) {
    super();
  }

  get state(): RestState {
    return this._state;
  }

  get cfg(): RestConfig | null {
    return this._cfg;
  }

  get lastCallAt(): number {
    return this._lastCallAt;
  }

  get lastLatencyMs(): number {
    return this._lastLatencyMs;
  }

  get lastError(): string | null {
    return this._lastError;
  }

  isLive(): boolean {
    return this._state === 'ready';
  }

  // ─── lifecycle ─────────────────────────────────────────────
  /**
   * Restore config from storage + auto-test if URL valid.
   */
  init(): void {
    const cfg = this.storage.get<RestConfig | null>(STORAGE_KEYS.REST_CONFIG, null);
    if (cfg?.url) {
      this._cfg = cfg;
      void this.testSilently();
    }
  }

  /**
   * Set new config and persist. Test silently.
   */
  setConfig(cfg: RestConfig): void {
    this._cfg = cfg;
    this.storage.set(STORAGE_KEYS.REST_CONFIG, cfg);
    void this.testSilently();
  }

  /**
   * Test la connectivité via GET /api/status.
   */
  async testSilently(): Promise<boolean> {
    const res = await this._get<ApiStatusResponse>('/api/status');
    if (res.ok) {
      this.setState('ready');
      return true;
    }
    // setState a déjà été fait par _request si 401/error
    return false;
  }

  disableLive(): void {
    this.setState('mock');
  }

  // ─── public API ────────────────────────────────────────────
  async pumpStart(): Promise<RestResponse<ApiMessageResponse>> {
    return this._post<ApiMessageResponse>('/api/pump/start');
  }
  async pumpStop(): Promise<RestResponse<ApiMessageResponse>> {
    return this._post<ApiMessageResponse>('/api/pump/stop');
  }
  async pumpReset(): Promise<RestResponse<ApiMessageResponse>> {
    return this._post<ApiMessageResponse>('/api/pump/reset');
  }
  async safetyUnlock(): Promise<RestResponse<ApiMessageResponse>> {
    return this._post<ApiMessageResponse>('/api/safety/unlock');
  }
  async reboot(): Promise<RestResponse<ApiMessageResponse>> {
    return this._post<ApiMessageResponse>('/api/reboot');
  }
  async factoryReset(): Promise<RestResponse<ApiMessageResponse>> {
    return this._post<ApiMessageResponse>('/api/factory-reset');
  }
  async getStatus(): Promise<RestResponse<ApiStatusResponse>> {
    return this._get<ApiStatusResponse>('/api/status');
  }
  async getSensors(): Promise<RestResponse<ApiSensorsResponse>> {
    return this._get<ApiSensorsResponse>('/api/sensors');
  }
  async getSafetyStatus(): Promise<RestResponse<ApiSafetyStatusResponse>> {
    return this._get<ApiSafetyStatusResponse>('/api/safety/status');
  }
  async updateConfig(partial: ApiConfigUpdate): Promise<RestResponse<ApiMessageResponse>> {
    return this._request<ApiMessageResponse>('POST', '/api/config', partial);
  }

  // ─── private ───────────────────────────────────────────────
  private setState(next: RestState): void {
    if (this._state === next) return;
    this._state = next;
    this.dispatchEvent(new CustomEvent('statechange', { detail: next }));
  }

  private async _get<T>(path: string): Promise<RestResponse<T>> {
    return this._request<T>('GET', path);
  }

  private async _post<T>(path: string, body?: unknown): Promise<RestResponse<T>> {
    return this._request<T>('POST', path, body);
  }

  private async _request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<RestResponse<T>> {
    if (!this._cfg?.url) {
      return { ok: false, status: 0, error: 'no config', mock: true };
    }

    const url = this._cfg.url.replace(/\/$/, '') + path;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const t0 = performance.now();

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this._cfg.token) headers['X-Hydra-Token'] = this._cfg.token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
        mode: 'cors',
      });
      this._lastCallAt = Date.now();
      this._lastLatencyMs = Math.round(performance.now() - t0);

      if (res.status === 401 || res.status === 403) {
        this.setState('unauthorized');
        this._lastError = `HTTP ${res.status}`;
        return { ok: false, status: res.status, error: 'unauthorized' };
      }

      if (!res.ok) {
        this._lastError = `HTTP ${res.status}`;
        return { ok: false, status: res.status, error: res.statusText };
      }

      let data: T | undefined;
      try {
        data = (await res.json()) as T;
      } catch {
        // pas de body JSON — pas une erreur si ok
      }
      return { ok: true, status: res.status, data, latencyMs: this._lastLatencyMs };
    } catch (e) {
      const err = e as Error;
      this._lastError = err.name === 'AbortError' ? 'timeout' : err.message;
      this.setState('error');
      return { ok: false, status: 0, error: this._lastError };
    } finally {
      clearTimeout(timeout);
    }
  }
}
