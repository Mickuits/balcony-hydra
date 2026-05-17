import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AddPotScreen } from './add-pot.screen';
import { INITIAL_PROFILES } from '@/data/mock-profiles';

describe('AddPotScreen', () => {
  let root: HTMLElement;
  let onComplete: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;
  let screen: AddPotScreen;

  beforeEach(() => {
    root = document.createElement('div');
    onComplete = vi.fn();
    onCancel = vi.fn();
    screen = new AddPotScreen({ profiles: INITIAL_PROFILES, onComplete, onCancel });
  });

  function next(): void {
    root.querySelector<HTMLButtonElement>('[data-wizard-action="next"]')!.click();
  }

  it('mount renders step 1 (zone + muxChannel)', () => {
    screen.mount(root);
    expect(root.querySelector('h1')?.textContent).toContain('Position physique');
    expect(root.querySelector('#zone')).not.toBeNull();
    expect(root.querySelector('#muxChannel')).not.toBeNull();
  });

  it('rejects muxChannel > 9', () => {
    screen.mount(root);
    root.querySelector<HTMLInputElement>('#muxChannel')!.value = '15';
    next();
    expect(root.querySelector('#wizardError')?.textContent).toContain('MUX');
  });

  it('rejects empty name at step 2', () => {
    screen.mount(root);
    next(); // → step 2
    root.querySelector<HTMLInputElement>('#name')!.value = '';
    next();
    expect(root.querySelector('#wizardError')?.textContent).toContain('nom est requis');
  });

  it('completes wizard with full state on last step', () => {
    screen.mount(root);
    root.querySelector<HTMLInputElement>('#muxChannel')!.value = '5';
    next();
    root.querySelector<HTMLInputElement>('#name')!.value = 'Basilic Genovese';
    root.querySelector<HTMLInputElement>('#nameShort')!.value = 'Basilic';
    root.querySelector<HTMLInputElement>('#species')!.value = 'Ocimum basilicum';
    next();
    root.querySelector<HTMLSelectElement>('#profileId')!.value = 'HERB_MED';
    next();
    root.querySelector<HTMLInputElement>('#vol')!.value = '2000';
    next();
    next(); // confirmation → onComplete
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        zone: 'balcon',
        muxChannel: 5,
        name: 'Basilic Genovese',
        nameShort: 'Basilic',
        profileId: 'HERB_MED',
        vol: 2000,
      })
    );
  });

  it('cancel button dispatches onCancel', () => {
    screen.mount(root);
    root.querySelector<HTMLButtonElement>('[data-wizard-action="cancel"]')!.click();
    expect(onCancel).toHaveBeenCalled();
  });

  it('escapes HTML in confirmation step', () => {
    screen = new AddPotScreen({ profiles: INITIAL_PROFILES, onComplete, onCancel });
    screen.mount(root);
    root.querySelector<HTMLInputElement>('#muxChannel')!.value = '0';
    next();
    root.querySelector<HTMLInputElement>('#name')!.value = '<script>';
    root.querySelector<HTMLInputElement>('#nameShort')!.value = 'X';
    root.querySelector<HTMLInputElement>('#species')!.value = 'Y';
    next();
    root.querySelector<HTMLSelectElement>('#profileId')!.value = 'HERB_MED';
    next();
    next(); // vol défaut OK
    // step 5 → check confirmation
    expect(root.innerHTML).not.toContain('<script>');
    expect(root.innerHTML).toContain('&lt;script&gt;');
  });
});
