/**
 * TankEditScreen — édite nom + capacité d'un réservoir.
 */
import { BaseScreen, type ScreenProps } from '@/router/screen';
import type { ScreenId } from '@/types';
import type { HardwareStore } from '@/stores/hardware.store';
import type { UiStore } from '@/stores/ui.store';
import { clampNumber, escapeHtml } from '@/utils/sanitize';

export interface TankEditPayload {
  tankId: string;
  name: string;
  cap: number;
}

export type TankEditAction = { type: 'save'; payload: TankEditPayload } | { type: 'back' };

export interface TankEditScreenDeps {
  hardware: HardwareStore;
  ui: UiStore;
  onAction: (action: TankEditAction) => void;
}

const NAME_MAX = 64;
const CAP_MIN = 1;
const CAP_MAX = 500;

export class TankEditScreen extends BaseScreen {
  readonly id: ScreenId = 'tankEdit';
  private readonly deps: TankEditScreenDeps;
  private clickHandler: ((e: Event) => void) | null = null;

  constructor(deps: TankEditScreenDeps) {
    super();
    this.deps = deps;
  }

  protected override onMount(root: HTMLElement): void {
    this.clickHandler = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-action="back"]');
      if (target) this.deps.onAction({ type: 'back' });
    };
    root.addEventListener('click', this.clickHandler);
  }

  protected override onActivate(props?: ScreenProps): void {
    if (props?.selectedId) this.deps.ui.selectTank(props.selectedId);
    this.render();
  }

  protected override onUnmount(): void {
    if (this.clickHandler && this.root) {
      this.root.removeEventListener('click', this.clickHandler);
    }
    this.clickHandler = null;
    if (this.root) this.root.innerHTML = '';
  }

  private render(): void {
    if (!this.root) return;
    const tankId = this.deps.ui.get().selectedTankId;
    const tank = tankId ? this.deps.hardware.get().tanks[tankId] : undefined;
    if (!tank || !tankId) {
      this.root.innerHTML = `
        <header class="screen-header">
          <button type="button" data-action="back" class="btn-back" aria-label="Retour">←</button>
          <h1>Réservoir introuvable</h1>
        </header>
      `;
      return;
    }

    this.root.innerHTML = `
      <header class="screen-header">
        <button type="button" data-action="back" class="btn-back" aria-label="Retour">←</button>
        <h1>Éditer ${escapeHtml(tankId)}</h1>
      </header>
      <form id="tankEditForm" class="form" novalidate>
        <div class="field">
          <label for="name">Nom du réservoir</label>
          <input type="text" id="name" name="name" required maxlength="${NAME_MAX}"
                 value="${escapeHtml(tank.name)}" />
        </div>
        <div class="field">
          <label for="cap">Capacité (L)</label>
          <input type="number" id="cap" name="cap" min="${CAP_MIN}" max="${CAP_MAX}"
                 value="${tank.cap}" />
        </div>
        <p id="formError" class="form-error" role="alert" hidden></p>
        <div class="action-bar">
          <button type="submit" class="btn btn-primary">Enregistrer</button>
        </div>
      </form>
    `;

    const form = this.root.querySelector<HTMLFormElement>('#tankEditForm');
    form?.addEventListener('submit', (e: SubmitEvent) => this.handleSubmit(e, tankId));
  }

  private handleSubmit(e: SubmitEvent, tankId: string): void {
    e.preventDefault();
    if (!this.root) return;
    const nameInput = this.root.querySelector<HTMLInputElement>('#name');
    const capInput = this.root.querySelector<HTMLInputElement>('#cap');
    const errorEl = this.root.querySelector<HTMLElement>('#formError');
    if (!nameInput || !capInput || !errorEl) return;

    const name = nameInput.value.trim();
    const rawCap = Number(capInput.value);
    if (!name || name.length > NAME_MAX) {
      errorEl.textContent = `Le nom doit faire entre 1 et ${NAME_MAX} caractères.`;
      errorEl.hidden = false;
      return;
    }
    if (!Number.isFinite(rawCap) || rawCap < CAP_MIN || rawCap > CAP_MAX) {
      errorEl.textContent = `Capacité invalide (${CAP_MIN}-${CAP_MAX} L).`;
      errorEl.hidden = false;
      return;
    }
    const cap = clampNumber(rawCap, CAP_MIN, CAP_MAX, CAP_MIN);
    errorEl.hidden = true;
    this.deps.onAction({ type: 'save', payload: { tankId, name, cap } });
  }
}
