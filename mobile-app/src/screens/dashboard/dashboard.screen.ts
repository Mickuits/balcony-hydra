/**
 * DashboardScreen — écran d'accueil, KPIs + actions rapides.
 *
 * Pattern de référence pour les 15 autres screens :
 *  1. constructor — reçoit les deps (stores, services, callbacks)
 *  2. onMount — render template + register bindings + bind events
 *  3. onActivate — first paint via BindingEngine.apply() + subscribe stores
 *  4. onDeactivate — unsubscribe (les bindings restent enregistrés)
 *  5. onUnmount — clear DOM + unregister bindings
 *
 * Le screen **ne dépend pas du routeur** — la navigation se fait via
 * un callback `onAction(type, payload)` exposé en constructor.
 */
import { BaseScreen } from '@/router/screen';
import type { ScreenId } from '@/types';
import { BindingEngine } from '@/components/binding-engine/binding-engine';
import type { HardwareStore } from '@/stores/hardware.store';
import { renderDashboardTemplate } from './dashboard.template';
import { buildDashboardBindings } from './dashboard.bindings';

export type DashboardAction = 'waterAll' | 'openVacation';

export interface DashboardScreenDeps {
  hardware: HardwareStore;
  bindings: BindingEngine;
  onAction: (action: DashboardAction) => void;
}

const BINDING_KEYS = [
  'sys.uptime',
  'sys.lastSync',
  'sys.ramUsed',
  'sys.mqttRtt',
  'safety.state',
  'safety.tempPcb',
  'pots.alertCount',
  'pots.avgHumidity',
  'tanks.balcon.pct',
  'tanks.interieur.pct',
] as const;

export class DashboardScreen extends BaseScreen {
  readonly id: ScreenId = 'dashboard';

  private readonly deps: DashboardScreenDeps;
  private unsubscribeStore: (() => void) | null = null;
  private clickHandler: ((e: Event) => void) | null = null;

  constructor(deps: DashboardScreenDeps) {
    super();
    this.deps = deps;
  }

  protected override onMount(root: HTMLElement): void {
    root.innerHTML = renderDashboardTemplate();

    // Enregistrement des bindings (idempotent si déjà présent)
    const producers = buildDashboardBindings({ hardware: this.deps.hardware });
    this.deps.bindings.registerAll(producers);

    // Délégation click pour les actions
    this.clickHandler = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
      if (!target) return;
      const action = target.dataset['action'] as DashboardAction | undefined;
      if (!action) return;
      this.deps.onAction(action);
    };
    root.addEventListener('click', this.clickHandler);
  }

  protected override onActivate(): void {
    this.refresh();
    this.unsubscribeStore = this.deps.hardware.subscribe(() => this.refresh());
  }

  protected override onDeactivate(): void {
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
  }

  protected override onUnmount(): void {
    if (this.clickHandler && this.root) {
      this.root.removeEventListener('click', this.clickHandler);
    }
    this.clickHandler = null;
    // Désinscription bindings (évite les fuites entre tests)
    for (const key of BINDING_KEYS) {
      this.deps.bindings.unregister(key);
    }
    if (this.root) this.root.innerHTML = '';
  }

  private refresh(): void {
    if (!this.root) return;
    this.deps.bindings.apply(this.root);
  }
}
