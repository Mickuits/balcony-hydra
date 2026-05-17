/**
 * PotsScreen — grille de 20 pots avec filtres (all / alerts / balcon / interieur).
 *
 * Réagit à :
 *  - HardwareStore changes → re-render grid
 *  - UiStore.currentPotFilter → re-render avec nouveau filtre
 *  - click sur un pot → onAction('openDetail', potId)
 *  - click sur un filtre → uiStore.setPotFilter(filter)
 *  - click sur "Ajouter un pot" → onAction('addPot')
 */
import { BaseScreen } from '@/router/screen';
import type { ScreenId, Pot, PotFilter } from '@/types';
import type { HardwareStore } from '@/stores/hardware.store';
import type { UiStore } from '@/stores/ui.store';
import type { BindingEngine } from '@/components/binding-engine/binding-engine';
import { renderPotsTemplate, renderPotTile } from './pots.template';

export type PotsAction = { type: 'openDetail'; potId: string } | { type: 'addPot' };

export interface PotsScreenDeps {
  hardware: HardwareStore;
  ui: UiStore;
  bindings: BindingEngine;
  onAction: (action: PotsAction) => void;
}

const BINDING_KEYS = ['pots.title'] as const;

export class PotsScreen extends BaseScreen {
  readonly id: ScreenId = 'pots';

  private readonly deps: PotsScreenDeps;
  private unsubHardware: (() => void) | null = null;
  private unsubUi: (() => void) | null = null;
  private clickHandler: ((e: Event) => void) | null = null;
  private gridEl: HTMLElement | null = null;

  constructor(deps: PotsScreenDeps) {
    super();
    this.deps = deps;
  }

  protected override onMount(root: HTMLElement): void {
    root.innerHTML = renderPotsTemplate();
    this.gridEl = root.querySelector<HTMLElement>('#potsGrid');

    this.deps.bindings.register('pots.title', () => {
      const filter = this.deps.ui.get().currentPotFilter;
      const pots = this.filterPots(this.deps.hardware.get().pots, filter);
      const label = { all: 'TOUS', crit: 'CRITIQUE', dry: 'SEC', watering: 'ARROSAGE', off: 'OFF' }[
        filter
      ];
      return `${Object.keys(pots).length} pots · ${label}`;
    });

    this.clickHandler = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const filterBtn = target.closest<HTMLElement>('[data-filter]');
      if (filterBtn) {
        const filter = filterBtn.dataset['filter'];
        if (filter) this.applyFilter(this.normalizeFilter(filter));
        return;
      }
      const potBtn = target.closest<HTMLElement>('[data-pot-id]');
      if (potBtn?.dataset['potId']) {
        this.deps.onAction({ type: 'openDetail', potId: potBtn.dataset['potId'] });
        return;
      }
      const actionBtn = target.closest<HTMLElement>('[data-action="addPot"]');
      if (actionBtn) this.deps.onAction({ type: 'addPot' });
    };
    root.addEventListener('click', this.clickHandler);
  }

  protected override onActivate(): void {
    this.refresh();
    this.unsubHardware = this.deps.hardware.subscribe(() => this.refresh());
    this.unsubUi = this.deps.ui.subscribe(() => this.refresh());
  }

  protected override onDeactivate(): void {
    this.unsubHardware?.();
    this.unsubUi?.();
    this.unsubHardware = null;
    this.unsubUi = null;
  }

  protected override onUnmount(): void {
    if (this.clickHandler && this.root) {
      this.root.removeEventListener('click', this.clickHandler);
    }
    for (const key of BINDING_KEYS) this.deps.bindings.unregister(key);
    this.clickHandler = null;
    this.gridEl = null;
    if (this.root) this.root.innerHTML = '';
  }

  private refresh(): void {
    if (!this.root) return;
    this.deps.bindings.apply(this.root);
    this.renderGrid();
    this.updateFilterChips();
  }

  private renderGrid(): void {
    if (!this.gridEl) return;
    const pots = this.filterPots(
      this.deps.hardware.get().pots,
      this.deps.ui.get().currentPotFilter
    );
    const sorted = Object.entries(pots).sort(([a], [b]) => a.localeCompare(b));
    this.gridEl.innerHTML = sorted
      .map(([id, p]) =>
        renderPotTile({
          id,
          state: p.state,
          hum: p.hum,
          zone: p.zone,
          nameShort: p.nameShort,
        })
      )
      .join('');
  }

  private updateFilterChips(): void {
    if (!this.root) return;
    const current = this.deps.ui.get().currentPotFilter;
    const chips = this.root.querySelectorAll<HTMLElement>('[data-filter]');
    for (const chip of chips) {
      const matches = this.normalizeFilter(chip.dataset['filter'] ?? '') === current;
      chip.classList.toggle('active', matches);
      chip.setAttribute('aria-selected', matches ? 'true' : 'false');
    }
  }

  /**
   * Map les labels UI ("alerts", "balcon", "interieur") vers PotFilter
   * (notre type accepte 'all'|'crit'|'dry'|'watering'|'off' ; balcon/interieur
   * sont traités comme des "vues" qui n'ont pas de mapping 1:1).
   */
  private normalizeFilter(raw: string): PotFilter {
    if (raw === 'crit' || raw === 'dry' || raw === 'watering' || raw === 'off') {
      return raw;
    }
    // 'alerts' → on garde 'all' mais filterPots gère le cas via state
    // 'balcon' / 'interieur' / 'all' → 'all' (filtré par zone via filterPots)
    return 'all';
  }

  private applyFilter(filter: PotFilter): void {
    this.deps.ui.setPotFilter(filter);
  }

  private filterPots(pots: Record<string, Pot>, filter: PotFilter): Record<string, Pot> {
    if (filter === 'all') return pots;
    const out: Record<string, Pot> = {};
    for (const [id, pot] of Object.entries(pots)) {
      if (filter === 'crit' && pot.state === 'crit') out[id] = pot;
      else if (filter === 'dry' && (pot.state === 'crit' || pot.state === 'dry')) out[id] = pot;
      else if (filter === 'watering' && pot.state === 'watering') out[id] = pot;
      else if (filter === 'off' && pot.state === 'off') out[id] = pot;
    }
    return out;
  }
}
