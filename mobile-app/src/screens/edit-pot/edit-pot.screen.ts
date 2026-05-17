/**
 * EditPotScreen — édite nom + profil + zone d'un pot existant.
 */
import { BaseScreen, type ScreenProps } from '@/router/screen';
import type { ScreenId, PlantProfile, ZoneLabel } from '@/types';
import type { HardwareStore } from '@/stores/hardware.store';
import type { UiStore } from '@/stores/ui.store';
import { escapeHtml } from '@/utils/sanitize';

export interface EditPotPayload {
  potId: string;
  name: string;
  nameShort: string;
  profileId: string;
  zone: ZoneLabel;
}

export type EditPotAction =
  | { type: 'save'; payload: EditPotPayload }
  | { type: 'delete'; potId: string }
  | { type: 'back' };

export interface EditPotScreenDeps {
  hardware: HardwareStore;
  ui: UiStore;
  profiles: Record<string, PlantProfile>;
  onAction: (action: EditPotAction) => void;
}

const NAME_MAX = 64;
const SHORT_MAX = 16;

export class EditPotScreen extends BaseScreen {
  readonly id: ScreenId = 'editPot';
  private readonly deps: EditPotScreenDeps;
  private clickHandler: ((e: Event) => void) | null = null;

  constructor(deps: EditPotScreenDeps) {
    super();
    this.deps = deps;
  }

  protected override onMount(root: HTMLElement): void {
    this.clickHandler = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
      const action = target?.dataset['action'];
      if (action === 'back') {
        this.deps.onAction({ type: 'back' });
        return;
      }
      if (action === 'delete') {
        const potId = this.deps.ui.get().selectedPotId;
        if (potId) this.deps.onAction({ type: 'delete', potId });
        return;
      }
    };
    root.addEventListener('click', this.clickHandler);
  }

  protected override onActivate(props?: ScreenProps): void {
    if (props?.selectedId) this.deps.ui.selectPot(props.selectedId);
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
    const potId = this.deps.ui.get().selectedPotId;
    const pot = potId ? this.deps.hardware.get().pots[potId] : undefined;
    if (!pot || !potId) {
      this.root.innerHTML = `
        <header class="screen-header">
          <button type="button" data-action="back" class="btn-back" aria-label="Retour">←</button>
          <h1>Pot introuvable</h1>
        </header>
      `;
      return;
    }

    const profileOptions = Object.entries(this.deps.profiles)
      .map(
        ([id, p]) =>
          `<option value="${escapeHtml(id)}" ${id === pot.profileId ? 'selected' : ''}>${escapeHtml(p.label)}</option>`
      )
      .join('');

    this.root.innerHTML = `
      <header class="screen-header">
        <button type="button" data-action="back" class="btn-back" aria-label="Retour">←</button>
        <h1>Éditer ${escapeHtml(potId)}</h1>
      </header>
      <form id="editPotForm" class="form" novalidate>
        <div class="field">
          <label for="name">Nom complet</label>
          <input type="text" id="name" name="name" maxlength="${NAME_MAX}"
                 required value="${escapeHtml(pot.name)}" />
        </div>
        <div class="field">
          <label for="nameShort">Nom court (max ${SHORT_MAX})</label>
          <input type="text" id="nameShort" name="nameShort" maxlength="${SHORT_MAX}"
                 required value="${escapeHtml(pot.nameShort)}" />
        </div>
        <div class="field">
          <label for="profileId">Profil hydrique</label>
          <select id="profileId" name="profileId" required>${profileOptions}</select>
        </div>
        <div class="field">
          <label for="zone">Zone</label>
          <select id="zone" name="zone" required>
            <option value="balcon" ${pot.zone === 'balcon' ? 'selected' : ''}>Balcon</option>
            <option value="interieur" ${pot.zone === 'interieur' ? 'selected' : ''}>Intérieur</option>
          </select>
        </div>
        <p id="formError" class="form-error" role="alert" hidden></p>
        <div class="action-bar">
          <button type="submit" class="btn btn-primary">Enregistrer</button>
          <button type="button" data-action="delete" class="btn btn-danger">Supprimer</button>
        </div>
      </form>
    `;

    const form = this.root.querySelector<HTMLFormElement>('#editPotForm');
    form?.addEventListener('submit', (e: SubmitEvent) => this.handleSubmit(e, potId));
  }

  private handleSubmit(e: SubmitEvent, potId: string): void {
    e.preventDefault();
    if (!this.root) return;
    const name = this.root.querySelector<HTMLInputElement>('#name')?.value.trim() ?? '';
    const nameShort = this.root.querySelector<HTMLInputElement>('#nameShort')?.value.trim() ?? '';
    const profileId = this.root.querySelector<HTMLSelectElement>('#profileId')?.value ?? '';
    const zoneRaw = this.root.querySelector<HTMLSelectElement>('#zone')?.value ?? '';
    const errorEl = this.root.querySelector<HTMLElement>('#formError');
    if (!errorEl) return;

    if (!name || name.length > NAME_MAX || !nameShort || nameShort.length > SHORT_MAX) {
      errorEl.textContent = 'Nom invalide.';
      errorEl.hidden = false;
      return;
    }
    if (!this.deps.profiles[profileId]) {
      errorEl.textContent = 'Profil inconnu.';
      errorEl.hidden = false;
      return;
    }
    if (zoneRaw !== 'balcon' && zoneRaw !== 'interieur') {
      errorEl.textContent = 'Zone invalide.';
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    this.deps.onAction({
      type: 'save',
      payload: { potId, name, nameShort, profileId, zone: zoneRaw as ZoneLabel },
    });
  }
}
