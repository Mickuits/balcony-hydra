/**
 * Types des presets visuels du SafetyManager.
 */

import type { SafetyManagerState } from './hardware';

export type AccentColor = 'accent' | 'warn' | 'crit';

export interface SafetyPreset {
  label: string;
  badge: string;
  color: AccentColor;
  reason: string;
  /** SVG path/inner contents pour l'icône */
  icon: string;
  /** Afficher le timer de cooling auto-recovery */
  showCooling: boolean;
  /** Afficher le bouton unlock */
  showUnlock: boolean;
  relay: string;
  relayColor: AccentColor;
}

export type SafetyPresetsMap = Record<SafetyManagerState, SafetyPreset>;
