/**
 * Smoke test — vérifie que le toolchain Vitest + TypeScript + jsdom est OK.
 * Sera supprimé une fois les vrais tests en place.
 */
import { describe, it, expect } from 'vitest';

describe('toolchain smoke', () => {
  it('TypeScript strict mode compile', () => {
    const value: number = 42;
    expect(value).toBe(42);
  });

  it('jsdom DOM available', () => {
    document.body.innerHTML = '<div id="test">hello</div>';
    const el = document.getElementById('test');
    expect(el?.textContent).toBe('hello');
  });

  it('async/await supported', async () => {
    const result = await Promise.resolve(123);
    expect(result).toBe(123);
  });

  it('crypto.randomUUID available', () => {
    const uuid = crypto.randomUUID();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('localStorage works in jsdom', () => {
    localStorage.setItem('hello', 'world');
    expect(localStorage.getItem('hello')).toBe('world');
  });
});
