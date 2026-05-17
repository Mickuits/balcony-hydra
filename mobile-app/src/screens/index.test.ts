import { describe, it, expect } from 'vitest';
import { buildScreenFactories, type ScreenFactoriesDeps } from './index';
import { buildScreenRegistry, ALL_SCREEN_IDS } from '@/router';
import { BindingEngine } from '@/components/binding-engine/binding-engine';
import { HardwareStore } from '@/stores/hardware.store';
import { ConfigStore } from '@/stores/config.store';
import { UiStore } from '@/stores/ui.store';
import { StatsStore } from '@/stores/stats.store';
import { StorageService } from '@/services/storage';
import { ConfigBackupService } from '@/services/config-backup';
import { INITIAL_PROFILES, INITIAL_WEATHER } from '@/data';

function makeDeps(): ScreenFactoriesDeps {
  const storage = new StorageService();
  return {
    hardware: new HardwareStore(),
    config: new ConfigStore(),
    ui: new UiStore(),
    stats: new StatsStore(),
    bindings: new BindingEngine(),
    storage,
    backup: new ConfigBackupService({ storage, buildId: 'test' }),
    profiles: INITIAL_PROFILES,
    forecast: INITIAL_WEATHER,
    callbacks: {
      onDashboard: () => {},
      onPots: () => {},
      onTanks: () => {},
      onSystem: () => {},
      onDetail: () => {},
      onTankDetail: () => {},
      onTankConfig: () => {},
      onTankEdit: () => {},
      onEditPot: () => {},
      onConfigurator: () => {},
      onAddPotComplete: () => {},
      onAddPotCancel: () => {},
      onAddPairingComplete: () => {},
      onAddPairingCancel: () => {},
      onAddTankComplete: () => {},
      onAddTankCancel: () => {},
    },
  };
}

describe('buildScreenFactories (VAGUE 2.D — 16 screens portés)', () => {
  it('produces factories for every ScreenId (no stub remaining)', () => {
    const factories = buildScreenFactories(makeDeps());
    for (const id of ALL_SCREEN_IDS) {
      expect(factories[id]).toBeDefined();
    }
  });

  it('builds a complete registry without errors', () => {
    const factories = buildScreenFactories(makeDeps());
    const registry = buildScreenRegistry(factories);
    expect(registry.size).toBe(ALL_SCREEN_IDS.length);
    for (const id of ALL_SCREEN_IDS) {
      expect(registry.get(id)?.id).toBe(id);
    }
  });

  it('every screen mounts without throwing', () => {
    const factories = buildScreenFactories(makeDeps());
    for (const id of ALL_SCREEN_IDS) {
      const screen = factories[id]!();
      const root = document.createElement('div');
      expect(() => screen.mount(root)).not.toThrow();
    }
  });

  it('every screen activate+deactivate roundtrip works', () => {
    const factories = buildScreenFactories(makeDeps());
    for (const id of ALL_SCREEN_IDS) {
      const screen = factories[id]!();
      const root = document.createElement('div');
      screen.mount(root);
      expect(() => screen.activate()).not.toThrow();
      expect(() => screen.deactivate()).not.toThrow();
      expect(() => screen.unmount()).not.toThrow();
    }
  });
});
