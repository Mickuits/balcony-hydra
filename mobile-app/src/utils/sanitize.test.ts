import { describe, it, expect } from 'vitest';
import { escapeHtml, isValidMac, isValidUrl, isValidApiToken, clampNumber } from './sanitize';

describe('escapeHtml', () => {
  it('escapes < > & " \' /', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
    expect(escapeHtml("it's")).toBe('it&#39;s');
    expect(escapeHtml('a/b')).toBe('a&#x2F;b');
  });

  it('handles XSS injection vectors', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml('</script><script>alert(1)</script>')).toBe(
      '&lt;&#x2F;script&gt;&lt;script&gt;alert(1)&lt;&#x2F;script&gt;'
    );
  });

  it('handles null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerces non-string', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(true)).toBe('true');
  });

  it('passes through plain text', () => {
    expect(escapeHtml('plain text')).toBe('plain text');
    expect(escapeHtml('Réservoir balcon')).toBe('Réservoir balcon');
  });
});

describe('isValidMac', () => {
  it('accepts valid MAC formats', () => {
    expect(isValidMac('24:6F:28:7C:1A:42')).toBe(true);
    expect(isValidMac('aa:bb:cc:dd:ee:ff')).toBe(true);
    expect(isValidMac('00:00:00:00:00:00')).toBe(true);
  });

  it('rejects malformed MACs', () => {
    expect(isValidMac('24-6F-28-7C-1A-42')).toBe(false); // tirets
    expect(isValidMac('246F287C1A42')).toBe(false); // sans séparateur
    expect(isValidMac('24:6F:28:7C:1A')).toBe(false); // 5 octets
    expect(isValidMac('24:6F:28:7C:1A:42:00')).toBe(false); // 7 octets
    expect(isValidMac('24:6F:28:7C:1A:GG')).toBe(false); // hex invalide
    expect(isValidMac('')).toBe(false);
  });
});

describe('isValidUrl', () => {
  it('accepts urls matching allowed protocols', () => {
    expect(isValidUrl('http://hydra.local', ['http', 'https'])).toBe(true);
    expect(isValidUrl('https://hydra.local:8080/api', ['http', 'https'])).toBe(true);
    expect(isValidUrl('ws://192.168.1.10:9001', ['ws', 'wss'])).toBe(true);
    expect(isValidUrl('wss://broker:9443/mqtt', ['ws', 'wss'])).toBe(true);
  });

  it('rejects mismatched protocols', () => {
    expect(isValidUrl('ws://broker', ['http', 'https'])).toBe(false);
    expect(isValidUrl('javascript:alert(1)', ['http', 'https'])).toBe(false);
  });

  it('rejects malformed urls', () => {
    expect(isValidUrl('not a url', ['http'])).toBe(false);
    expect(isValidUrl('', ['http'])).toBe(false);
  });
});

describe('isValidApiToken', () => {
  it('accepts 32 hex chars (lowercase/uppercase/mixed)', () => {
    expect(isValidApiToken('a3f9b8c2d1e4f5a6b7c8d9e0f1a2b3c4')).toBe(true);
    expect(isValidApiToken('A3F9B8C2D1E4F5A6B7C8D9E0F1A2B3C4')).toBe(true);
    expect(isValidApiToken('a3F9b8C2d1E4f5A6b7C8d9E0f1A2b3C4')).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidApiToken('a3f9b8c2')).toBe(false);
    expect(isValidApiToken('a3f9b8c2d1e4f5a6b7c8d9e0f1a2b3c4a3f9b8c2')).toBe(false);
  });

  it('rejects non-hex chars', () => {
    expect(isValidApiToken('a3f9b8c2d1e4f5a6b7c8d9e0f1a2b3cZ')).toBe(false);
    expect(isValidApiToken('hello-world-32-chars-x-x-x-x-x-x')).toBe(false);
  });
});

describe('clampNumber', () => {
  it('clamps within range', () => {
    expect(clampNumber(50, 0, 100, 0)).toBe(50);
    expect(clampNumber(-10, 0, 100, 0)).toBe(0);
    expect(clampNumber(150, 0, 100, 0)).toBe(100);
  });

  it('returns fallback for invalid', () => {
    expect(clampNumber(NaN, 0, 100, 50)).toBe(50);
    expect(clampNumber(Infinity, 0, 100, 50)).toBe(50);
    expect(clampNumber('not a number', 0, 100, 42)).toBe(42);
    expect(clampNumber(null, 0, 100, 99)).toBe(99);
  });

  it('coerces numeric strings', () => {
    expect(clampNumber('42', 0, 100, 0)).toBe(42);
    expect(clampNumber('3.14', 0, 100, 0)).toBe(3.14);
  });
});
