/**
 * WizardStepper — primitives partagées par les 3 wizards (AddPot, AddPairing,
 * AddTank).
 *
 * Approche : la classe BaseWizard généralise la gestion d'étape + state. Les
 * sous-classes fournissent renderStep(stepIndex, state) et validateStep().
 */
import { BaseScreen } from '@/router/screen';
import type { ScreenId } from '@/types';

export interface WizardStep<TState> {
  /** Titre affiché en haut de l'étape. */
  title: string;
  /** Render HTML de l'étape (pure, basé sur state). */
  render: (state: TState) => string;
  /** Récupère les inputs depuis le DOM courant + applique au state. */
  collect: (root: HTMLElement, state: TState) => TState;
  /** Valide l'étape, retourne un message d'erreur ou null. */
  validate: (state: TState) => string | null;
}

export interface BaseWizardDeps<TState> {
  steps: WizardStep<TState>[];
  initialState: TState;
  onComplete: (finalState: TState) => void;
  onCancel?: () => void;
}

export abstract class BaseWizard<TState> extends BaseScreen {
  abstract override readonly id: ScreenId;
  protected state: TState;
  protected stepIndex = 0;
  private readonly steps: WizardStep<TState>[];
  private readonly onComplete: (s: TState) => void;
  private readonly onCancel?: () => void;
  private clickHandler: ((e: Event) => void) | null = null;

  constructor(deps: BaseWizardDeps<TState>) {
    super();
    this.steps = deps.steps;
    this.state = deps.initialState;
    this.onComplete = deps.onComplete;
    if (deps.onCancel) {
      this.onCancel = deps.onCancel;
    }
  }

  get totalSteps(): number {
    return this.steps.length;
  }

  protected override onMount(root: HTMLElement): void {
    this.clickHandler = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-wizard-action]');
      const action = target?.dataset['wizardAction'];
      if (!action) return;
      if (action === 'next') this.next();
      else if (action === 'prev') this.prev();
      else if (action === 'cancel') this.cancel();
    };
    root.addEventListener('click', this.clickHandler);
    this.renderCurrentStep();
  }

  protected override onActivate(): void {
    // Re-render au cas où on revient sur le wizard avec un state existant.
    this.renderCurrentStep();
  }

  protected override onUnmount(): void {
    if (this.clickHandler && this.root) {
      this.root.removeEventListener('click', this.clickHandler);
    }
    this.clickHandler = null;
    if (this.root) this.root.innerHTML = '';
    // Reset state pour la prochaine ouverture
    this.stepIndex = 0;
  }

  /** Force le wizard à revenir à l'étape 0 (utile entre 2 ouvertures). */
  reset(initialState: TState): void {
    this.state = initialState;
    this.stepIndex = 0;
    if (this.root) this.renderCurrentStep();
  }

  protected renderCurrentStep(): void {
    if (!this.root) return;
    const step = this.steps[this.stepIndex];
    if (!step) return;
    const isLast = this.stepIndex === this.steps.length - 1;
    const isFirst = this.stepIndex === 0;
    this.root.innerHTML = `
      <header class="wizard-header">
        <button type="button" data-wizard-action="cancel" class="btn-back" aria-label="Annuler">×</button>
        <h1>${escapeText(step.title)}</h1>
        <div class="wizard-progress" aria-label="Progression">
          ${this.stepIndex + 1} / ${this.steps.length}
        </div>
      </header>
      <section class="wizard-body" id="wizardStepBody">${step.render(this.state)}</section>
      <p id="wizardError" class="form-error" role="alert" hidden></p>
      <footer class="wizard-footer">
        <button type="button" data-wizard-action="prev" class="btn" ${isFirst ? 'disabled' : ''}>Précédent</button>
        <button type="button" data-wizard-action="next" class="btn btn-primary">${isLast ? 'Terminer' : 'Suivant'}</button>
      </footer>
    `;
  }

  protected next(): void {
    if (!this.root) return;
    const step = this.steps[this.stepIndex];
    if (!step) return;
    const errorEl = this.root.querySelector<HTMLElement>('#wizardError');
    this.state = step.collect(this.root, this.state);
    const err = step.validate(this.state);
    if (err) {
      if (errorEl) {
        errorEl.textContent = err;
        errorEl.hidden = false;
      }
      return;
    }
    if (errorEl) errorEl.hidden = true;

    if (this.stepIndex === this.steps.length - 1) {
      this.onComplete(this.state);
      return;
    }
    this.stepIndex += 1;
    this.renderCurrentStep();
  }

  protected prev(): void {
    if (this.stepIndex === 0) return;
    this.stepIndex -= 1;
    this.renderCurrentStep();
  }

  protected cancel(): void {
    this.onCancel?.();
  }
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
