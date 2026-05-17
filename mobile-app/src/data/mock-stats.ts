/**
 * Seed initial STATS + STATS_PERIOD_CONFIG.
 */
import type { StatsState, StatsPeriodMap } from '@/types';

export const INITIAL_STATS: StatsState = {
  baseConsoLpd: 3.4,
  baseConsoS01: 2.3,
  baseConsoS02: 1.0,
  baseTempReference: 19.5,
  baseEt0Reference: 4.0,
  std7d: 0.7,
  std30d: 0.9,
  totalEvents7d: 47,
  totalSkipped7d: 12,
  totalLiters7d: 23.7,
  alertsLast7d: 5,
  potRanking7d: [
    { id: 'P04', liters: 2.84 },
    { id: 'P05', liters: 2.42 },
    { id: 'P08', liters: 2.18 },
    { id: 'P11', liters: 1.95 },
    { id: 'P15', liters: 1.42 },
  ],
};

export const STATS_PERIOD_CONFIG: StatsPeriodMap = {
  '24h': { label: '24H', short: '24H', days: 1, factor: 1 / 7, consoTitle: 'CONSO EAU · 24H' },
  '7d': { label: '7J', short: '7J', days: 7, factor: 1, consoTitle: 'CONSO EAU · 7 JOURS' },
  '30d': {
    label: '30J',
    short: '30J',
    days: 30,
    factor: 30 / 7,
    consoTitle: 'CONSO EAU · 30 JOURS',
  },
  season: {
    label: 'SAISON',
    short: 'SAISON',
    days: 90,
    factor: 90 / 7,
    consoTitle: 'CONSO EAU · SAISON (90J)',
  },
};
