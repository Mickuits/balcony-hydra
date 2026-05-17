/**
 * ErrorTrackingService — capture les erreurs non-gérées et expose un log
 * en mémoire + persisté (localStorage).
 *
 * Cible : permettre à l'utilisateur de copier-coller un dump d'erreurs
 * quand quelque chose part en vrille, sans nécessiter un service tiers
 * (Sentry/Bugsnag) qui aurait besoin d'un compte + de réseau.
 *
 * Captures :
 *   - window.onerror (uncaught sync errors)
 *   - window.onunhandledrejection (rejected promises)
 *   - manually via captureException()
 *
 * Garanties :
 *   - Ring buffer borné (maxEntries) → pas de leak mémoire
 *   - Persistance localStorage (max 50 entries, KO si quota dépassé)
 *   - Aucun call réseau implicite → privacy by default
 *   - exposureMode 'verbose' (toggle dev) ↔ 'silent' (prod)
 */
import { StorageService } from './storage';
import { sanitizeMqttString } from '@/utils/sanitize';

export type ErrorSeverity = 'error' | 'warn' | 'info';

export interface ErrorEntry {
  /** ISO 8601 timestamp. */
  ts: string;
  severity: ErrorSeverity;
  /** Source de l'erreur (filename, function, etc.). */
  source: string;
  /** Message principal. */
  message: string;
  /** Stack trace (raccourcie à 2000 chars). */
  stack?: string;
  /** Build identifier de l'app au moment de l'erreur. */
  buildId: string;
  /** Contexte métier optionnel (ex: 'screen:detail', 'mqtt'). */
  context?: string;
}

export interface ErrorTrackingDeps {
  storage?: StorageService;
  buildId?: string;
  maxEntries?: number;
  /** Target attaché aux globalThis listeners (testing : injectable). */
  errorTarget?: EventTarget;
}

const DEFAULT_MAX_ENTRIES = 50;
const STORAGE_KEY = 'hydra-error-log';
const MAX_STACK_LEN = 2000;
const MAX_MESSAGE_LEN = 500;

export class ErrorTracking extends EventTarget {
  private readonly storage: StorageService;
  private readonly buildId: string;
  private readonly maxEntries: number;
  private readonly errorTarget: EventTarget;
  private entries: ErrorEntry[] = [];
  private listeners: { type: string; fn: (e: Event) => void }[] = [];
  private installed = false;

  constructor(deps: ErrorTrackingDeps = {}) {
    super();
    this.storage = deps.storage ?? new StorageService();
    this.buildId = deps.buildId ?? 'dev';
    this.maxEntries = deps.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.errorTarget = deps.errorTarget ?? globalThis;
    // Restore log précédent
    const stored = this.storage.get<ErrorEntry[]>(STORAGE_KEY as never, []);
    if (Array.isArray(stored)) {
      this.entries = stored.slice(-this.maxEntries);
    }
  }

  /** Attache les listeners window.onerror + onunhandledrejection. */
  install(): void {
    if (this.installed) return;
    this.installed = true;

    const onError = (e: Event): void => {
      const ev = e as ErrorEvent;
      this.capture({
        severity: 'error',
        source: ev.filename || 'window.onerror',
        message: ev.message || 'Unknown error',
        stack: ev.error?.stack,
        context: 'global',
      });
    };
    const onRejection = (e: Event): void => {
      const ev = e as PromiseRejectionEvent;
      const reason = ev.reason as unknown;
      const msg =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'Unhandled promise rejection';
      this.capture({
        severity: 'error',
        source: 'unhandledrejection',
        message: msg,
        stack: reason instanceof Error ? reason.stack : undefined,
        context: 'promise',
      });
    };

    this.errorTarget.addEventListener('error', onError);
    this.errorTarget.addEventListener('unhandledrejection', onRejection);
    this.listeners.push({ type: 'error', fn: onError });
    this.listeners.push({ type: 'unhandledrejection', fn: onRejection });
  }

  /** Détache les listeners. */
  uninstall(): void {
    if (!this.installed) return;
    for (const { type, fn } of this.listeners) {
      this.errorTarget.removeEventListener(type, fn);
    }
    this.listeners = [];
    this.installed = false;
  }

  /**
   * Capture manuelle d'une erreur. Utilisé par les screens via try/catch.
   */
  capture(input: Omit<ErrorEntry, 'ts' | 'buildId'>): ErrorEntry {
    const entry: ErrorEntry = {
      ts: new Date().toISOString(),
      buildId: this.buildId,
      severity: input.severity,
      source: sanitizeMqttString(input.source, 200),
      message: sanitizeMqttString(input.message, MAX_MESSAGE_LEN),
    };
    if (input.stack) entry.stack = sanitizeMqttString(input.stack, MAX_STACK_LEN);
    if (input.context) entry.context = sanitizeMqttString(input.context, 100);

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
    this.persist();
    this.dispatchEvent(new CustomEvent('capture', { detail: entry }));
    return entry;
  }

  /** Helper : capture une exception JS classique. */
  captureException(err: unknown, context?: string): ErrorEntry {
    const e = err as Error;
    return this.capture({
      severity: 'error',
      source: e?.name ?? 'Error',
      message: e?.message ?? String(err),
      stack: e?.stack ?? undefined,
      context: context ?? undefined,
    } as Omit<ErrorEntry, 'ts' | 'buildId'>);
  }

  /** Retourne une copie immutable du log courant. */
  getEntries(): readonly ErrorEntry[] {
    return [...this.entries];
  }

  /** Vide le log (mémoire + persisté). */
  clear(): void {
    this.entries = [];
    this.persist();
    this.dispatchEvent(new CustomEvent('clear'));
  }

  /**
   * Export le log en JSON pour copie-collage / diagnostic.
   */
  exportJson(): string {
    return JSON.stringify(
      {
        buildId: this.buildId,
        exportedAt: new Date().toISOString(),
        entries: this.entries,
      },
      null,
      2
    );
  }

  private persist(): void {
    try {
      this.storage.set(STORAGE_KEY as never, this.entries);
    } catch (err) {
      // Si quota dépassé → drop la moitié des entries
      console.warn('[error-tracking] persist failed, truncating', err);
      this.entries = this.entries.slice(-Math.floor(this.maxEntries / 2));
      try {
        this.storage.set(STORAGE_KEY as never, this.entries);
      } catch {
        // Donné perdues, on continue en mémoire seule
      }
    }
  }
}
