import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseWizard, type WizardStep } from './wizard-stepper';
import type { ScreenId } from '@/types';

interface TestState {
  name: string;
  value: number;
}

class TestWizard extends BaseWizard<TestState> {
  readonly id: ScreenId = 'addPot';
}

const STEPS: WizardStep<TestState>[] = [
  {
    title: 'Étape 1 — Nom',
    render: (s) => `<input id="name" value="${s.name}" />`,
    collect: (root, s) => ({
      ...s,
      name: root.querySelector<HTMLInputElement>('#name')?.value ?? '',
    }),
    validate: (s) => (s.name.length === 0 ? 'Nom requis' : null),
  },
  {
    title: 'Étape 2 — Valeur',
    render: (s) => `<input type="number" id="value" value="${s.value}" />`,
    collect: (root, s) => ({
      ...s,
      value: Number(root.querySelector<HTMLInputElement>('#value')?.value ?? 0),
    }),
    validate: (s) => (s.value < 0 ? 'Valeur positive requise' : null),
  },
  {
    title: 'Étape 3 — Confirmation',
    render: (s) => `<p>${s.name} / ${s.value}</p>`,
    collect: (_root, s) => s,
    validate: () => null,
  },
];

describe('BaseWizard', () => {
  let root: HTMLElement;
  let onComplete: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;
  let wizard: TestWizard;

  beforeEach(() => {
    root = document.createElement('div');
    onComplete = vi.fn();
    onCancel = vi.fn();
    wizard = new TestWizard({
      steps: STEPS,
      initialState: { name: 'init', value: 10 },
      onComplete,
      onCancel,
    });
  });

  it('renders step 0 on mount', () => {
    wizard.mount(root);
    expect(root.querySelector('h1')?.textContent).toContain('Nom');
    expect(root.querySelector('.wizard-progress')?.textContent).toMatch(/1 \/ 3/);
  });

  it('prev button disabled at step 0', () => {
    wizard.mount(root);
    const prev = root.querySelector<HTMLButtonElement>('[data-wizard-action="prev"]');
    expect(prev?.disabled).toBe(true);
  });

  it('click "next" advances to step 1 when validation passes', () => {
    wizard.mount(root);
    const next = root.querySelector<HTMLButtonElement>('[data-wizard-action="next"]')!;
    next.click();
    expect(root.querySelector('h1')?.textContent).toContain('Valeur');
  });

  it('shows validation error + stays on step when validate returns string', () => {
    wizard.mount(root);
    root.querySelector<HTMLInputElement>('#name')!.value = '';
    root.querySelector<HTMLButtonElement>('[data-wizard-action="next"]')!.click();
    const err = root.querySelector('#wizardError');
    expect(err?.textContent).toContain('requis');
    expect(err?.hasAttribute('hidden')).toBe(false);
    // Toujours sur step 0
    expect(root.querySelector('h1')?.textContent).toContain('Nom');
  });

  it('click "prev" goes back', () => {
    wizard.mount(root);
    root.querySelector<HTMLButtonElement>('[data-wizard-action="next"]')!.click(); // step 1
    root.querySelector<HTMLButtonElement>('[data-wizard-action="prev"]')!.click(); // step 0
    expect(root.querySelector('h1')?.textContent).toContain('Nom');
  });

  it('last step shows "Terminer" instead of "Suivant"', () => {
    wizard.mount(root);
    root.querySelector<HTMLButtonElement>('[data-wizard-action="next"]')!.click(); // step 1
    root.querySelector<HTMLButtonElement>('[data-wizard-action="next"]')!.click(); // step 2
    const nextBtn = root.querySelector('[data-wizard-action="next"]');
    expect(nextBtn?.textContent).toContain('Terminer');
  });

  it('completes when "Terminer" pressed on last step', () => {
    wizard.mount(root);
    root.querySelector<HTMLInputElement>('#name')!.value = 'John';
    root.querySelector<HTMLButtonElement>('[data-wizard-action="next"]')!.click();
    root.querySelector<HTMLInputElement>('#value')!.value = '42';
    root.querySelector<HTMLButtonElement>('[data-wizard-action="next"]')!.click();
    root.querySelector<HTMLButtonElement>('[data-wizard-action="next"]')!.click();
    expect(onComplete).toHaveBeenCalledWith({ name: 'John', value: 42 });
  });

  it('cancel button dispatches onCancel', () => {
    wizard.mount(root);
    root.querySelector<HTMLButtonElement>('[data-wizard-action="cancel"]')!.click();
    expect(onCancel).toHaveBeenCalled();
  });

  it('reset() returns to step 0 with new initial state', () => {
    wizard.mount(root);
    root.querySelector<HTMLButtonElement>('[data-wizard-action="next"]')!.click(); // step 1
    wizard.reset({ name: 'new', value: 1 });
    expect(root.querySelector('h1')?.textContent).toContain('Nom');
    expect(root.querySelector<HTMLInputElement>('#name')?.value).toBe('new');
  });

  it('unmount clears DOM + resets stepIndex', () => {
    wizard.mount(root);
    root.querySelector<HTMLButtonElement>('[data-wizard-action="next"]')!.click();
    wizard.unmount();
    expect(root.innerHTML).toBe('');
  });
});
