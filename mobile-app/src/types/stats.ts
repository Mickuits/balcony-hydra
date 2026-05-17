/**
 * Types des statistiques + périodes d'analyse.
 */

export type StatsPeriodId = '24h' | '7d' | '30d' | 'season';

export interface StatsPeriodConfig {
  label: string;
  short: string;
  days: number;
  /** Facteur multiplicatif relatif à la baseline 7j */
  factor: number;
  consoTitle: string;
}

export type StatsPeriodMap = Record<StatsPeriodId, StatsPeriodConfig>;

export interface PotRankingEntry {
  id: string;
  liters: number;
}

export interface StatsState {
  baseConsoLpd: number; // L/jour global
  baseConsoS01: number; // L/jour zone A (slave)
  baseConsoS02: number; // L/jour zone B (master)
  baseTempReference: number; // °C
  baseEt0Reference: number; // mm/jour évapotranspiration référence
  std7d: number;
  std30d: number;
  totalEvents7d: number;
  totalSkipped7d: number;
  totalLiters7d: number;
  alertsLast7d: number;
  potRanking7d: PotRankingEntry[];
}
