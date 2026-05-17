import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getFocusableElements,
  trapFocus,
  createAnnouncer,
  prefersReducedMotion,
  prefersDarkColorScheme,
  FOCUSABLE_SELECTOR,
} from './a11y';

describe('getFocusableElements', () => {
  it('finds buttons / links / inputs / selects / textareas', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <button>btn</button>
      <a href="#">link</a>
      <input type="text" />
      <select><option>x</option></select>
      <textarea></textarea>
      <div>not focusable</div>
    `;
    document.body.appendChild(container);
    // jsdom : offsetParent renvoie null pour les éléments détachés, donc on
    // doit attacher au body pour que les éléments soient considérés visibles
    const els = getFocusableElements(container);
    expect(els.length).toBeGreaterThanOrEqual(5);
    document.body.removeChild(container);
  });

  it('excludes disabled inputs / buttons', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <button disabled>x</button>
      <input disabled />
    `;
    document.body.appendChild(container);
    const els = getFocusableElements(container);
    expect(els).toHaveLength(0);
    document.body.removeChild(container);
  });

  it('respects tabindex="-1" exclusion', () => {
    const container = document.createElement('div');
    container.innerHTML = `<div tabindex="-1">excluded</div><button>kept</button>`;
    document.body.appendChild(container);
    const els = getFocusableElements(container);
    expect(els).toHaveLength(1);
    document.body.removeChild(container);
  });
});

describe('trapFocus', () => {
  let container: HTMLElement;
  let buttons: HTMLButtonElement[];

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.innerHTML = `
      <button id="b1">b1</button>
      <button id="b2">b2</button>
      <button id="b3">b3</button>
    `;
    document.body.appendChild(container);
    buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
  });

  it('Tab from last focusable wraps to first', () => {
    trapFocus(container);
    buttons[2]!.focus();
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement?.id).toBe('b1');
  });

  it('Shift+Tab from first focusable wraps to last', () => {
    trapFocus(container);
    buttons[0]!.focus();
    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
    );
    expect(document.activeElement?.id).toBe('b3');
  });

  it('detach handler stops trapping', () => {
    const release = trapFocus(container);
    release();
    buttons[2]!.focus();
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    // Pas de wrap (handler détaché) — activeElement reste sur b3 (jsdom ne déplace pas)
    expect(document.activeElement?.id).toBe('b3');
  });

  it('non-Tab keys are ignored', () => {
    trapFocus(container);
    buttons[2]!.focus();
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.activeElement?.id).toBe('b3');
  });

  it('handles empty container gracefully', () => {
    const empty = document.createElement('div');
    document.body.appendChild(empty);
    expect(() => {
      const release = trapFocus(empty);
      empty.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      release();
    }).not.toThrow();
  });
});

describe('createAnnouncer', () => {
  let parent: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    parent = document.createElement('div');
    document.body.appendChild(parent);
  });

  it('inserts polite + assertive live regions', () => {
    const announcer = createAnnouncer(parent);
    const polite = parent.querySelector('#a11y-polite');
    const assertive = parent.querySelector('#a11y-assertive');
    expect(polite?.getAttribute('aria-live')).toBe('polite');
    expect(assertive?.getAttribute('aria-live')).toBe('assertive');
    expect(polite?.getAttribute('role')).toBe('status');
    expect(assertive?.getAttribute('role')).toBe('alert');
    announcer.destroy();
  });

  it('polite() writes message after delay', async () => {
    const announcer = createAnnouncer(parent);
    announcer.polite('niveau bas');
    await new Promise((r) => setTimeout(r, 100));
    expect(parent.querySelector('#a11y-polite')?.textContent).toBe('niveau bas');
    announcer.destroy();
  });

  it('assertive() writes message after delay', async () => {
    const announcer = createAnnouncer(parent);
    announcer.assertive('safety lockout');
    await new Promise((r) => setTimeout(r, 100));
    expect(parent.querySelector('#a11y-assertive')?.textContent).toBe('safety lockout');
    announcer.destroy();
  });

  it('destroy() removes regions from DOM', () => {
    const announcer = createAnnouncer(parent);
    announcer.destroy();
    expect(parent.querySelector('#a11y-polite')).toBeNull();
    expect(parent.querySelector('#a11y-assertive')).toBeNull();
  });

  it('regions have sr-only class (visually hidden)', () => {
    const announcer = createAnnouncer(parent);
    expect(parent.querySelector('#a11y-polite')?.classList.contains('sr-only')).toBe(true);
    announcer.destroy();
  });
});

describe('prefersReducedMotion + prefersDarkColorScheme', () => {
  it('returns boolean (false in default jsdom env)', () => {
    expect(typeof prefersReducedMotion()).toBe('boolean');
    expect(typeof prefersDarkColorScheme()).toBe('boolean');
  });

  it('returns true when matchMedia matches', () => {
    const orig = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    expect(prefersReducedMotion()).toBe(true);
    expect(prefersDarkColorScheme()).toBe(true);
    window.matchMedia = orig;
  });

  it('returns false when matchMedia throws', () => {
    const orig = window.matchMedia;
    window.matchMedia = (() => {
      throw new Error('not supported');
    }) as never;
    expect(prefersReducedMotion()).toBe(false);
    expect(prefersDarkColorScheme()).toBe(false);
    window.matchMedia = orig;
  });
});

describe('FOCUSABLE_SELECTOR (smoke)', () => {
  it('is a non-empty string', () => {
    expect(typeof FOCUSABLE_SELECTOR).toBe('string');
    expect(FOCUSABLE_SELECTOR.length).toBeGreaterThan(0);
  });
});
