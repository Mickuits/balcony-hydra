import { describe, it, expect } from 'vitest';
import { buildScreenFactories } from './index';
import { buildScreenRegistry, ALL_SCREEN_IDS } from '@/router';
import { BindingEngine } from '@/components/binding-engine/binding-engine';
import { HardwareStore } from '@/stores/hardware.store';

describe('buildScreenFactories', () => {
  it('produces factories for every ScreenId', () => {
    const factories = buildScreenFactories({
      dashboard: {
        hardware: new HardwareStore(),
        bindings: new BindingEngine(),
        onAction: () => {},
      },
    });
    for (const id of ALL_SCREEN_IDS) {
      expect(factories[id]).toBeDefined();
    }
  });

  it('integrates with buildScreenRegistry — all 16 screens instantiate', () => {
    const factories = buildScreenFactories({
      dashboard: {
        hardware: new HardwareStore(),
        bindings: new BindingEngine(),
        onAction: () => {},
      },
    });
    const registry = buildScreenRegistry(factories);
    expect(registry.size).toBe(ALL_SCREEN_IDS.length);
    for (const id of ALL_SCREEN_IDS) {
      expect(registry.get(id)?.id).toBe(id);
    }
  });

  it('dashboard factory returns real DashboardScreen', () => {
    const factories = buildScreenFactories({
      dashboard: {
        hardware: new HardwareStore(),
        bindings: new BindingEngine(),
        onAction: () => {},
      },
    });
    const dashboard = factories.dashboard!();
    const root = document.createElement('div');
    dashboard.mount(root);
    expect(root.querySelector('h1')?.textContent).toContain('Tableau de bord');
  });
});
