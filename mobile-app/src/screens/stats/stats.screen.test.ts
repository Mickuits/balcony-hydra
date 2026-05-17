import { describe, it, expect, beforeEach } from 'vitest';
import { StatsScreen } from './stats.screen';
import { StatsStore } from '@/stores/stats.store';
import { UiStore } from '@/stores/ui.store';
import { BindingEngine } from '@/components/binding-engine/binding-engine';

describe('StatsScreen', () => {
  let root: HTMLElement;
  let stats: StatsStore;
  let ui: UiStore;
  let bindings: BindingEngine;
  let screen: StatsScreen;

  beforeEach(() => {
    root = document.createElement('div');
    stats = new StatsStore();
    ui = new UiStore();
    bindings = new BindingEngine();
    screen = new StatsScreen({ stats, ui, bindings });
  });

  it('mount renders 4 period tabs + 4 KPIs', () => {
    screen.mount(root);
    expect(root.querySelectorAll('[data-period]').length).toBe(4);
    expect(root.querySelectorAll('.kpi').length).toBe(4);
  });

  it('default period is 7d (matches UiStore default)', () => {
    screen.mount(root);
    screen.activate();
    const tab7d = root.querySelector('[data-period="7d"]');
    expect(tab7d?.classList.contains('active')).toBe(true);
    expect(tab7d?.getAttribute('aria-selected')).toBe('true');
  });

  it('clicking a period tab updates UiStore + highlights it', () => {
    screen.mount(root);
    screen.activate();
    const tab30d = root.querySelector<HTMLElement>('[data-period="30d"]');
    tab30d?.click();
    expect(ui.get().currentStatsPeriod).toBe('30d');
    expect(tab30d?.classList.contains('active')).toBe(true);
  });

  it('totalConso scales by period factor', () => {
    screen.mount(root);
    screen.activate();
    const baseLiters = stats.get().stats.totalLiters7d; // factor 7d = 1
    const initial = root.querySelector('[data-bind="stats.totalConso"]')?.textContent;
    expect(initial).toContain(baseLiters.toFixed(1));

    ui.setStatsPeriod('30d'); // factor 30/7
    const scaled = root.querySelector('[data-bind="stats.totalConso"]')?.textContent;
    expect(scaled).toContain((baseLiters * (30 / 7)).toFixed(1));
  });

  it('cycles rounded to integer', () => {
    screen.mount(root);
    screen.activate();
    const cycles = root.querySelector('[data-bind="stats.cycles"]')?.textContent ?? '';
    expect(Number.isInteger(parseInt(cycles, 10))).toBe(true);
  });

  it('period label changes with selection', () => {
    screen.mount(root);
    screen.activate();
    ui.setStatsPeriod('season');
    expect(root.querySelector('[data-bind="stats.period.label"]')?.textContent).toContain('Saison');
  });

  it('unmount unregisters bindings', () => {
    screen.mount(root);
    screen.activate();
    screen.unmount();
    expect(bindings.has('stats.totalConso')).toBe(false);
    expect(bindings.has('stats.period.label')).toBe(false);
  });
});
