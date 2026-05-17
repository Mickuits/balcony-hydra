/**
 * StatsStore — données analytiques + config des périodes.
 */
import { Store } from './store';
import { INITIAL_STATS, STATS_PERIOD_CONFIG } from '@/data';
import type { StatsState, StatsPeriodMap } from '@/types';

export interface StatsStoreShape {
  stats: StatsState;
  periodConfig: StatsPeriodMap;
}

const INITIAL: StatsStoreShape = {
  stats: INITIAL_STATS,
  periodConfig: STATS_PERIOD_CONFIG,
};

export class StatsStore extends Store<StatsStoreShape> {
  constructor(initial: StatsStoreShape = INITIAL) {
    super(initial);
  }
}

export const statsStore = new StatsStore();
