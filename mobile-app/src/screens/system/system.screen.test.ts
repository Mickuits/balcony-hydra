import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SystemScreen } from './system.screen';
import { HardwareStore } from '@/stores/hardware.store';
import { BindingEngine } from '@/components/binding-engine/binding-engine';

describe('SystemScreen', () => {
  let root: HTMLElement;
  let hardware: HardwareStore;
  let bindings: BindingEngine;
  let onAction: ReturnType<typeof vi.fn>;
  let screen: SystemScreen;

  beforeEach(() => {
    root = document.createElement('div');
    hardware = new HardwareStore();
    bindings = new BindingEngine();
    onAction = vi.fn();
    screen = new SystemScreen({ hardware, bindings, onAction });
  });

  it('renders master/slave/safety/pairing/maintenance sections', () => {
    screen.mount(root);
    screen.activate();
    expect(root.textContent).toMatch(/Maître/);
    expect(root.textContent).toMatch(/Esclave/);
    expect(root.textContent).toMatch(/Appairage/);
    expect(root.textContent).toMatch(/Sécurité/);
    expect(root.textContent).toMatch(/Maintenance/);
  });

  it('shows safety state binding', () => {
    screen.mount(root);
    screen.activate();
    const state = root.querySelector('[data-bind="system.safety.state"]')?.textContent;
    expect(state).toBe('NORMAL');
  });

  it('reflects pairing status', () => {
    screen.mount(root);
    screen.activate();
    expect(root.querySelector('[data-bind="system.pairing.status"]')?.textContent).toBe('PAIRED');
  });

  it('shows OFFLINE when slave offline', () => {
    hardware.update((s) => ({
      ...s,
      slaves: { ...s.slaves, SLAVE: { ...s.slaves.SLAVE!, online: false } },
    }));
    screen.mount(root);
    screen.activate();
    expect(root.querySelector('[data-bind="system.slave.online"]')?.textContent).toBe('OFFLINE');
  });

  it('click reboot triggers onAction', () => {
    screen.mount(root);
    screen.activate();
    root.querySelector<HTMLElement>('[data-action="reboot"]')?.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'reboot' });
  });

  it('click factoryReset triggers onAction', () => {
    screen.mount(root);
    screen.activate();
    root.querySelector<HTMLElement>('[data-action="factoryReset"]')?.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'factoryReset' });
  });

  it('click safetyUnlock triggers onAction', () => {
    screen.mount(root);
    screen.activate();
    root.querySelector<HTMLElement>('[data-action="safetyUnlock"]')?.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'safetyUnlock' });
  });

  it('click pairSlave triggers onAction', () => {
    screen.mount(root);
    screen.activate();
    root.querySelector<HTMLElement>('[data-action="pairSlave"]')?.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'pairSlave' });
  });

  it('reflects safety state change live', () => {
    screen.mount(root);
    screen.activate();
    hardware.setSafetyState('THERMAL_LOCKOUT', 'T° > 58°C');
    expect(root.querySelector('[data-bind="system.safety.state"]')?.textContent).toBe(
      'THERMAL_LOCKOUT'
    );
    expect(root.querySelector('[data-bind="system.safety.reason"]')?.textContent).toBe('T° > 58°C');
  });

  it('unmount unregisters all bindings', () => {
    screen.mount(root);
    screen.activate();
    screen.unmount();
    expect(bindings.has('system.master.uptime')).toBe(false);
    expect(bindings.has('system.safety.state')).toBe(false);
  });
});
