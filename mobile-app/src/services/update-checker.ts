/**
 * UpdateChecker — polling périodique de /version.json pour détecter une
 * nouvelle version de l'app déployée.
 *
 * Comportement :
 *  - Au mount, log le BUILD_ID courant.
 *  - Toutes les `intervalMs` (défaut 10 min), fetch /version.json.
 *  - Si le buildId remote diffère du local → émet un événement
 *    'updateAvailable' que main.ts route vers le banner / announcer.
 *  - L'utilisateur peut alors recharger la page pour récupérer la nouvelle
 *    version (le SW vite-plugin-pwa fera le swap).
 *
 * EventTarget pour découpler du DOM et permettre l'injection en test.
 */

export interface UpdateCheckerDeps {
  /** BUILD_ID courant injecté au build. */
  currentBuildId: string;
  /** Endpoint à poller. Doit retourner `{ buildId, builtAt, versionApi }`. */
  versionUrl?: string;
  /** Intervalle de polling en ms (par défaut 10 min). */
  intervalMs?: number;
  /** fetch injectable pour tests. */
  fetchFn?: typeof fetch;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

export interface UpdateAvailableDetail {
  currentBuildId: string;
  remoteBuildId: string;
  remoteBuiltAt: string;
}

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 min

export class UpdateChecker extends EventTarget {
  private readonly currentBuildId: string;
  private readonly versionUrl: string;
  private readonly intervalMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly userSetInterval: typeof setInterval | undefined;
  private readonly userClearInterval: typeof clearInterval | undefined;
  private handle: ReturnType<typeof setInterval> | null = null;
  private notified = false;

  constructor(deps: UpdateCheckerDeps) {
    super();
    this.currentBuildId = deps.currentBuildId;
    this.versionUrl = deps.versionUrl ?? '/version.json';
    this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.fetchFn = deps.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.userSetInterval = deps.setIntervalFn;
    this.userClearInterval = deps.clearIntervalFn;
  }

  private get setIntervalFn(): typeof setInterval {
    return this.userSetInterval ?? globalThis.setInterval;
  }
  private get clearIntervalFn(): typeof clearInterval {
    return this.userClearInterval ?? globalThis.clearInterval;
  }

  /** Démarre le polling. Idempotent. */
  start(): void {
    if (this.handle !== null) return;
    void this.check();
    this.handle = this.setIntervalFn(() => void this.check(), this.intervalMs);
  }

  /** Arrête le polling. */
  stop(): void {
    if (this.handle === null) return;
    this.clearIntervalFn(this.handle);
    this.handle = null;
  }

  /** Force une vérification immédiate. */
  async check(): Promise<void> {
    try {
      const res = await this.fetchFn(this.versionUrl, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { buildId?: string; builtAt?: string };
      if (typeof data.buildId !== 'string') return;
      if (data.buildId !== this.currentBuildId && !this.notified) {
        this.notified = true;
        this.dispatchEvent(
          new CustomEvent<UpdateAvailableDetail>('updateAvailable', {
            detail: {
              currentBuildId: this.currentBuildId,
              remoteBuildId: data.buildId,
              remoteBuiltAt: data.builtAt ?? '',
            },
          })
        );
      }
    } catch (err) {
      // Network error → silence (réessayera au prochain tick)
      console.warn('[update-checker] fetch failed', err);
    }
  }

  /** Reset la garde "notified" (utile après que l'utilisateur a refusé). */
  reset(): void {
    this.notified = false;
  }
}
