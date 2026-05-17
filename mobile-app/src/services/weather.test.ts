import { describe, it, expect } from 'vitest';
import { computeWeatherCoefficient, extendForecastToDays } from './weather';
import type { WeatherForecast } from '@/types';

const REFS = { baseTempReference: 19.5, baseEt0Reference: 4.0 };

function day(tmax: number, tmin: number, precip = 0, et0 = 4.0): WeatherForecast[number] {
  return { tmax, tmin, precip, et0 };
}

describe('computeWeatherCoefficient', () => {
  it('throws on empty forecast', () => {
    expect(() => computeWeatherCoefficient([], REFS)).toThrow(/vide/);
  });

  it('returns coef ≈ 1.0 when forecast matches references exactly', () => {
    // Tmean = 19.5 (= ref), ET0 = 4.0 (= ref), precip = 0 → tempAdj=0, et0Adj=0, rainComp=0
    const fc: WeatherForecast = [day(24, 15, 0, 4.0)];
    const w = computeWeatherCoefficient(fc, REFS);
    expect(w.coef).toBeCloseTo(1.0, 3);
    expect(w.breakdown.tempAdj).toBeCloseTo(0, 3);
    expect(w.breakdown.et0Adj).toBeCloseTo(0, 3);
    expect(w.breakdown.rainComp).toBeCloseTo(0, 6);
  });

  it('increases coef on heat (Tmean > ref)', () => {
    // Tmean = 30, écart +10.5 °C → tempAdj = 10.5 * 0.03 = 0.315
    // ET0 = 6.0, ratio 1.5 → et0Adj = 0.5 * 0.4 = 0.2
    const fc: WeatherForecast = [day(35, 25, 0, 6.0)];
    const w = computeWeatherCoefficient(fc, REFS);
    expect(w.coef).toBeGreaterThan(1.4);
    expect(w.breakdown.tempAdj).toBeGreaterThan(0);
    expect(w.breakdown.et0Adj).toBeGreaterThan(0);
  });

  it('decreases coef on cold + rain (but never below 0.5)', () => {
    // Tmean = 5°C, écart -14.5 → tempAdj = -0.435
    // ET0 = 1.0, ratio 0.25 → et0Adj = -0.75 * 0.4 = -0.3
    // Precip = 50 mm → rainComp = -0.35
    // Total = 1.0 - 0.435 - 0.3 - 0.35 = -0.085 → floor 0.5
    const fc: WeatherForecast = [day(8, 2, 50, 1.0)];
    const w = computeWeatherCoefficient(fc, REFS);
    expect(w.coef).toBe(0.5);
  });

  it('counts heat days (Tmax >= 30°C)', () => {
    const fc: WeatherForecast = [day(35, 22), day(28, 18), day(31, 20), day(29, 19)];
    const w = computeWeatherCoefficient(fc, REFS);
    expect(w.summary.heatDays).toBe(2);
  });

  it('averages multi-day forecast', () => {
    const fc: WeatherForecast = [day(20, 10, 5, 3.0), day(30, 20, 0, 5.0)];
    const w = computeWeatherCoefficient(fc, REFS);
    expect(w.summary.avgTmax).toBe(25);
    expect(w.summary.avgTmin).toBe(15);
    expect(w.summary.avgTmean).toBe(20);
    expect(w.summary.totalPrecip).toBe(5);
    expect(w.summary.avgEt0).toBe(4.0);
  });

  it('classifies period tag correctly', () => {
    expect(computeWeatherCoefficient([day(15, 5)], REFS).periodTag).toBe('HIVER');
    expect(computeWeatherCoefficient([day(20, 12)], REFS).periodTag).toBe('FRAIS');
    expect(computeWeatherCoefficient([day(25, 17)], REFS).periodTag).toBe('DOUX');
    expect(computeWeatherCoefficient([day(30, 22)], REFS).periodTag).toBe('CHAUD MODÉRÉ');
    expect(computeWeatherCoefficient([day(33, 25)], REFS).periodTag).toBe('CHAUD');
    expect(computeWeatherCoefficient([day(38, 28)], REFS).periodTag).toBe('CANICULAIRE');
  });

  it('rain compensates heat partially', () => {
    const noRain = computeWeatherCoefficient([day(32, 22, 0, 5.0)], REFS).coef;
    const withRain = computeWeatherCoefficient([day(32, 22, 30, 5.0)], REFS).coef;
    expect(withRain).toBeLessThan(noRain);
    // rainComp = 30 * -0.007 = -0.21
    expect(noRain - withRain).toBeCloseTo(0.21, 3);
  });
});

describe('extendForecastToDays', () => {
  it('returns empty when days <= 0', () => {
    expect(extendForecastToDays([day(20, 10)], 0)).toEqual([]);
  });

  it('returns empty when forecast is empty', () => {
    expect(extendForecastToDays([], 5)).toEqual([]);
  });

  it('slices when forecast longer than days', () => {
    const fc: WeatherForecast = [day(20, 10), day(21, 11), day(22, 12)];
    const out = extendForecastToDays(fc, 2);
    expect(out).toHaveLength(2);
    expect(out[0]?.tmax).toBe(20);
    expect(out[1]?.tmax).toBe(21);
  });

  it('extends with averaged days when forecast shorter', () => {
    const fc: WeatherForecast = [day(20, 10, 0, 4.0), day(30, 20, 10, 6.0)];
    const out = extendForecastToDays(fc, 5);
    expect(out).toHaveLength(5);
    // 2 premiers = originaux
    expect(out[0]?.tmax).toBe(20);
    expect(out[1]?.tmax).toBe(30);
    // 3 derniers = moyenne (Tmax 25, Tmin 15, precip 5, et0 5)
    expect(out[2]?.tmax).toBe(25);
    expect(out[3]?.tmin).toBe(15);
    expect(out[4]?.et0).toBe(5);
  });

  it('does not mutate input forecast', () => {
    const fc: WeatherForecast = [day(20, 10)];
    const before = JSON.stringify(fc);
    extendForecastToDays(fc, 10);
    expect(JSON.stringify(fc)).toBe(before);
  });
});
