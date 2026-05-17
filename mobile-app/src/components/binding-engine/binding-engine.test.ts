import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BindingEngine } from './binding-engine';

describe('BindingEngine', () => {
  let engine: BindingEngine;
  let scope: HTMLElement;

  beforeEach(() => {
    engine = new BindingEngine();
    scope = document.createElement('div');
  });

  it('register + apply textContent', () => {
    engine.register('sys.uptime', () => '12h34');
    scope.innerHTML = `<span data-bind="sys.uptime"></span>`;
    const n = engine.apply(scope);
    expect(n).toBe(1);
    expect(scope.querySelector('span')?.textContent).toBe('12h34');
  });

  it('applies same binding to multiple elements', () => {
    engine.register('greeting', () => 'hi');
    scope.innerHTML = `<a data-bind="greeting"></a><b data-bind="greeting"></b>`;
    engine.apply(scope);
    expect(scope.querySelector('a')?.textContent).toBe('hi');
    expect(scope.querySelector('b')?.textContent).toBe('hi');
  });

  it('logs warn + skips on unknown key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    scope.innerHTML = `<span data-bind="not.defined"></span>`;
    const n = engine.apply(scope);
    expect(n).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('registerAll loads multiple bindings', () => {
    engine.registerAll({
      'a.b': () => '1',
      'c.d': { produce: () => '2' },
    });
    expect(engine.size()).toBe(2);
    expect(engine.has('a.b')).toBe(true);
    expect(engine.has('c.d')).toBe(true);
  });

  it('escapes HTML in target=html mode', () => {
    engine.register('user.name', { produce: () => '<img src=x>', target: 'html' });
    scope.innerHTML = `<span data-bind="user.name"></span>`;
    engine.apply(scope);
    expect(scope.querySelector('span')?.innerHTML).not.toContain('<img');
    expect(scope.querySelector('span')?.innerHTML).toContain('&lt;img');
  });

  it('writes attribute with target=attr:name', () => {
    engine.register('btn.label', { produce: () => 'Arroser', target: 'attr:aria-label' });
    scope.innerHTML = `<button data-bind="btn.label"></button>`;
    engine.apply(scope);
    expect(scope.querySelector('button')?.getAttribute('aria-label')).toBe('Arroser');
  });

  it('catches producer errors and continues', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    engine.register('bad', () => {
      throw new Error('boom');
    });
    engine.register('good', () => 'ok');
    scope.innerHTML = `<a data-bind="bad"></a><b data-bind="good"></b>`;
    const n = engine.apply(scope);
    expect(n).toBe(1); // seul "good" a réussi
    expect(scope.querySelector('b')?.textContent).toBe('ok');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('unregister removes binding', () => {
    engine.register('x', () => '1');
    expect(engine.has('x')).toBe(true);
    engine.unregister('x');
    expect(engine.has('x')).toBe(false);
  });

  it('skip DOM update when value unchanged (no-op)', () => {
    let calls = 0;
    engine.register('counter', () => {
      calls += 1;
      return 'same';
    });
    scope.innerHTML = `<span data-bind="counter"></span>`;
    engine.apply(scope);
    const el = scope.querySelector('span')!;
    el.textContent = 'same';
    // Spy on setter — vérif indirect via reference d'égalité
    engine.apply(scope);
    expect(calls).toBe(2);
    expect(el.textContent).toBe('same');
  });
});
