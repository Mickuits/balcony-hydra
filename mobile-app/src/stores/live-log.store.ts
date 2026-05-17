/**
 * LiveLogStore — ring buffer des derniers événements (max 12 par défaut).
 */
import { Store } from './store';
import type { LogEntry, ToastLogTag } from '@/types';
import { fmtTime } from '@/utils/format';

export interface LiveLogShape {
  entries: LogEntry[];
  /** Max entries conservées (FIFO ring buffer) */
  maxEntries: number;
}

export class LiveLogStore extends Store<LiveLogShape> {
  constructor(maxEntries = 12) {
    super({ entries: [], maxEntries });
  }

  /**
   * Push un événement. Si plein, drop le plus ancien.
   * Timestamp = now si non fourni (utile pour tests déterministes).
   */
  pushEvent(tag: ToastLogTag, msg: string, timestampMs?: number): void {
    const time = fmtTime(timestampMs ?? Date.now());
    this.update((s) => {
      const next: LogEntry[] = [...s.entries, { time, tag, msg }];
      if (next.length > s.maxEntries) {
        next.splice(0, next.length - s.maxEntries);
      }
      return { ...s, entries: next };
    });
  }

  clear(): void {
    this.update((s) => ({ ...s, entries: [] }));
  }

  /**
   * Seed avec des entries (utilisé au boot pour l'historique initial).
   */
  seed(entries: LogEntry[]): void {
    this.update((s) => ({ ...s, entries: [...entries] }));
  }
}

export const liveLogStore = new LiveLogStore();
