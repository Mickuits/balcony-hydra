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

/**
 * Sanitize une string venant du firmware via MQTT (ex: alert message).
 *
 * Spécificité : tronque à `maxLen` caractères, retire control chars (< 0x20)
 * sauf newline/tab, et **n'échappe PAS le HTML** — c'est au consumer de le
 * faire via escapeHtml() avant insertion DOM.
 *
 * Cette fonction protège contre des payloads malicieux qui essaieraient
 * d'épuiser la RAM ou de pousser du contenu non-imprimable dans les logs.
 */
export function sanitizeMqttString(value: unknown, maxLen = 256): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

/**
 * Vérifie qu'un objet n'est pas un payload poison (dépassement profondeur,
 * trop de clés, ou prototype pollution).
 *
 * Renvoie `true` si l'objet semble safe pour parsing supplémentaire.
 */
export function isSafePayload(value: unknown, maxDepth = 5, maxKeys = 50): boolean {
  function check(v: unknown, depth: number): boolean {
    if (depth > maxDepth) return false;
    if (v === null || typeof v !== 'object') return true;
    // Reject prototype pollution attempts
    if (Object.prototype.hasOwnProperty.call(v, '__proto__')) return false;
    if (Object.prototype.hasOwnProperty.call(v, 'constructor')) return false;
    if (Object.prototype.hasOwnProperty.call(v, 'prototype')) return false;
    const keys = Object.keys(v as object);
    if (keys.length > maxKeys) return false;
    for (const key of keys) {
      if (!check((v as Record<string, unknown>)[key], depth + 1)) return false;
    }
    return true;
  }
  return check(value, 0);
}
