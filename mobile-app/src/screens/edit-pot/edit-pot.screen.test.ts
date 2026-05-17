import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditPotScreen } from './edit-pot.screen';
import { HardwareStore } from '@/stores/hardware.store';
import { UiStore } from '@/stores/ui.store';
import { INITIAL_PROFILES } from '@/data/mock-profiles';

describe('EditPotScreen', () => {
  let root: HTMLElement;
  let hardware: HardwareStore;
  let ui: UiStore;
  let onAction: ReturnType<typeof vi.fn>;
  let screen: EditPotScreen;

  beforeEach(() => {
    root = document.createElement('div');
    hardware = new HardwareStore();
    ui = new UiStore();
    onAction = vi.fn();
    screen = new EditPotScreen({ hardware, ui, profiles: INITIAL_PROFILES, onAction });
  });

  function submit(): void {
    root
      .querySelector<HTMLFormElement>('#editPotForm')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  it('shows "introuvable" when no pot', () => {
    screen.mount(root);
    screen.activate();
    expect(root.querySelector('h1')?.textContent).toContain('introuvable');
  });

  it('pre-fills form with current pot values', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'P01' });
    const pot = hardware.get().pots.P01!;
    expect(root.querySelector<HTMLInputElement>('#name')?.value).toBe(pot.name);
    expect(root.querySelector<HTMLInputElement>('#nameShort')?.value).toBe(pot.nameShort);
    expect(root.querySelector<HTMLSelectElement>('#profileId')?.value).toBe(pot.profileId);
  });

  it('lists all profiles in select', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'P01' });
    const options = root.querySelectorAll<HTMLOptionElement>('#profileId option');
    expect(options.length).toBe(Object.keys(INITIAL_PROFILES).length);
  });

  it('submit with valid values dispatches save', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'P01' });
    root.querySelector<HTMLInputElement>('#name')!.value = 'New name';
    root.querySelector<HTMLInputElement>('#nameShort')!.value = 'NN';
    root.querySelector<HTMLSelectElement>('#profileId')!.value = 'SUCCULENT_DRY';
    root.querySelector<HTMLSelectElement>('#zone')!.value = 'interieur';
    submit();
    expect(onAction).toHaveBeenCalledWith({
      type: 'save',
      payload: {
        potId: 'P01',
        name: 'New name',
        nameShort: 'NN',
        profileId: 'SUCCULENT_DRY',
        zone: 'interieur',
      },
    });
  });

  it('rejects empty name', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'P01' });
    root.querySelector<HTMLInputElement>('#name')!.value = '   ';
    submit();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('delete button dispatches action', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'P01' });
    root.querySelector<HTMLElement>('[data-action="delete"]')?.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'delete', potId: 'P01' });
  });

  it('back button dispatches action', () => {
    screen.mount(root);
    screen.activate({ selectedId: 'P01' });
    root.querySelector<HTMLElement>('[data-action="back"]')?.click();
    expect(onAction).toHaveBeenCalledWith({ type: 'back' });
  });
});
