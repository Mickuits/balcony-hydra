/**
 * Barrel export + factory map pour tous les screens.
 *
 * Au boot, `main.ts` construit le registre via `buildScreenRegistry()`
 * (voir `router/screen-registry.ts`) en passant cette map de factories.
 *
 * VAGUE 2.D : les 16 screens sont désormais portés en TypeScript strict.
 * Chaque factory consomme les deps qu'il lui faut depuis ScreenFactoriesDeps.
 */
import type { ScreenId, PlantProfile, WeatherForecast } from '@/types';
import type { Screen } from '@/router';
import type { HardwareStore } from '@/stores/hardware.store';
import type { ConfigStore } from '@/stores/config.store';
import type { UiStore } from '@/stores/ui.store';
import type { StatsStore } from '@/stores/stats.store';
import type { BindingEngine } from '@/components/binding-engine/binding-engine';
import type { StorageService } from '@/services/storage';
import { DashboardScreen, type DashboardAction } from './dashboard/dashboard.screen';
import { PotsScreen, type PotsAction } from './pots/pots.screen';
import { TanksScreen, type TanksAction } from './tanks/tanks.screen';
import { ProfilesScreen } from './profiles/profiles.screen';
import { StatsScreen } from './stats/stats.screen';
import { SystemScreen, type SystemAction } from './system/system.screen';
import { DetailScreen, type DetailAction } from './detail/detail.screen';
import { TankDetailScreen, type TankDetailAction } from './tank-detail/tank-detail.screen';
import { TankConfigScreen, type TankConfigAction } from './tank-config/tank-config.screen';
import { TankEditScreen, type TankEditAction } from './tank-edit/tank-edit.screen';
import { EditPotScreen, type EditPotAction } from './edit-pot/edit-pot.screen';
import { VacationScreen } from './vacation/vacation.screen';
import { ConfiguratorScreen, type ConfiguratorAction } from './configurator/configurator.screen';
import { AddPotScreen, type NewPotState } from './add-pot/add-pot.screen';
import { AddPairingScreen, type NewPairingState } from './add-pairing/add-pairing.screen';
import { AddTankScreen, type NewTankState } from './add-tank/add-tank.screen';

// Re-export pour usage externe
export { DashboardScreen, PotsScreen, TanksScreen, ProfilesScreen };
export { StatsScreen, SystemScreen, DetailScreen };
export { TankDetailScreen, TankConfigScreen, TankEditScreen };
export { EditPotScreen, VacationScreen, ConfiguratorScreen };
export { AddPotScreen, AddPairingScreen, AddTankScreen };
export type {
  DashboardAction,
  PotsAction,
  TanksAction,
  SystemAction,
  DetailAction,
  TankDetailAction,
  TankConfigAction,
  TankEditAction,
  EditPotAction,
  ConfiguratorAction,
  NewPotState,
  NewPairingState,
  NewTankState,
};

export interface ScreenFactoriesDeps {
  hardware: HardwareStore;
  config: ConfigStore;
  ui: UiStore;
  stats: StatsStore;
  bindings: BindingEngine;
  storage: StorageService;
  profiles: Record<string, PlantProfile>;
  forecast: WeatherForecast;
  /** Callbacks centralisés (dispatchés vers le routeur depuis main.ts). */
  callbacks: {
    onDashboard: (action: DashboardAction) => void;
    onPots: (action: PotsAction) => void;
    onTanks: (action: TanksAction) => void;
    onSystem: (action: SystemAction) => void;
    onDetail: (action: DetailAction) => void;
    onTankDetail: (action: TankDetailAction) => void;
    onTankConfig: (action: TankConfigAction) => void;
    onTankEdit: (action: TankEditAction) => void;
    onEditPot: (action: EditPotAction) => void;
    onConfigurator: (action: ConfiguratorAction) => void;
    onAddPotComplete: (state: NewPotState) => void;
    onAddPotCancel: () => void;
    onAddPairingComplete: (state: NewPairingState) => void;
    onAddPairingCancel: () => void;
    onAddTankComplete: (state: NewTankState) => void;
    onAddTankCancel: () => void;
  };
}

/**
 * Construit toutes les factories Screen pour le routeur (16 screens portés).
 */
export function buildScreenFactories(
  deps: ScreenFactoriesDeps
): Partial<Record<ScreenId, () => Screen>> {
  const cb = deps.callbacks;
  return {
    dashboard: () =>
      new DashboardScreen({
        hardware: deps.hardware,
        bindings: deps.bindings,
        onAction: cb.onDashboard,
      }),
    pots: () =>
      new PotsScreen({
        hardware: deps.hardware,
        ui: deps.ui,
        bindings: deps.bindings,
        onAction: cb.onPots,
      }),
    tanks: () =>
      new TanksScreen({ hardware: deps.hardware, bindings: deps.bindings, onAction: cb.onTanks }),
    profiles: () => new ProfilesScreen({ hardware: deps.hardware, profiles: deps.profiles }),
    stats: () => new StatsScreen({ stats: deps.stats, ui: deps.ui, bindings: deps.bindings }),
    system: () =>
      new SystemScreen({
        hardware: deps.hardware,
        bindings: deps.bindings,
        onAction: cb.onSystem,
      }),
    detail: () =>
      new DetailScreen({
        hardware: deps.hardware,
        ui: deps.ui,
        profiles: deps.profiles,
        onAction: cb.onDetail,
      }),
    tankDetail: () =>
      new TankDetailScreen({ hardware: deps.hardware, ui: deps.ui, onAction: cb.onTankDetail }),
    tankConfig: () =>
      new TankConfigScreen({ hardware: deps.hardware, ui: deps.ui, onAction: cb.onTankConfig }),
    tankEdit: () =>
      new TankEditScreen({ hardware: deps.hardware, ui: deps.ui, onAction: cb.onTankEdit }),
    editPot: () =>
      new EditPotScreen({
        hardware: deps.hardware,
        ui: deps.ui,
        profiles: deps.profiles,
        onAction: cb.onEditPot,
      }),
    vacation: () =>
      new VacationScreen({ hardware: deps.hardware, stats: deps.stats, forecast: deps.forecast }),
    configurator: () =>
      new ConfiguratorScreen({
        config: deps.config,
        storage: deps.storage,
        onAction: cb.onConfigurator,
      }),
    addPot: () =>
      new AddPotScreen({
        profiles: deps.profiles,
        onComplete: cb.onAddPotComplete,
        onCancel: cb.onAddPotCancel,
      }),
    addPairing: () =>
      new AddPairingScreen({
        onComplete: cb.onAddPairingComplete,
        onCancel: cb.onAddPairingCancel,
      }),
    addTank: () =>
      new AddTankScreen({ onComplete: cb.onAddTankComplete, onCancel: cb.onAddTankCancel }),
  };
}
