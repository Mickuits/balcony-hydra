/**
 * Types UI — état éphémère de l'interface (non persisté).
 */

import type { StatsPeriodId } from './stats';

export type PotFilter = 'all' | 'crit' | 'dry' | 'watering' | 'off';

export type ScreenId =
  | 'dashboard'
  | 'pots'
  | 'detail'
  | 'stats'
  | 'profiles'
  | 'system'
  | 'tanks'
  | 'tankDetail'
  | 'tankConfig'
  | 'addTank'
  | 'tankEdit'
  | 'vacation'
  | 'configurator'
  | 'addPot'
  | 'editPot'
  | 'addPairing';

export type NavId = 'dashboard' | 'pots' | 'tanks' | 'stats' | 'system';

export type ToastLogTag = 'info' | 'ok' | 'warn' | 'error' | 'sys';

export interface LogEntry {
  time: string; // HH:MM:SS
  tag: ToastLogTag;
  msg: string;
}

export interface UiState {
  currentScreen: ScreenId;
  currentPotFilter: PotFilter;
  currentStatsPeriod: StatsPeriodId;
  /** Pot sélectionné dans la modale arrosage ou écran détail */
  selectedPotId: string | null;
  /** Tank sélectionné dans l'écran tank-detail */
  selectedTankId: string | null;
  /** Étape courante du wizard pairing (1-3) */
  pairingStep: number;
}
