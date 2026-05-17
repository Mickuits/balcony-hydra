import { describe, it, expect, beforeEach } from 'vitest';
import { $id, $idOptional, $, $$, setText, setStyle, toggleClass } from './dom';

beforeEach(() => {
  document.body.innerHTML = `
    <div id="root">
      <span class="x">A</span>
      <span class="x">B</span>
      <button id="btn" class="primary">click</button>
    </div>
  `;
});

describe('$id', () => {
  it('returns element when present', () => {
    expect($id('root').tagName).toBe('DIV');
    expect($id('btn').tagName).toBe('BUTTON');
  });

  it('throws when element missing', () => {
    expect(() => $id('missing-id')).toThrow('Element #missing-id not found');
  });
});

describe('$idOptional', () => {
  it('returns element when present', () => {
    expect($idOptional('root')).not.toBeNull();
  });

  it('returns null when absent', () => {
    expect($idOptional('missing-id')).toBeNull();
  });
});

describe('$', () => {
  it('returns first match', () => {
    const span = $('.x');
    expect(span?.textContent).toBe('A');
  });

  it('returns null when no match', () => {
    expect($('.nope')).toBeNull();
  });

  it('respects scope param', () => {
    const root = $id('root');
    const btn = $('button', root);
    expect(btn?.id).toBe('btn');
  });
});

describe('$$', () => {
  it('returns all matches as array', () => {
    const spans = $$('.x');
    expect(spans).toHaveLength(2);
    expect(spans[0]?.textContent).toBe('A');
    expect(spans[1]?.textContent).toBe('B');
  });

  it('returns empty array when no match', () => {
    expect($$('.nope')).toEqual([]);
  });
});

describe('setText', () => {
  it('updates textContent', () => {
    const el = $id('btn');
    setText(el, 'updated');
    expect(el.textContent).toBe('updated');
  });

  it('handles null without error', () => {
    expect(() => setText(null, 'x')).not.toThrow();
  });

  it('skips update if value unchanged (perf)', () => {
    const el = $id('btn');
    el.textContent = 'same';
    // Pas de moyen direct de tester "skip", mais on vérifie au moins que ça reste 'same'
    setText(el, 'same');
    expect(el.textContent).toBe('same');
  });
});

describe('setStyle', () => {
  it('sets inline CSS property', () => {
    const el = $id('btn');
    setStyle(el, 'color', 'red');
    expect(el.style.color).toBe('red');
  });

  it('handles null without error', () => {
    expect(() => setStyle(null, 'color', 'red')).not.toThrow();
  });
});

describe('toggleClass', () => {
  it('adds class when on=true', () => {
    const el = $id('btn');
    toggleClass(el, 'highlighted', true);
    expect(el.classList.contains('highlighted')).toBe(true);
  });

  it('removes class when on=false', () => {
    const el = $id('btn');
    el.classList.add('highlighted');
    toggleClass(el, 'highlighted', false);
    expect(el.classList.contains('highlighted')).toBe(false);
  });

  it('handles null without error', () => {
    expect(() => toggleClass(null, 'x', true)).not.toThrow();
  });
});
