/**
 * DetailScreen — détail d'un pot. Lit `uiStore.selectedPotId`.
 *
 * Affiche infos pot + actions (arroser, éditer, désactiver).
 * Si pas de pot sélectionné, affiche un message + bouton retour.
 */
import { BaseScreen, type ScreenProps } from '@/router/screen';
import type { ScreenId, Pot, PlantProfile } from '@/types';
import type { HardwareStore } from '@/stores/hardware.store';
import type { UiStore } from '@/stores/ui.store';
import { fmtDurationHuman, fmtPct } from '@/utils/format';

export type DetailAction =
  | { type: 'waterPot'; potId: string }
  | { type: 'editPot'; potId: string }
  | { type: 'togglePot'; potId: string }
  | { type: 'back' };

export interface DetailScreenDeps {
  hardware: HardwareStore;
  ui: UiStore;
  profiles: Record<string, PlantProfile>;
  onAction: (action: DetailAction) => void;
}

export class DetailScreen extends BaseScreen {
  readonly id: ScreenId = 'detail';
  private readonly deps: DetailScreenDeps;
  private unsub: (() => void) | null = null;
  private clickHandler: ((e: Event) => void) | null = null;

  constructor(deps: DetailScreenDeps) {
    super();
    this.deps = deps;
  }

  protected override onMount(root: HTMLElement): void {
    root.innerHTML = `
      <header class="screen-header">
        <button type="button" data-action="back" class="btn-back" aria-label="Retour">←</button>
        <h1 id="detailTitle">—</h1>
      </header>
      <section id="detailContent" aria-live="polite"></section>
    `;
    this.clickHandler = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
      const action = target?.dataset['action'];
      if (!action) return;
      const potId = this.deps.ui.get().selectedPotId;
      if (action === 'back') {
        this.deps.onAction({ type: 'back' });
        return;
      }
      if (!potId) return;
      switch (action) {
        case 'waterPot':
        case 'editPot':
        case 'togglePot':
          this.deps.onAction({ type: action, potId } as DetailAction);
          break;
      }
    };
    root.addEventListener('click', this.clickHandler);
  }

  protected override onActivate(props?: ScreenProps): void {
    if (props?.selectedId) {
      this.deps.ui.selectPot(props.selectedId);
    }
    this.refresh();
    this.unsub = this.deps.hardware.subscribe(() => this.refresh());
  }

  protected override onDeactivate(): void {
    this.unsub?.();
    this.unsub = null;
  }

  protected override onUnmount(): void {
    if (this.clickHandler && this.root) {
      this.root.removeEventListener('click', this.clickHandler);
    }
    this.clickHandler = null;
    if (this.root) this.root.innerHTML = '';
  }

  private refresh(): void {
    if (!this.root) return;
    const potId = this.deps.ui.get().selectedPotId;
    const title = this.root.querySelector<HTMLElement>('#detailTitle');
    const content = this.root.querySelector<HTMLElement>('#detailContent');
    if (!title || !content) return;
    if (!potId) {
      title.textContent = 'Aucun pot sélectionné';
      content.innerHTML = '<p>Retournez à la liste des pots.</p>';
      return;
    }
    const pot = this.deps.hardware.get().pots[potId];
    if (!pot) {
      title.textContent = `${potId} introuvable`;
      content.innerHTML = "<p>Ce pot n'existe plus.</p>";
      return;
    }
    const profile = this.deps.profiles[pot.profileId];
    title.textContent = `${potId} · ${pot.name}`;
    content.innerHTML = renderPotDetail(pot, profile);
  }
}

export function renderPotDetail(pot: Pot, profile: PlantProfile | undefined): string {
  return `
    <dl class="pot-detail">
      <dt>Espèce</dt><dd>${escapeText(pot.species)}</dd>
      <dt>Zone</dt><dd>${escapeText(pot.zone)}</dd>
      <dt>Humidité</dt><dd>${pot.state === 'off' ? '—' : fmtPct(pot.hum, 0)}</dd>
      <dt>État</dt><dd>${escapeText(pot.state)}</dd>
      <dt>Dernière arrosage</dt><dd>${fmtDurationHuman(pot.lastWater)}</dd>
      ${
        profile
          ? `<dt>Profil</dt><dd>${escapeText(profile.label)} (seuils ${profile.dry}/${profile.ok}%)</dd>`
          : ''
      }
    </dl>
    <div class="action-bar">
      <button type="button" data-action="waterPot" class="btn btn-primary">Arroser maintenant</button>
      <button type="button" data-action="editPot" class="btn">Éditer</button>
      <button type="button" data-action="togglePot" class="btn">${
        pot.state === 'off' ? 'Réactiver' : 'Désactiver'
      }</button>
    </div>
  `;
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
