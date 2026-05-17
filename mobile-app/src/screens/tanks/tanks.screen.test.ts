import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TanksScreen, renderTankCard } from './tanks.screen';
import { HardwareStore } from '@/stores/hardware.store';
import { BindingEngine } from '@/components/binding-engine/binding-engine';

import type { Tank } from '@/types';

describe('renderTankCard', () => {
  const baseTank: Tank = {
    controller: 'SLAVE',
    name: 'Bidon balcon',
    cap: 25,
    vol: 18,
    lastFill: 3600 * 24,
    cycles: 5,
    sensorOk: true,
    distSensor: 10,
    distFull: 4,
    sigmaMm: 2,
    driftPct: 0,
    calibAge: 0,
  };

  it('renders NOMINAL status when level > 25%', () => {
    const html = renderTankCard('T01', baseTank);
    expect(html).toContain('NOMINAL');
    expect(html).toContain('tank-ok');
  });

  it('renders NIVEAU BAS when 10% <= level < 25%', () => {
    const html = renderTankCard('T01', { ...baseTank, vol: 4 });
    expect(html).toContain('NIVEAU BAS');
    expect(html).toContain('tank-warn');
  });

  it('renders CRITIQUE when level < 10%', () => {
    const html = renderTankCard('T01', { ...baseTank, vol: 1 });
    expect(html).toContain('CRITIQUE');
    expect(html).toContain('tank-crit');
  });

  it('shows last fill duration humanized', () => {
    const html = renderTankCard('T01', baseTank);
    expect(html).toContain('1j');
  });

  it('escapes HTML in tank name', () => {
    const html = renderTankCard('T01', { ...baseTank, name: '<img>' });
    expect(html).not.toContain('<img>');
    expect(html).toContain('&lt;img&gt;');
  });

  it('sets data-tank-id + aria-label', () => {
    const html = renderTankCard('T01', baseTank);
    expect(html).toContain('data-tank-id="T01"');
    expect(html).toMatch(/aria-label="Réservoir T01/);
  });
});

describe('TanksScreen', () => {
  let root: HTMLElement;
  let hardware: HardwareStore;
  let bindings: BindingEngine;
  let onAction: ReturnType<typeof vi.fn>;
  let screen: TanksScreen;

  beforeEach(() => {
    root = document.createElement('div');
    hardware = new HardwareStore();
    bindings = new BindingEngine();
    onAction = vi.fn();
    screen = new TanksScreen({ hardware, bindings, onAction });
  });

  it('renders 2 tanks (T01 + T02)', () => {
    screen.mount(root);
    screen.activate();
    const cards = root.querySelectorAll('[data-tank-id]');
    expect(cards.length).toBe(2);
  });

  it('click on tank → openDetail action', () => {
    screen.mount(root);
    screen.activate();
    const card = root.querySelector<HTMLElement>('[data-tank-id="T01"]');
    card?.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'openDetail', tankId: 'T01' });
  });

  it('click on addTank → action', () => {
    screen.mount(root);
    screen.activate();
    const btn = root.querySelector<HTMLElement>('[data-action="addTank"]');
    btn?.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'addTank' });
  });

  it('re-renders on hardware store change', () => {
    screen.mount(root);
    screen.activate();
    hardware.update((s) => ({
      ...s,
      tanks: { ...s.tanks, T01: { ...s.tanks.T01!, vol: 1 } },
    }));
    const t01 = root.querySelector('[data-tank-id="T01"]');
    expect(t01?.innerHTML).toContain('CRITIQUE');
  });

  it('unmount cleans up', () => {
    screen.mount(root);
    screen.activate();
    screen.unmount();
    expect(root.innerHTML).toBe('');
  });
});
