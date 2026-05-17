import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TankEditScreen } from './tank-edit.screen';
import { HardwareStore } from '@/stores/hardware.store';
import { UiStore } from '@/stores/ui.store';

describe('TankEditScreen', () => {
  let root: HTMLElement;
  let hardware: HardwareStore;
  let ui: UiStore;
  let onAction: ReturnType<typeof vi.fn>;
  let screen: TankEditScreen;

  beforeEach(() => {
    root = document.createElement('div');
    hardware = new HardwareStore();
    ui = new UiStore();
    onAction = vi.fn();
    screen = new TankEditScreen({ hardware, ui, onAction });
  });

  function submit(): void {
    root
      .querySelector<HTMLFormElement>('#tankEditForm')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  it('shows "introuvable" when no tank selected', () => {
    screen.mount(root);
    screen.activate();
    expect(root.querySelector('h1')?.textContent).toContain('introuvable');
  });

  it('pre-fills form with current tank values', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'T01' });
    const name = root.querySelector<HTMLInputElement>('#name');
    const cap = root.querySelector<HTMLInputElement>('#cap');
    expect(name?.value).toBe(hardware.get().tanks.T01!.name);
    expect(Number(cap?.value)).toBe(hardware.get().tanks.T01!.cap);
  });

  it('escapes XSS in tank name (no script element injected)', () => {
    hardware.update((s) => ({
      ...s,
      tanks: { ...s.tanks, T01: { ...s.tanks.T01!, name: '<script>boom()</script>' } },
    }));
    screen.mount(root);
    screen.activate({ selectedId: 'T01' });
    // Pas de balise <script> dans le DOM (la valeur ne doit pas s'exfiltrer
    // de l'attribut `value` du <input>).
    expect(root.querySelectorAll('script').length).toBe(0);
    // La valeur originale est bien dans le input (parsing décode les entités),
    // mais elle n'a pas été interprétée comme du HTML actif.
    expect(root.querySelector<HTMLInputElement>('#name')?.value).toBe('<script>boom()</script>');
  });

  it('submit with valid values dispatches save action', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'T01' });
    root.querySelector<HTMLInputElement>('#name')!.value = 'Nouveau nom';
    root.querySelector<HTMLInputElement>('#cap')!.value = '50';
    submit();
    expect(onAction).toHaveBeenCalledWith({
      type: 'save',
      payload: { tankId: 'T01', name: 'Nouveau nom', cap: 50 },
    });
  });

  it('rejects empty name', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'T01' });
    root.querySelector<HTMLInputElement>('#name')!.value = '   ';
    submit();
    expect(onAction).not.toHaveBeenCalled();
    expect(root.querySelector<HTMLElement>('#formError')?.hidden).toBe(false);
  });

  it('rejects out-of-range capacity', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'T01' });
    root.querySelector<HTMLInputElement>('#name')!.value = 'X';
    root.querySelector<HTMLInputElement>('#cap')!.value = '9999';
    submit();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('back button dispatches back action', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'T01' });
    root.querySelector<HTMLElement>('[data-action="back"]')?.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'back' });
  });
});
