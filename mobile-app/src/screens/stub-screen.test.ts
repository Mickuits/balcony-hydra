import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StubScreen } from './stub-screen';

describe('StubScreen', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
  });

  it('mount renders title + placeholder', () => {
    const s = new StubScreen({ id: 'pots', title: 'Mes pots' });
    s.mount(root);
    expect(root.querySelector('h1')?.textContent).toBe('Mes pots');
    expect(root.querySelector('[data-screen-id="pots"]')).not.toBeNull();
  });

  it('mount escapes HTML in title to prevent XSS', () => {
    const s = new StubScreen({ id: 'pots', title: '<img src=x onerror=1>' });
    s.mount(root);
    expect(root.querySelector('h1')?.innerHTML).not.toContain('<img');
    expect(root.querySelector('h1')?.textContent).toContain('<img');
  });

  it('activate logs warn (signals non-ported screen)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = new StubScreen({ id: 'pots', title: 'Mes pots' });
    s.mount(root);
    s.activate();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('pots'));
    warn.mockRestore();
  });

  it('unmount clears DOM', () => {
    const s = new StubScreen({ id: 'pots', title: 'Mes pots' });
    s.mount(root);
    s.unmount();
    expect(root.innerHTML).toBe('');
  });

  it('uses custom subtitle when provided', () => {
    const s = new StubScreen({ id: 'pots', title: 'Mes pots', subtitle: 'Custom subtitle' });
    s.mount(root);
    expect(root.querySelector('p')?.textContent).toBe('Custom subtitle');
  });
});
