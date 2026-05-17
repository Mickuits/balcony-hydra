/**
 * Bindings du Dashboard — fonctions pures qui lisent les stores.
 *
 * Le test garantit que chaque binding existe et produit une valeur typée.
 */
import type { BindingProducer } from '@/components/binding-engine/binding-engine';
import type { HardwareStore } from '@/stores/hardware.store';
import { fmtUptime, fmtPct } from '@/utils/format';
import { getAlertPots, avgHumidity } from '@/utils/pots';

export interface DashboardBindingsDeps {
  hardware: HardwareStore;
}

export function buildDashboardBindings(
  deps: DashboardBindingsDeps
): Record<string, BindingProducer> {
  const { hardware } = deps;

  return {
    'sys.uptime': () => fmtUptime(hardware.get().master.uptime),
    'sys.lastSync': () => `${Math.round(hardware.get().master.lastSync)}s`,
    'sys.ramUsed': () => `${hardware.get().master.ramUsed}`,
    'sys.mqttRtt': () => `${hardware.get().master.mqttRtt}`,
    'safety.state': () => hardware.get().safety.state,
    'safety.tempPcb': () => `${hardware.get().safety.tempPcb.toFixed(1)}`,
    'pots.alertCount': () => `${getAlertPots(hardware.get().pots).length}`,
    'pots.avgHumidity': () => fmtPct(avgHumidity(hardware.get().pots), 0),
    'tanks.balcon.pct': () => {
      const tank = hardware.get().tanks.T01;
      if (!tank) return '—';
      return fmtPct((tank.vol / tank.cap) * 100, 0);
    },
    'tanks.interieur.pct': () => {
      const tank = hardware.get().tanks.T02;
      if (!tank) return '—';
      return fmtPct((tank.vol / tank.cap) * 100, 0);
    },
  };
}
