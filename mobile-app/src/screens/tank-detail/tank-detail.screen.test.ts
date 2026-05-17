import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TankDetailScreen, renderTankDetail } from './tank-detail.screen';
import { HardwareStore } from '@/stores/hardware.store';
import { UiStore } from '@/stores/ui.store';

import type { Tank } from '@/types';

describe('renderTankDetail', () => {
  const baseTank: Tank = {
    controller: 'SLAVE',
    name: 'Balcon',
    cap: 25,
    vol: 20,
    lastFill: 3600 * 48,
    cycles: 0,
    sensorOk: true,
    distSensor: 10,
    distFull: 4,
    sigmaMm: 2,
    driftPct: 0,
    calibAge: 0,
  };

  it('renders volume + capacity', () => {
    const html = renderTankDetail(baseTank, []);
    expect(html).toContain('20.0 L');
    expect(html).toContain('25.0 L');
  });

  it('shows critical class when level < 10%', () => {
    const html = renderTankDetail({ ...baseTank, vol: 1 }, []);
    expect(html).toContain('tank-detail-crit');
  });

  it('shows warn class when 10% <= level < 25%', () => {
    const html = renderTankDetail({ ...baseTank, vol: 3 }, []);
    expect(html).toContain('tank-detail-warn');
  });

  it('shows fed pots count', () => {
    const fakePots = [{ zone: 'balcon' } as never, { zone: 'balcon' } as never];
    const html = renderTankDetail(baseTank, fakePots);
    expect(html).toContain('<dd>2</dd>');
  });
});

describe('TankDetailScreen', () => {
  let root: HTMLElement;
  let hardware: HardwareStore;
  let ui: UiStore;
  let onAction: ReturnType<typeof vi.fn>;
  let screen: TankDetailScreen;

  beforeEach(() => {
    root = document.createElement('div');
    hardware = new HardwareStore();
    ui = new UiStore();
    onAction = vi.fn();
    screen = new TankDetailScreen({ hardware, ui, onAction });
  });

  it('activate with selectedId sets ui tank + renders detail', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'T01' });
    expect(ui.get().selectedTankId).toBe('T01');
    expect(root.querySelector('h1')?.textContent).toContain('T01');
  });

  it('click back triggers action', () => {
    screen.mount(root);
    screen.activate();
    root.querySelector<HTMLElement>('[data-action="back"]')?.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'back' });
  });

  it('click markFilled triggers action with tankId', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'T01' });
    root.querySelector<HTMLElement>('[data-action="markFilled"]')?.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'markFilled', tankId: 'T01' });
  });

  it('shows "introuvable" for unknown tank', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'TXXX' });
    expect(root.querySelector('h1')?.textContent).toContain('introuvable');
  });

  it('shows "Aucun" when no tank selected', () => {
    screen.mount(root);
    screen.activate();
    expect(root.querySelector('h1')?.textContent).toContain('Aucun');
  });
});
