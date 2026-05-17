import { describe, it, expect, beforeEach } from 'vitest';
import { VacationScreen, computeDays, renderVacationProjection } from './vacation.screen';
import { HardwareStore } from '@/stores/hardware.store';
import { StatsStore } from '@/stores/stats.store';
import { INITIAL_WEATHER } from '@/data/mock-weather';

describe('computeDays', () => {
  it('returns 0 for missing inputs', () => {
    expect(computeDays(undefined, undefined)).toBe(0);
    expect(computeDays('2026-01-01', undefined)).toBe(0);
  });
  it('returns 0 for invalid dates', () => {
    expect(computeDays('not-a-date', '2026-01-01')).toBe(0);
  });
  it('computes diff correctly', () => {
    expect(computeDays('2026-01-01', '2026-01-08')).toBe(7);
  });
  it('returns 0 for reversed dates (no negative durations)', () => {
    expect(computeDays('2026-01-10', '2026-01-01')).toBe(0);
  });
});

describe('renderVacationProjection', () => {
  it('shows "ok" verdict when safe', () => {
    const html = renderVacationProjection({
      days: 7,
      coef: 1.0,
      periodTag: 'DOUX',
      consoBase: 20,
      consoWithMargin: 25,
      totalTankCap: 50,
      deficit: -25,
      safe: true,
    });
    expect(html).toContain('Capacité suffisante');
  });
  it('shows "warn" verdict on deficit', () => {
    const html = renderVacationProjection({
      days: 30,
      coef: 1.5,
      periodTag: 'CHAUD',
      consoBase: 100,
      consoWithMargin: 130,
      totalTankCap: 50,
      deficit: 80,
      safe: false,
    });
    expect(html).toContain('Déficit prévu');
    expect(html).toContain('80.0 L');
  });
});

describe('VacationScreen', () => {
  let root: HTMLElement;
  let hardware: HardwareStore;
  let stats: StatsStore;
  let screen: VacationScreen;

  beforeEach(() => {
    root = document.createElement('div');
    hardware = new HardwareStore();
    stats = new StatsStore();
    screen = new VacationScreen({ hardware, stats, forecast: INITIAL_WEATHER });
  });

  it('mount renders form with start/end/margin', () => {
    screen.mount(root);
    expect(root.querySelector('#startDate')).not.toBeNull();
    expect(root.querySelector('#endDate')).not.toBeNull();
    expect(root.querySelector('#marginPct')).not.toBeNull();
  });

  it('activate computes initial projection', () => {
    screen.mount(root);
    screen.activate();
    const projection = root.querySelector('#vacationProjection');
    expect(projection?.textContent).toMatch(/jour/);
  });

  it('changing margin re-renders projection with updated label', () => {
    screen.mount(root);
    screen.activate();
    const slider = root.querySelector<HTMLInputElement>('#marginPct')!;
    slider.value = '40';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelector('#marginValue')?.textContent).toBe('+40 %');
  });

  it('reversed dates show warning', () => {
    screen.mount(root);
    screen.activate();
    root.querySelector<HTMLInputElement>('#endDate')!.value = '2020-01-01';
    root
      .querySelector<HTMLInputElement>('#endDate')!
      .dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.querySelector('#vacationProjection')?.textContent).toMatch(/Sélectionnez/);
  });
});
