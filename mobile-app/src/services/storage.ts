/**
 * StorageService — wrapper localStorage type-safe avec JSON natif.
 *
 * Garanties :
 * - Lecture renvoie le default si clé absente ou JSON corrompu.
 * - Écriture serialize en JSON (objets/tableaux/null/primitifs).
 * - Pas de throw sauf si localStorage est complètement indisponible
 *   (mode privé Safari, quota dépassé) — caller doit gérer ce edge case.
 */

export const STORAGE_KEYS = {
  MQTT_CONFIG: 'hydra-mqtt-cfg',
  REST_CONFIG: 'hydra-rest-cfg',
  CONFIG_BACKUP: 'hydra-config-backup',
  THEME: 'hydra-theme',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export class StorageService {
  /**
   * Lit + parse JSON. Retourne `fallback` si la clé est absente ou si le
   * parse échoue.
   */
  get<T>(key: StorageKey, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn(`[storage] parse failed for ${key}`, err);
      return fallback;
    }
  }

  /**
   * Serialize en JSON + écrit. Retourne true si succès, false si quota
   * dépassé ou erreur autre.
   */
  set<T>(key: StorageKey, value: T): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error(`[storage] write failed for ${key}`, err);
      return false;
    }
  }

  /**
   * Supprime la clé. No-op si déjà absente.
   */
  remove(key: StorageKey): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  /**
   * Test la dispo de localStorage (mode privé Safari, etc.).
   */
  isAvailable(): boolean {
    try {
      const probe = '__hydra_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  }
}

export const storageService = new StorageService();
