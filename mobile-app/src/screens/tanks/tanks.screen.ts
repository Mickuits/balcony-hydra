/**
 * TanksScreen — liste des réservoirs (T01 balcon, T02 intérieur).
 *
 * Affiche pour chaque réservoir :
 *  - nom + zone + nombre de pots alimentés
 *  - jauge visuelle remplissage
 *  - status NOMINAL / NIVEAU BAS / CRITIQUE
 *  - last fill timestamp humanisé
 *
 * Click sur une carte → onAction('openDetail', tankId).
 */
import { BaseScreen } from '@/router/screen';
import type { ScreenId, Tank } from '@/types';
import type { HardwareStore } from '@/stores/hardware.store';
import type { BindingEngine } from '@/components/binding-engine/binding-engine';
import { fmtDurationHuman, fmtLiters, fmtPct } from '@/utils/format';

export type TanksAction = { type: 'openDetail'; tankId: string } | { type: 'addTank' };

export interface TanksScreenDeps {
  hardware: HardwareStore;
  bindings: BindingEngine;
  onAction: (action: TanksAction) => void;
}

const TANK_CRIT_PCT = 10;
const TANK_WARN_PCT = 25;

export class TanksScreen extends BaseScreen {
  readonly id: ScreenId = 'tanks';
  private readonly deps: TanksScreenDeps;
  private unsub: (() => void) | null = null;
  private clickHandler: ((e: Event) => void) | null = null;

  constructor(deps: TanksScreenDeps) {
    super();
    this.deps = deps;
  }

  protected override onMount(root: HTMLElement): void {
    root.innerHTML = `
      <header class="screen-header">
        <h1>Réservoirs</h1>
      </header>
      <section class="tanks-list" id="tanksList" aria-label="Liste des réservoirs"></section>
      <footer class="screen-footer">
        <button type="button" data-action="addTank" class="btn btn-primary">Ajouter un réservoir</button>
      </footer>
    `;
    this.clickHandler = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const card = target?.closest<HTMLElement>('[data-tank-id]');
      if (card?.dataset['tankId']) {
        this.deps.onAction({ type: 'openDetail', tankId: card.dataset['tankId'] });
        return;
      }
      const add = target?.closest<HTMLElement>('[data-action="addTank"]');
      if (add) this.deps.onAction({ type: 'addTank' });
    };
    root.addEventListener('click', this.clickHandler);
  }

  protected override onActivate(): void {
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
    const list = this.root.querySelector<HTMLElement>('#tanksList');
    if (!list) return;
    const tanks = this.deps.hardware.get().tanks;
    list.innerHTML = Object.entries(tanks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, t]) => renderTankCard(id, t))
      .join('');
  }
}

/** Render d'une carte tank — pure, testable. */
export function renderTankCard(id: string, t: Tank): string {
  const pct = (t.vol / t.cap) * 100;
  const status = pct < TANK_CRIT_PCT ? 'crit' : pct < TANK_WARN_PCT ? 'warn' : 'ok';
  const statusLabel = status === 'crit' ? 'CRITIQUE' : status === 'warn' ? 'NIVEAU BAS' : 'NOMINAL';
  return `
    <article class="tank-card tank-${status}" data-tank-id="${escapeAttr(id)}"
             tabindex="0" role="button" aria-label="Réservoir ${escapeAttr(id)} ${statusLabel}">
      <header class="tank-head">
        <div>
          <div class="tank-id">${escapeText(id)} · ${escapeText(t.controller)}</div>
          <div class="tank-name">${escapeText(t.name)}</div>
        </div>
        <div class="tank-status tank-status-${status}">${statusLabel}</div>
      </header>
      <div class="tank-body">
        <div class="tank-viz" aria-hidden="true">
          <div class="tank-viz-fill tank-viz-fill-${status}" style="height:${Math.round(pct)}%"></div>
        </div>
        <dl class="tank-stats">
          <dt>Niveau</dt><dd>${fmtPct(pct, 0)}</dd>
          <dt>Volume</dt><dd>${fmtLiters(t.vol)} / ${fmtLiters(t.cap)}</dd>
          <dt>Dernier remplissage</dt><dd>${fmtDurationHuman(t.lastFill)}</dd>
        </dl>
      </div>
    </article>
  `;
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
