/**
 * Sanitization — protection XSS sur les payloads externes (MQTT, REST, user input).
 */

/**
 * Échappe les caractères dangereux pour HTML.
 * Convertit < > & " ' / → entités HTML.
 *
 * Critique : tout payload MQTT, message d'alerte, ou input user qui
 * finit dans `innerHTML` DOIT passer par cette fonction.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Valide qu'une string est une MAC address (format AA:BB:CC:DD:EE:FF).
 */
export function isValidMac(value: string): boolean {
  return /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/i.test(value);
}

/**
 * Valide qu'une string est une URL http(s) ou ws(s).
 */
export function isValidUrl(value: string, protocols: readonly string[]): boolean {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol.replace(':', ''));
  } catch {
    return false;
  }
}

/**
 * Valide qu'une string est un API token (32 hex chars).
 */
export function isValidApiToken(value: string): boolean {
  return /^[0-9a-f]{32}$/i.test(value);
}

/**
 * Sanitize un payload MQTT — clamp les valeurs numériques dans des plages
 * raisonnables pour éviter NaN/Infinity poison.
 *
 * Spécificité : `null` et `undefined` sont rejetés vers fallback (au lieu
 * d'être coercés en 0 par Number()), parce que "valeur absente" ≠ "valeur 0".
 * Les strings vides aussi (Number('') === 0 sinon).
 */
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}
