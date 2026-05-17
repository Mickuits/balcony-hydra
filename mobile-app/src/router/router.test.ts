import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Router, BaseScreen, buildScreenRegistry, NAV_OF_SCREEN, ALL_SCREEN_IDS } from './index';
import type { Screen, ScreenProps } from './index';
import { UiStore } from '@/stores/ui.store';
import type { ScreenId } from '@/types';

/** Fake screen instrumenté pour vérifier le cycle de vie. */
class FakeScreen extends BaseScreen {
  constructor(public readonly id: ScreenId) {
    super();
  }
  mountCalls = 0;
  activateCalls: ScreenProps[] = [];
  deactivateCalls = 0;
  unmountCalls = 0;

  protected override onMount(): void {
    this.mountCalls += 1;
  }
  protected override onActivate(props?: ScreenProps): void {
    this.activateCalls.push(props ?? {});
  }
  protected override onDeactivate(): void {
    this.deactivateCalls += 1;
  }
  protected override onUnmount(): void {
    this.unmountCalls += 1;
  }
}

describe('BaseScreen', () => {
  it('respects mount/activate/deactivate/unmount lifecycle', () => {
    const s = new FakeScreen('dashboard');
    const root = document.createElement('div');

    expect(s.isMounted).toBe(false);
    s.mount(root);
    expect(s.isMounted).toBe(true);
    expect(s.mountCalls).toBe(1);

    s.activate({ selectedId: 'P01' });
    expect(s.isActive).toBe(true);
    expect(s.activateCalls).toEqual([{ selectedId: 'P01' }]);

    s.deactivate();
    expect(s.isActive).toBe(false);
    expect(s.deactivateCalls).toBe(1);

    s.unmount();
    expect(s.isMounted).toBe(false);
    expect(s.unmountCalls).toBe(1);
  });

  it('mount is idempotent', () => {
    const s = new FakeScreen('dashboard');
    const root = document.createElement('div');
    s.mount(root);
    s.mount(root);
    expect(s.mountCalls).toBe(1);
  });

  it('activate before mount throws', () => {
    const s = new FakeScreen('dashboard');
    expect(() => s.activate()).toThrow(/before mount/);
  });

  it('unmount cascades deactivate', () => {
    const s = new FakeScreen('dashboard');
    const root = document.createElement('div');
    s.mount(root);
    s.activate();
    s.unmount();
    expect(s.deactivateCalls).toBe(1);
    expect(s.unmountCalls).toBe(1);
  });
});

describe('Router', () => {
  let dash: FakeScreen;
  let pots: FakeScreen;
  let detail: FakeScreen;
  let dashContainer: HTMLElement;
  let potsContainer: HTMLElement;
  let detailContainer: HTMLElement;
  let containers: Record<string, HTMLElement>;
  let router: Router;
  let ui: UiStore;

  beforeEach(() => {
    dash = new FakeScreen('dashboard');
    pots = new FakeScreen('pots');
    detail = new FakeScreen('detail');
    dashContainer = document.createElement('div');
    potsContainer = document.createElement('div');
    detailContainer = document.createElement('div');
    dashContainer.hidden = true;
    potsContainer.hidden = true;
    detailContainer.hidden = true;
    containers = { dashboard: dashContainer, pots: potsContainer, detail: detailContainer };
    ui = new UiStore();

    // Mini-registre 3 screens — pour les tests ciblés on n'a pas besoin des 16
    const screens = new Map<ScreenId, Screen>([
      ['dashboard', dash],
      ['pots', pots],
      ['detail', detail],
    ]);

    router = new Router({
      screens,
      resolveContainer: (id) => containers[id] ?? null,
      uiStore: ui,
    });
  });

  it('navigate mounts + activates target screen', () => {
    router.navigate('dashboard');
    expect(dash.isMounted).toBe(true);
    expect(dash.isActive).toBe(true);
    expect(dashContainer.hidden).toBe(false);
    expect(router.getCurrent()).toBe('dashboard');
  });

  it('navigate updates UiStore.currentScreen', () => {
    router.navigate('pots');
    expect(ui.get().currentScreen).toBe('pots');
  });

  it('switching screens deactivates previous + hides container', () => {
    router.navigate('dashboard');
    router.navigate('pots');
    expect(dash.isActive).toBe(false);
    expect(dash.deactivateCalls).toBe(1);
    expect(dashContainer.hidden).toBe(true);
    expect(pots.isActive).toBe(true);
    expect(potsContainer.hidden).toBe(false);
  });

  it('re-navigation to current screen re-activates with new props', () => {
    router.navigate('detail', { selectedId: 'P01' });
    router.navigate('detail', { selectedId: 'P02' });
    expect(detail.deactivateCalls).toBe(0);
    expect(detail.activateCalls).toEqual([{ selectedId: 'P01' }, { selectedId: 'P02' }]);
  });

  it('throws on unknown screen id', () => {
    expect(() => router.navigate('vacation')).toThrow(/introuvable/);
  });

  it('throws if container resolver returns null', () => {
    delete containers['pots'];
    expect(() => router.navigate('pots')).toThrow(/container HTML manquant/);
  });

  it('dispose unmounts all + clears current', () => {
    router.navigate('dashboard');
    router.dispose();
    expect(dash.isMounted).toBe(false);
    expect(dash.unmountCalls).toBe(1);
    expect(router.getCurrent()).toBeNull();
  });

  it('lazy mount — screen is mounted only on first navigation', () => {
    router.navigate('dashboard');
    expect(dash.mountCalls).toBe(1);
    expect(pots.mountCalls).toBe(0); // jamais visité
  });
});

describe('screen-registry helpers', () => {
  it('NAV_OF_SCREEN covers every ScreenId', () => {
    for (const id of ALL_SCREEN_IDS) {
      expect(NAV_OF_SCREEN[id]).toBeDefined();
    }
  });

  it('buildScreenRegistry validates all factories present', () => {
    const partialFactories: Partial<Record<ScreenId, () => Screen>> = {};
    for (const id of ALL_SCREEN_IDS) {
      if (id === 'addPot') continue; // miss one
      partialFactories[id] = () => new FakeScreen(id);
    }
    expect(() => buildScreenRegistry(partialFactories)).toThrow(/factory manquante.*addPot/);
  });

  it('buildScreenRegistry returns map with all 16 entries', () => {
    const factories: Partial<Record<ScreenId, () => Screen>> = {};
    for (const id of ALL_SCREEN_IDS) {
      factories[id] = () => new FakeScreen(id);
    }
    const map = buildScreenRegistry(factories);
    expect(map.size).toBe(ALL_SCREEN_IDS.length);
    for (const id of ALL_SCREEN_IDS) {
      expect(map.get(id)?.id).toBe(id);
    }
  });

  it('factory is called once per screen (singleton-like)', () => {
    const factories: Partial<Record<ScreenId, () => Screen>> = {};
    const counters: Partial<Record<ScreenId, number>> = {};
    for (const id of ALL_SCREEN_IDS) {
      counters[id] = 0;
      factories[id] = vi.fn(() => {
        counters[id] = (counters[id] ?? 0) + 1;
        return new FakeScreen(id);
      });
    }
    buildScreenRegistry(factories);
    for (const id of ALL_SCREEN_IDS) {
      expect(counters[id]).toBe(1);
    }
  });
});
