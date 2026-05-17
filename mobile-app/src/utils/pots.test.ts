import { describe, it, expect } from 'vitest';
import type { Pot } from '@/types';
import {
  getPotsForController,
  getPotsByZone,
  getActivePots,
  getAlertPots,
  avgHumidity,
  avgHumidityZone,
  countAlertsInPots,
} from './pots';

function makePot(overrides: Partial<Pot> = {}): Pot {
  return {
    controller: 'SLAVE',
    muxChannel: 0,
    hum: 50,
    tempSoil: 20,
    ec: 1.0,
    lastWater: 3600,
    profileId: 'HERB_MED',
    name: 'Test',
    species: 'Test sp.',
    nameShort: 'Test',
    zone: 'balcon',
    state: 'ok',
    vol: 150,
    ...overrides,
  };
}

const fixturePots: Record<string, Pot> = {
  P01: makePot({ controller: 'SLAVE', zone: 'balcon', hum: 60, state: 'ok' }),
  P02: makePot({ controller: 'SLAVE', zone: 'balcon', hum: 22, state: 'crit' }),
  P03: makePot({ controller: 'SLAVE', zone: 'balcon', hum: 0, state: 'off' }),
  P11: makePot({ controller: 'MASTER', zone: 'interieur', hum: 70, state: 'high' }),
  P12: makePot({ controller: 'MASTER', zone: 'interieur', hum: 30, state: 'dry' }),
};

describe('getPotsForController', () => {
  it('filters by controller', () => {
    const slaves = getPotsForController(fixturePots, 'SLAVE');
    expect(slaves).toHaveLength(3);
    expect(slaves.map((e) => e.id).sort()).toEqual(['P01', 'P02', 'P03']);

    const masters = getPotsForController(fixturePots, 'MASTER');
    expect(masters).toHaveLength(2);
  });

  it('returns [] when no pot matches', () => {
    expect(getPotsForController({}, 'SLAVE')).toEqual([]);
  });
});

describe('getPotsByZone', () => {
  it('filters by zone label', () => {
    expect(getPotsByZone(fixturePots, 'balcon')).toHaveLength(3);
    expect(getPotsByZone(fixturePots, 'interieur')).toHaveLength(2);
  });
});

describe('getActivePots', () => {
  it('excludes off state', () => {
    const active = getActivePots(fixturePots);
    expect(active.map((e) => e.id).sort()).toEqual(['P01', 'P02', 'P11', 'P12']);
    expect(active).toHaveLength(4);
  });
});

describe('getAlertPots', () => {
  it('includes crit, dry, off', () => {
    const alerts = getAlertPots(fixturePots);
    expect(alerts.map((e) => e.id).sort()).toEqual(['P02', 'P03', 'P12']);
    expect(alerts).toHaveLength(3);
  });
});

describe('avgHumidity', () => {
  it('averages only active pots', () => {
    // (60 + 22 + 70 + 30) / 4 = 45.5
    expect(avgHumidity(fixturePots)).toBeCloseTo(45.5, 1);
  });

  it('returns 0 for empty/all-off', () => {
    expect(avgHumidity({})).toBe(0);
    expect(avgHumidity({ P01: makePot({ state: 'off' }) })).toBe(0);
  });
});

describe('avgHumidityZone', () => {
  it('averages by zone, excluding off', () => {
    // balcon: P01=60, P02=22 (P03 off) → 41
    expect(avgHumidityZone(fixturePots, 'balcon')).toBeCloseTo(41, 0);
    // interieur: P11=70, P12=30 → 50
    expect(avgHumidityZone(fixturePots, 'interieur')).toBe(50);
  });
});

describe('countAlertsInPots', () => {
  it('matches getAlertPots length', () => {
    expect(countAlertsInPots(fixturePots)).toBe(3);
    expect(countAlertsInPots({})).toBe(0);
  });
});
