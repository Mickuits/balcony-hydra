/**
 * Formatters — fonctions pures de présentation.
 *
 * Note historique : le proto legacy déclarait `fmtDuration` 2× avec un
 * override silencieux. On expose ici 2 fonctions nommées distinctement
 * pour clarifier l'intention.
 */

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

/**
 * Format humain "long" — '—' pour 0/null, 'Xj Yh' / 'Xh Ym' / 'Xm'.
 * Utilisé pour des durées qui sont des âges (paired since, last fill).
 *
 * @param seconds — durée en secondes, ou null/undefined
 */
export function fmtDurationHuman(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds === 0) return '—';
  if (seconds < SECONDS_PER_HOUR) {
    return `${Math.floor(seconds / SECONDS_PER_MINUTE)}m`;
  }
  if (seconds < SECONDS_PER_DAY) {
    const h = Math.floor(seconds / SECONDS_PER_HOUR);
    const m = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(seconds / SECONDS_PER_DAY);
  const h = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  return h > 0 ? `${d}j ${h}h` : `${d}j`;
}

/**
 * Format court "compact" — toujours une valeur, jamais '—'.
 * Utilisé pour des compteurs courts (cooling timer, since lockout).
 *
 * @param seconds — durée en secondes (>= 0)
 */
export function fmtDurationShort(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return `${Math.max(0, Math.round(seconds))}s`;
  if (seconds < SECONDS_PER_HOUR) {
    const m = Math.floor(seconds / SECONDS_PER_MINUTE);
    const s = Math.floor(seconds % SECONDS_PER_MINUTE);
    return `${m}min ${s.toString().padStart(2, '0')}s`;
  }
  const h = Math.floor(seconds / SECONDS_PER_HOUR);
  const m = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  return `${h}h ${m.toString().padStart(2, '0')}min`;
}

/**
 * Format uptime "Xd HH:MM" — comme un compteur de uptime serveur.
 *
 * @param seconds — uptime en secondes
 */
export function fmtUptime(seconds: number): string {
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  return `${days}d ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Format MAC court — uppercase ou '—' si null.
 */
export function fmtMacShort(mac: string | null | undefined): string {
  return mac ? mac.toUpperCase() : '—';
}

/**
 * Format pourcentage borné [0..100].
 */
export function fmtPct(value: number, decimals = 0): string {
  const clamped = Math.max(0, Math.min(100, value));
  return `${clamped.toFixed(decimals)}%`;
}

/**
 * Format litres avec une décimale.
 */
export function fmtLiters(liters: number): string {
  return `${liters.toFixed(1)} L`;
}

/**
 * Format temps timestamp millis → 'HH:MM:SS' local.
 */
export function fmtTime(millis: number): string {
  const d = new Date(millis);
  return d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
