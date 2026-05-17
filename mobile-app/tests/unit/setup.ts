/**
 * Global Vitest setup — runs once before all tests.
 * jsdom est déjà fourni par vitest.config.ts `environment: 'jsdom'`.
 */
import { afterEach, beforeEach } from 'vitest';

beforeEach(() => {
  // Reset DOM entre tests
  document.body.innerHTML = '';
  // Reset localStorage / sessionStorage
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  // Cleanup global state si nécessaire
});

// Polyfill crypto.randomUUID pour jsdom (manquant dans certaines versions)
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: (): string =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }),
  });
}
