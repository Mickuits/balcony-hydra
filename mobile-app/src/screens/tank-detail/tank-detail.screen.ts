/**
 * TankDetailScreen — détail d'un réservoir.
 *
 * Lit `uiStore.selectedTankId`. Affiche volume + niveau + jauge + last fill +
 * pots associés. Actions : éditer, configurer seuils, retour.
 */
import { BaseScreen, type ScreenProps } from '@/router/screen';
import type { ScreenId, Tank, Pot } from '@/types';
import type { HardwareStore } from '@/stores/hardware.store';
import type { UiStore } from '@/stores/ui.store';
import { fmtDurationHuman, fmtLiters, fmtPct } from '@/utils/format';

export type TankDetailAction =
  | { type: 'editTank'; tankId: string }
  | { type: 'configTank'; tankId: string }
  | { type: 'markFilled'; tankId: string }
  | { type: 'back' };

export interface TankDetailScreenDeps {
  hardware: HardwareStore;
  ui: UiStore;
  onAction: (action: TankDetailAction) => void;
}

const TANK_CRIT_PCT = 10;
const TANK_WARN_PCT = 25;

export class TankDetailScreen extends BaseScreen {
  readonly id: ScreenId = 'tankDetail';
  private readonly deps: TankDetailScreenDeps;
  private unsub: (() => void) | null = null;
  private clickHandler: ((e: Event) => void) | null = null;

  constructor(deps: TankDetailScreenDeps) {
    super();
    this.deps = deps;
  }

  protected override onMount(root: HTMLElement): void {
    root.innerHTML = `
      <header class="screen-header">
        <button type="button" data-action="back" class="btn-back" aria-label="Retour">←</button>
        <h1 id="tankTitle">—</h1>
      </header>
      <section id="tankContent" aria-live="polite"></section>
    `;
    this.clickHandler = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
      const action = target?.dataset['action'];
      if (!action) return;
      const tankId = this.deps.ui.get().selectedTankId;
      if (action === 'back') {
        this.deps.onAction({ type: 'back' });
        return;
      }
      if (!tankId) return;
      switch (action) {
        case 'editTank':
        case 'configTank':
        case 'markFilled':
          this.deps.onAction({ type: action, tankId } as TankDetailAction);
          break;
      }
    };
    root.addEventListener('click', this.clickHandler);
  }

  protected override onActivate(props?: ScreenProps): void {
    if (props?.selectedId) {
      this.deps.ui.selectTank(props.selectedId);
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
    const id = this.deps.ui.get().selectedTankId;
    const title = this.root.querySelector<HTMLElement>('#tankTitle');
    const content = this.root.querySelector<HTMLElement>('#tankContent');
    if (!title || !content) return;
    if (!id) {
      title.textContent = 'Aucun réservoir sélectionné';
      content.innerHTML = '';
      return;
    }
    const tank = this.deps.hardware.get().tanks[id];
    if (!tank) {
      title.textContent = `${id} introuvable`;
      content.innerHTML = '';
      return;
    }
    title.textContent = `${id} · ${tank.name}`;
    const zonePots = getPotsForTank(this.deps.hardware.get().pots, tank);
    content.innerHTML = renderTankDetail(tank, zonePots);
  }
}

export function renderTankDetail(tank: Tank, pots: Pot[]): string {
  const pct = (tank.vol / tank.cap) * 100;
  const status = pct < TANK_CRIT_PCT ? 'crit' : pct < TANK_WARN_PCT ? 'warn' : 'ok';
  return `
    <div class="tank-detail tank-detail-${status}">
      <div class="tank-viz" aria-hidden="true">
        <div class="tank-viz-fill" style="height:${Math.round(pct)}%"></div>
      </div>
      <dl>
        <dt>Niveau</dt><dd>${fmtPct(pct, 0)}</dd>
        <dt>Volume</dt><dd>${fmtLiters(tank.vol)} / ${fmtLiters(tank.cap)}</dd>
        <dt>Contrôleur</dt><dd>${escapeText(tank.controller)}</dd>
        <dt>Dernier remplissage</dt><dd>${fmtDurationHuman(tank.lastFill)}</dd>
        <dt>Pots alimentés</dt><dd>${pots.length}</dd>
      </dl>
      <div class="action-bar">
        <button type="button" data-action="markFilled" class="btn btn-primary">Marquer rempli</button>
        <button type="button" data-action="configTank" class="btn">Configurer seuils</button>
        <button type="button" data-action="editTank" class="btn">Éditer</button>
      </div>
    </div>
  `;
}

function getPotsForTank(pots: Record<string, Pot>, tank: Tank): Pot[] {
  const expectedZone = tank.controller === 'SLAVE' ? 'balcon' : 'interieur';
  return Object.values(pots).filter((p) => p.zone === expectedZone);
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
