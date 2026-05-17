/**
 * Helpers de lecture sur la collection de pots — fonctions pures.
 * Remplacent les helpers globaux du proto legacy (getPotsForController, etc.).
 */

import type { ControllerId, Pot, PotVisualState, ZoneLabel } from '@/types';

export interface PotEntry {
  id: string;
  pot: Pot;
}

function entriesOf(pots: Record<string, Pot>): PotEntry[] {
  return Object.entries(pots).map(([id, pot]) => ({ id, pot }));
}

export function getPotsForController(
  pots: Record<string, Pot>,
  controller: ControllerId
): PotEntry[] {
  return entriesOf(pots).filter((e) => e.pot.controller === controller);
}

export function getPotsByZone(pots: Record<string, Pot>, zone: ZoneLabel): PotEntry[] {
  return entriesOf(pots).filter((e) => e.pot.zone === zone);
}

export function getActivePots(pots: Record<string, Pot>): PotEntry[] {
  return entriesOf(pots).filter((e) => e.pot.state !== 'off');
}

export function getAlertPots(pots: Record<string, Pot>): PotEntry[] {
  const alertStates: PotVisualState[] = ['crit', 'dry', 'off'];
  return entriesOf(pots).filter((e) => alertStates.includes(e.pot.state));
}

export function avgHumidity(pots: Record<string, Pot>): number {
  const active = getActivePots(pots);
  if (active.length === 0) return 0;
  const sum = active.reduce((acc, e) => acc + e.pot.hum, 0);
  return sum / active.length;
}

export function avgHumidityZone(pots: Record<string, Pot>, zone: ZoneLabel): number {
  const inZone = getPotsByZone(pots, zone).filter((e) => e.pot.state !== 'off');
  if (inZone.length === 0) return 0;
  const sum = inZone.reduce((acc, e) => acc + e.pot.hum, 0);
  return sum / inZone.length;
}

export function countAlertsInPots(pots: Record<string, Pot>): number {
  return getAlertPots(pots).length;
}
