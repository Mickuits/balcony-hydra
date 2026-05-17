import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BottomNav } from './bottom-nav';
import { UiStore } from '@/stores/ui.store';

function makeNavRoot(): HTMLElement {
  const root = document.createElement('nav');
  for (const id of ['dashboard', 'pots', 'tanks', 'stats', 'system']) {
    const btn = document.createElement('button');
    btn.dataset['nav'] = id;
    btn.textContent = id;
    root.appendChild(btn);
  }
  return root;
}

describe('BottomNav', () => {
  let ui: UiStore;
  let root: HTMLElement;
  let onNavigate: ReturnType<typeof vi.fn>;
  let nav: BottomNav;

  beforeEach(() => {
    ui = new UiStore();
    root = makeNavRoot();
    onNavigate = vi.fn();
    nav = new BottomNav({ root, uiStore: ui, onNavigate });
  });

  it('mount highlights the current screen', () => {
    ui.setScreen('pots');
    nav.mount();
    const active = root.querySelector('.active');
    expect(active?.getAttribute('data-nav')).toBe('pots');
    expect(active?.getAttribute('aria-current')).toBe('page');
  });

  it('child screens map to parent nav (detail → pots)', () => {
    ui.setScreen('detail');
    nav.mount();
    const active = root.querySelector('.active');
    expect(active?.getAttribute('data-nav')).toBe('pots');
  });

  it('click on button invokes onNavigate with navId', () => {
    nav.mount();
    const btn = root.querySelector<HTMLElement>('[data-nav="tanks"]');
    btn?.click();
    expect(onNavigate).toHaveBeenCalledWith('tanks');
  });

  it('clicking outside a [data-nav] is ignored', () => {
    const stray = document.createElement('span');
    root.appendChild(stray);
    nav.mount();
    stray.click();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('updates highlight on UiStore.setScreen()', () => {
    nav.mount();
    ui.setScreen('stats');
    const active = root.querySelector('.active');
    expect(active?.getAttribute('data-nav')).toBe('stats');
  });

  it('unmount removes listeners + unsubscribes', () => {
    nav.mount();
    nav.unmount();
    const btn = root.querySelector<HTMLElement>('[data-nav="pots"]');
    btn?.click();
    expect(onNavigate).not.toHaveBeenCalled();
    // setScreen ne doit plus re-highlight
    ui.setScreen('system');
    const active = root.querySelector('.active');
    // L'état précédent (dashboard via default) reste figé après unmount
    expect(active?.getAttribute('data-nav')).not.toBe('system');
  });
});
