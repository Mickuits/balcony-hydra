import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TankConfigScreen } from './tank-config.screen';
import { HardwareStore } from '@/stores/hardware.store';
import { UiStore } from '@/stores/ui.store';

describe('TankConfigScreen', () => {
  let root: HTMLElement;
  let hardware: HardwareStore;
  let ui: UiStore;
  let onAction: ReturnType<typeof vi.fn>;
  let screen: TankConfigScreen;

  beforeEach(() => {
    root = document.createElement('div');
    hardware = new HardwareStore();
    ui = new UiStore();
    onAction = vi.fn();
    screen = new TankConfigScreen({ hardware, ui, onAction });
  });

  function submitForm(): void {
    const form = root.querySelector<HTMLFormElement>('#tankConfigForm');
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  it('renders form with critPct + warnPct inputs', () => {
    screen.mount(root);
    expect(root.querySelector<HTMLInputElement>('#critPct')).not.toBeNull();
    expect(root.querySelector<HTMLInputElement>('#warnPct')).not.toBeNull();
  });

  it('activate with selectedId selects tank in UiStore', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'T01' });
    expect(ui.get().selectedTankId).toBe('T01');
  });

  it('submit with valid values dispatches save action', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'T01' });
    root.querySelector<HTMLInputElement>('#critPct')!.value = '8';
    root.querySelector<HTMLInputElement>('#warnPct')!.value = '20';
    submitForm();
    expect(onAction).toHaveBeenCalledWith({
      type: 'save',
      payload: { tankId: 'T01', critPct: 8, warnPct: 20 },
    });
  });

  it('rejects critPct >= warnPct', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'T01' });
    root.querySelector<HTMLInputElement>('#critPct')!.value = '20';
    root.querySelector<HTMLInputElement>('#warnPct')!.value = '15';
    submitForm();
    const err = root.querySelector('#formError');
    expect(err?.textContent).toContain('inférieur');
    expect(err?.hasAttribute('hidden')).toBe(false);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('rejects out-of-range values', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'T01' });
    root.querySelector<HTMLInputElement>('#critPct')!.value = '999';
    root.querySelector<HTMLInputElement>('#warnPct')!.value = '20';
    submitForm();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('back button dispatches back action', () => {
    screen.mount(root);
    screen.activate();
    root.querySelector<HTMLElement>('[data-action="back"]')?.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'back' });
  });

  it('no-op submit when no tank selected', () => {
    screen.mount(root);
    screen.activate(); // pas de selectedId
    submitForm();
    expect(onAction).not.toHaveBeenCalled();
  });
});
