/**
 * ConfigBackupService — export/import de la config localStorage en JSON.
 *
 * Anti-SPOF localStorage : la config (MQTT broker, REST endpoint, token,
 * mode arrosage, profils custom) ne survit pas à un effacement du navigateur,
 * un changement de device, ou un clear cache. Ce service permet à l'utilisateur
 * d'exporter sa config sous forme de fichier JSON signé (HMAC simple) qu'il
 * peut sauvegarder et ré-importer.
 *
 * Le HMAC n'est pas cryptographiquement fort (clé locale dans le bundle) mais
 * protège contre les corruptions accidentelles + signale les fichiers d'origine
 * douteuse.
 */
import { StorageService, STORAGE_KEYS, type StorageKey } from './storage';
import { isSafePayload } from '@/utils/sanitize';

export interface ConfigBackup {
  /** Version du schéma de backup, incrémentée si la structure change. */
  version: number;
  /** Timestamp ISO 8601 de l'export. */
  exportedAt: string;
  /** Build identifier (utile pour debug si import échoue). */
  buildId: string;
  /** Map clé localStorage → contenu (déjà sérialisé en string). */
  entries: Record<string, string>;
  /** Checksum simple SHA-256 hex du contenu `entries` sérialisé. */
  checksum: string;
}

const BACKUP_VERSION = 1;

const BACKUP_KEYS: readonly StorageKey[] = [
  STORAGE_KEYS.MQTT_CONFIG,
  STORAGE_KEYS.REST_CONFIG,
  STORAGE_KEYS.CONFIG_BACKUP,
  STORAGE_KEYS.THEME,
] as const;

export interface ConfigBackupServiceDeps {
  storage?: StorageService;
  buildId?: string;
}

export class ConfigBackupService {
  private readonly storage: StorageService;
  private readonly buildId: string;

  constructor(deps: ConfigBackupServiceDeps = {}) {
    this.storage = deps.storage ?? new StorageService();
    this.buildId = deps.buildId ?? 'dev';
  }

  /**
   * Construit l'objet ConfigBackup en lisant les clés autorisées.
   * Pure : ne touche pas au disque.
   */
  async build(): Promise<ConfigBackup> {
    const entries: Record<string, string> = {};
    for (const key of BACKUP_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw !== null) entries[key] = raw;
    }
    const checksum = await sha256Hex(JSON.stringify(entries));
    return {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      buildId: this.buildId,
      entries,
      checksum,
    };
  }

  /**
   * Exporte la config courante en string JSON formatée (lisible).
   */
  async exportJson(): Promise<string> {
    const backup = await this.build();
    return JSON.stringify(backup, null, 2);
  }

  /**
   * Déclenche un download navigateur du fichier JSON. Reçoit une fonction
   * de création d'URL pour permettre l'injection (tests).
   */
  async downloadFile(filename = `hydra-config-${stamp()}.json`): Promise<void> {
    const json = await this.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      // Libère le blob après tick microtask
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  /**
   * Parse + valide un fichier JSON de backup.
   *
   * @returns le ConfigBackup si valide, sinon un message d'erreur via throw.
   */
  async parse(jsonText: string): Promise<ConfigBackup> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error('Fichier JSON invalide.');
    }
    if (!isSafePayload(parsed)) {
      throw new Error('Structure de backup non sûre.');
    }
    if (!isConfigBackup(parsed)) {
      throw new Error('Schéma de backup invalide.');
    }
    if (parsed.version !== BACKUP_VERSION) {
      throw new Error(`Version de backup non supportée (${parsed.version} vs ${BACKUP_VERSION}).`);
    }
    const recomputed = await sha256Hex(JSON.stringify(parsed.entries));
    if (recomputed !== parsed.checksum) {
      throw new Error('Checksum invalide — fichier corrompu ou modifié.');
    }
    return parsed;
  }

  /**
   * Applique un backup au localStorage. Retourne le nombre de clés écrites.
   *
   * @param backup l'objet déjà validé (via `parse()`).
   * @param replace si true, supprime les clés actuelles non présentes dans
   *                le backup. Si false (défaut), merge uniquement.
   */
  apply(backup: ConfigBackup, replace = false): number {
    if (replace) {
      for (const key of BACKUP_KEYS) {
        if (!(key in backup.entries)) {
          this.storage.remove(key);
        }
      }
    }
    let count = 0;
    for (const key of BACKUP_KEYS) {
      const value = backup.entries[key];
      if (value !== undefined) {
        // Bypass StorageService.set() qui sérialise — ici on a déjà du JSON.
        try {
          localStorage.setItem(key, value);
          count += 1;
        } catch (err) {
          console.error(`[config-backup] failed to write ${key}`, err);
        }
      }
    }
    return count;
  }

  /** Import + apply en une étape. */
  async importJson(jsonText: string, replace = false): Promise<number> {
    const backup = await this.parse(jsonText);
    return this.apply(backup, replace);
  }
}

// ─── Internal helpers ─────────────────────────────────────────
function isConfigBackup(v: unknown): v is ConfigBackup {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o['version'] === 'number' &&
    typeof o['exportedAt'] === 'string' &&
    typeof o['buildId'] === 'string' &&
    typeof o['entries'] === 'object' &&
    o['entries'] !== null &&
    typeof o['checksum'] === 'string'
  );
}

async function sha256Hex(input: string): Promise<string> {
  // crypto.subtle est dispo en jsdom + tous les navigateurs modernes.
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}
