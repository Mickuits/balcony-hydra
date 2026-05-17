/**
 * StatsScreen — vue statistiques (24h / 7j / 30j / season).
 *
 * Affiche les KPIs principaux : conso totale, # cycles, économie d'eau,
 * pots arrosés. Bandeau de sélection de période.
 */
import { BaseScreen } from '@/router/screen';
import type { ScreenId, StatsPeriodId } from '@/types';
import type { StatsStore } from '@/stores/stats.store';
import type { UiStore } from '@/stores/ui.store';
import type { BindingEngine } from '@/components/binding-engine/binding-engine';
import { fmtLiters } from '@/utils/format';

export interface StatsScreenDeps {
  stats: StatsStore;
  ui: UiStore;
  bindings: BindingEngine;
}

const BINDING_KEYS = [
  'stats.period.label',
  'stats.totalConso',
  'stats.cycles',
  'stats.saved',
  'stats.potsWatered',
] as const;

const PERIOD_LABEL: Record<StatsPeriodId, string> = {
  '24h': 'Dernières 24h',
  '7d': '7 derniers jours',
  '30d': '30 derniers jours',
  season: 'Saison en cours',
};

export class StatsScreen extends BaseScreen {
  readonly id: ScreenId = 'stats';
  private readonly deps: StatsScreenDeps;
  private unsub: (() => void) | null = null;
  private unsubUi: (() => void) | null = null;
  private clickHandler: ((e: Event) => void) | null = null;

  constructor(deps: StatsScreenDeps) {
    super();
    this.deps = deps;
  }

  protected override onMount(root: HTMLElement): void {
    root.innerHTML = `
      <header class="screen-header">
        <h1>Statistiques</h1>
        <p class="subtitle" data-bind="stats.period.label">—</p>
      </header>
      <nav class="period-tabs" role="tablist" aria-label="Période">
        <button type="button" data-period="24h" role="tab">24h</button>
        <button type="button" data-period="7d" role="tab">7j</button>
        <button type="button" data-period="30d" role="tab">30j</button>
        <button type="button" data-period="season" role="tab">Saison</button>
      </nav>
      <section class="stats-kpis" aria-label="KPIs statistiques">
        <article class="kpi"><h3>Conso totale</h3><strong data-bind="stats.totalConso">—</strong></article>
        <article class="kpi"><h3>Cycles arrosage</h3><strong data-bind="stats.cycles">—</strong></article>
        <article class="kpi"><h3>Pots arrosés</h3><strong data-bind="stats.potsWatered">—</strong></article>
        <article class="kpi"><h3>Économie d'eau</h3><strong data-bind="stats.saved">—</strong></article>
      </section>
    `;

    this.deps.bindings.registerAll({
      'stats.period.label': () => PERIOD_LABEL[this.deps.ui.get().currentStatsPeriod],
      'stats.totalConso': () => fmtLiters(this.computeTotalConso()),
      'stats.cycles': () => `${this.computeCycles()}`,
      'stats.potsWatered': () => `${this.deps.stats.get().stats.potRanking7d.length}`,
      'stats.saved': () => fmtLiters(this.computeSaved()),
    });

    this.clickHandler = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-period]');
      const period = target?.dataset['period'] as StatsPeriodId | undefined;
      if (period) this.deps.ui.setStatsPeriod(period);
    };
    root.addEventListener('click', this.clickHandler);
  }

  protected override onActivate(): void {
    this.refresh();
    this.unsub = this.deps.stats.subscribe(() => this.refresh());
    this.unsubUi = this.deps.ui.subscribe(() => this.refresh());
  }

  protected override onDeactivate(): void {
    this.unsub?.();
    this.unsubUi?.();
    this.unsub = null;
    this.unsubUi = null;
  }

  protected override onUnmount(): void {
    if (this.clickHandler && this.root) {
      this.root.removeEventListener('click', this.clickHandler);
    }
    for (const key of BINDING_KEYS) this.deps.bindings.unregister(key);
    this.clickHandler = null;
    if (this.root) this.root.innerHTML = '';
  }

  private refresh(): void {
    if (!this.root) return;
    this.deps.bindings.apply(this.root);
    this.updateTabs();
  }

  private updateTabs(): void {
    if (!this.root) return;
    const period = this.deps.ui.get().currentStatsPeriod;
    const tabs = this.root.querySelectorAll<HTMLElement>('[data-period]');
    for (const tab of tabs) {
      const active = tab.dataset['period'] === period;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    }
  }

  private currentFactor(): number {
    const period = this.deps.ui.get().currentStatsPeriod;
    return this.deps.stats.get().periodConfig[period].factor;
  }

  private computeTotalConso(): number {
    return this.deps.stats.get().stats.totalLiters7d * this.currentFactor();
  }

  private computeCycles(): number {
    return Math.round(this.deps.stats.get().stats.totalEvents7d * this.currentFactor());
  }

  private computeSaved(): number {
    // Une estimation : volume moyen par event × events skipped
    const stats = this.deps.stats.get().stats;
    const avgPerEvent = stats.totalEvents7d > 0 ? stats.totalLiters7d / stats.totalEvents7d : 0;
    return avgPerEvent * stats.totalSkipped7d * this.currentFactor();
  }
}
