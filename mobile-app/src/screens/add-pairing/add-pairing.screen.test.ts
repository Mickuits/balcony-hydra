import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AddPairingScreen } from './add-pairing.screen';

describe('AddPairingScreen', () => {
  let root: HTMLElement;
  let onComplete: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;
  let screen: AddPairingScreen;

  beforeEach(() => {
    root = document.createElement('div');
    onComplete = vi.fn();
    onCancel = vi.fn();
    screen = new AddPairingScreen({ onComplete, onCancel });
  });

  function next(): void {
    root.querySelector<HTMLButtonElement>('[data-wizard-action="next"]')!.click();
  }

  it('mount renders preparation instructions', () => {
    screen.mount(root);
    expect(root.querySelector('h1')?.textContent).toMatch(/Préparer/);
    expect(root.querySelectorAll('.instructions li').length).toBe(3);
  });

  it('next goes to MAC input step', () => {
    screen.mount(root);
    next();
    expect(root.querySelector('h1')?.textContent).toMatch(/MAC/);
    expect(root.querySelector('#slaveMac')).not.toBeNull();
  });

  it('rejects invalid MAC', () => {
    screen.mount(root);
    next();
    root.querySelector<HTMLInputElement>('#slaveMac')!.value = 'not-a-mac';
    next();
    expect(root.querySelector('#wizardError')?.textContent).toContain('MAC invalide');
  });

  it('uppercases MAC on collect', () => {
    screen.mount(root);
    next();
    root.querySelector<HTMLInputElement>('#slaveMac')!.value = 'aa:bb:cc:dd:ee:ff';
    next(); // accepts and goes to step 3
    expect(root.querySelector('h1')?.textContent).toContain('Confirmation');
    expect(root.innerHTML).toContain('AA:BB:CC:DD:EE:FF');
  });

  it('requires PMK confirmation before complete', () => {
    screen.mount(root);
    next();
    root.querySelector<HTMLInputElement>('#slaveMac')!.value = 'AA:BB:CC:DD:EE:FF';
    next(); // step 3
    next(); // try complete without checking
    expect(root.querySelector('#wizardError')?.textContent).toContain('PMK');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('completes on valid MAC + PMK confirmed', () => {
    screen.mount(root);
    next();
    root.querySelector<HTMLInputElement>('#slaveMac')!.value = 'AA:BB:CC:DD:EE:FF';
    next();
    root.querySelector<HTMLInputElement>('#pmkConfirmed')!.checked = true;
    next();
    expect(onComplete).toHaveBeenCalledWith({
      slaveMac: 'AA:BB:CC:DD:EE:FF',
      pmkConfirmed: true,
    });
  });

  it('cancel dispatches onCancel', () => {
    screen.mount(root);
    root.querySelector<HTMLButtonElement>('[data-wizard-action="cancel"]')!.click();
    expect(onCancel).toHaveBeenCalled();
  });
});
