/**
 * TankConfigScreen — configure les seuils warn/crit du réservoir sélectionné.
 *
 * Inputs : critPct (0-50), warnPct (>= critPct, <= 75).
 * Action save : valide puis appelle onSave({ tankId, critPct, warnPct }).
 */
import { BaseScreen, type ScreenProps } from '@/router/screen';
import type { ScreenId } from '@/types';
import type { HardwareStore } from '@/stores/hardware.store';
import type { UiStore } from '@/stores/ui.store';
import { clampNumber } from '@/utils/sanitize';

export interface TankConfigPayload {
  tankId: string;
  critPct: number;
  warnPct: number;
}

export type TankConfigAction = { type: 'save'; payload: TankConfigPayload } | { type: 'back' };

export interface TankConfigScreenDeps {
  hardware: HardwareStore;
  ui: UiStore;
  onAction: (action: TankConfigAction) => void;
}

export class TankConfigScreen extends BaseScreen {
  readonly id: ScreenId = 'tankConfig';
  private readonly deps: TankConfigScreenDeps;
  private clickHandler: ((e: Event) => void) | null = null;

  constructor(deps: TankConfigScreenDeps) {
    super();
    this.deps = deps;
  }

  protected override onMount(root: HTMLElement): void {
    root.innerHTML = `
      <header class="screen-header">
        <button type="button" data-action="back" class="btn-back" aria-label="Retour">←</button>
        <h1>Seuils du réservoir</h1>
      </header>
      <form id="tankConfigForm" class="form" novalidate>
        <div class="field">
          <label for="critPct">Seuil critique (%)</label>
          <input type="number" id="critPct" name="critPct" min="0" max="50" value="10" />
          <small>Le système déclenche une alerte critique sous ce seuil.</small>
        </div>
        <div class="field">
          <label for="warnPct">Seuil d'alerte (%)</label>
          <input type="number" id="warnPct" name="warnPct" min="10" max="75" value="25" />
          <small>Notification "niveau bas" sous ce seuil.</small>
        </div>
        <p id="formError" class="form-error" role="alert" hidden></p>
        <div class="action-bar">
          <button type="submit" class="btn btn-primary">Enregistrer</button>
        </div>
      </form>
    `;
    this.clickHandler = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-action="back"]');
      if (target) this.deps.onAction({ type: 'back' });
    };
    root.addEventListener('click', this.clickHandler);

    const form = root.querySelector<HTMLFormElement>('#tankConfigForm');
    form?.addEventListener('submit', (e: SubmitEvent) => this.handleSubmit(e));
  }

  protected override onActivate(props?: ScreenProps): void {
    if (props?.selectedId) this.deps.ui.selectTank(props.selectedId);
  }

  protected override onUnmount(): void {
    if (this.clickHandler && this.root) {
      this.root.removeEventListener('click', this.clickHandler);
    }
    this.clickHandler = null;
    if (this.root) this.root.innerHTML = '';
  }

  private handleSubmit(e: SubmitEvent): void {
    e.preventDefault();
    if (!this.root) return;
    const tankId = this.deps.ui.get().selectedTankId;
    if (!tankId) return;
    const critInput = this.root.querySelector<HTMLInputElement>('#critPct');
    const warnInput = this.root.querySelector<HTMLInputElement>('#warnPct');
    const errorEl = this.root.querySelector<HTMLElement>('#formError');
    if (!critInput || !warnInput || !errorEl) return;

    const critPct = clampNumber(critInput.value, 0, 50, -1);
    const warnPct = clampNumber(warnInput.value, 10, 75, -1);
    if (critPct < 0 || warnPct < 0) {
      errorEl.textContent = 'Valeurs invalides — utilisez des nombres entre 0 et 75.';
      errorEl.hidden = false;
      return;
    }
    if (critPct >= warnPct) {
      errorEl.textContent = "Le seuil critique doit être inférieur au seuil d'alerte.";
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    this.deps.onAction({ type: 'save', payload: { tankId, critPct, warnPct } });
  }
}
