import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DashboardScreen } from './dashboard.screen';
import { BindingEngine } from '@/components/binding-engine/binding-engine';
import { HardwareStore } from '@/stores/hardware.store';

describe('DashboardScreen', () => {
  let root: HTMLElement;
  let hardware: HardwareStore;
  let bindings: BindingEngine;
  let onAction: ReturnType<typeof vi.fn>;
  let screen: DashboardScreen;

  beforeEach(() => {
    root = document.createElement('div');
    hardware = new HardwareStore();
    bindings = new BindingEngine();
    onAction = vi.fn();
    screen = new DashboardScreen({ hardware, bindings, onAction });
  });

  it('mount renders the template', () => {
    screen.mount(root);
    expect(root.querySelector('h1')?.textContent).toMatch(/Tableau de bord/);
    expect(root.querySelectorAll('[data-bind]').length).toBeGreaterThan(0);
  });

  it('mount registers all dashboard bindings', () => {
    screen.mount(root);
    expect(bindings.has('sys.uptime')).toBe(true);
    expect(bindings.has('pots.alertCount')).toBe(true);
    expect(bindings.has('safety.state')).toBe(true);
    expect(bindings.has('tanks.balcon.pct')).toBe(true);
  });

  it('activate paints initial values', () => {
    screen.mount(root);
    screen.activate();
    const safetyBadge = root.querySelector('[data-bind="safety.state"]');
    expect(safetyBadge?.textContent).toBe('NORMAL');
  });

  it('refresh re-applies bindings when store changes', () => {
    screen.mount(root);
    screen.activate();
    const before = root.querySelector('[data-bind="sys.uptime"]')?.textContent;
    hardware.update((s) => ({
      ...s,
      master: { ...s.master, uptime: s.master.uptime + 3600 },
    }));
    const after = root.querySelector('[data-bind="sys.uptime"]')?.textContent;
    expect(after).not.toBe(before);
  });

  it('click on data-action triggers onAction callback', () => {
    screen.mount(root);
    screen.activate();
    const btn = root.querySelector<HTMLElement>('[data-action="waterAll"]');
    btn?.click();
    expect(onAction).toHaveBeenCalledWith('waterAll');
  });

  it('click on data-action="openVacation" works', () => {
    screen.mount(root);
    screen.activate();
    const btn = root.querySelector<HTMLElement>('[data-action="openVacation"]');
    btn?.click();
    expect(onAction).toHaveBeenCalledWith('openVacation');
  });

  it('deactivate stops listening to store', () => {
    screen.mount(root);
    screen.activate();
    screen.deactivate();
    const before = root.querySelector('[data-bind="sys.uptime"]')?.textContent;
    hardware.update((s) => ({
      ...s,
      master: { ...s.master, uptime: s.master.uptime + 7200 },
    }));
    const after = root.querySelector('[data-bind="sys.uptime"]')?.textContent;
    expect(after).toBe(before);
  });

  it('unmount removes DOM + unregisters bindings + detaches click', () => {
    screen.mount(root);
    screen.activate();
    screen.unmount();
    expect(root.innerHTML).toBe('');
    expect(bindings.has('sys.uptime')).toBe(false);
    expect(bindings.has('pots.alertCount')).toBe(false);
    // Plus de click handler — onAction ne doit pas être appelé
    const btn = document.createElement('button');
    btn.dataset['action'] = 'waterAll';
    root.appendChild(btn);
    btn.click();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('alertCount reflects pots in crit/dry state', () => {
    hardware.update((s) => {
      const firstPotId = Object.keys(s.pots)[0]!;
      return {
        ...s,
        pots: { ...s.pots, [firstPotId]: { ...s.pots[firstPotId]!, state: 'crit' } },
      };
    });
    screen.mount(root);
    screen.activate();
    const count = root.querySelector('[data-bind="pots.alertCount"]')?.textContent;
    expect(parseInt(count ?? '0', 10)).toBeGreaterThanOrEqual(1);
  });
});
