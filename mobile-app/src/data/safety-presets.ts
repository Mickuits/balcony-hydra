/**
 * Presets visuels du SafetyManager — pour chacun des 4 états :
 * label, badge, couleur, raison par défaut, icône SVG, visibilité du
 * cooling timer et du bouton unlock.
 */
import type { SafetyPresetsMap } from '@/types';

export const SAFETY_PRESETS: SafetyPresetsMap = {
  NORMAL: {
    label: 'NORMAL',
    badge: '● NORMAL',
    color: 'accent',
    reason: 'double-verrou armé · pompes opérationnelles',
    icon: '<path d="M20 13c0 5-3.5 7.5-8 8-4.5-.5-8-3-8-8V5l8-3 8 3v8z"/><polyline points="9 12 11 14 15 10"/>',
    showCooling: false,
    showUnlock: false,
    relay: '● ARMÉ',
    relayColor: 'accent',
  },
  THERMAL_LOCKOUT: {
    label: 'THERMAL LOCKOUT',
    badge: '▲ THERMAL',
    color: 'warn',
    reason: 'T° > 58°C détectée · pompes coupées · auto-recovery en cours',
    icon: '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4 4 0 1 0 5 0z"/>',
    showCooling: true,
    showUnlock: false,
    relay: '○ DÉSARMÉ',
    relayColor: 'warn',
  },
  HARD_LOCKOUT: {
    label: 'HARD LOCKOUT',
    badge: '■ HARD',
    color: 'crit',
    reason: 'overcurrent > 3A · pompe bloquée mécaniquement · unlock requis',
    icon: '<path d="M12 2L1 21h22L12 2z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    showCooling: false,
    showUnlock: true,
    relay: '○ DÉSARMÉ',
    relayColor: 'crit',
  },
  SAFE_MODE: {
    label: 'SAFE MODE',
    badge: '■ SAFE_MODE',
    color: 'crit',
    reason: '3+ boot crashes · pompe désactivée · WiFi+Telegram actifs pour /unlock distant',
    icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    showCooling: false,
    showUnlock: true,
    relay: '○ DÉSARMÉ',
    relayColor: 'crit',
  },
};
