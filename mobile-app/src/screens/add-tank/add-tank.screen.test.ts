import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AddTankScreen } from './add-tank.screen';

describe('AddTankScreen', () => {
  let root: HTMLElement;
  let onComplete: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;
  let screen: AddTankScreen;

  beforeEach(() => {
    root = document.createElement('div');
    onComplete = vi.fn();
    onCancel = vi.fn();
    screen = new AddTankScreen({ onComplete, onCancel });
  });

  function next(): void {
    root.querySelector<HTMLButtonElement>('[data-wizard-action="next"]')!.click();
  }

  it('renders 4 steps total', () => {
    screen.mount(root);
    expect(root.querySelector('.wizard-progress')?.textContent).toMatch(/1 \/ 4/);
  });

  it('rejects empty name', () => {
    screen.mount(root);
    next();
    expect(root.querySelector('#wizardError')?.textContent).toContain('requis');
  });

  it('rejects out-of-range capacity', () => {
    screen.mount(root);
    root.querySelector<HTMLInputElement>('#name')!.value = 'Tank';
    next();
    root.querySelector<HTMLInputElement>('#cap')!.value = '9999';
    next();
    expect(root.querySelector('#wizardError')?.textContent).toContain('Capacité');
  });

  it('completes with valid state', () => {
    screen.mount(root);
    root.querySelector<HTMLInputElement>('#name')!.value = 'Bidon Sud';
    next();
    root.querySelector<HTMLInputElement>('#cap')!.value = '50';
    next();
    root.querySelector<HTMLSelectElement>('#controller')!.value = 'MASTER';
    next();
    next(); // confirmation
    expect(onComplete).toHaveBeenCalledWith({
      name: 'Bidon Sud',
      cap: 50,
      controller: 'MASTER',
    });
  });

  it('cancel dispatches onCancel', () => {
    screen.mount(root);
    root.querySelector<HTMLButtonElement>('[data-wizard-action="cancel"]')!.click();
    expect(onCancel).toHaveBeenCalled();
  });
});
