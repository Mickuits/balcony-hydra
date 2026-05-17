/**
 * VacationScreen — planificateur d'absence.
 *
 * Inputs : startDate, endDate, marginPct.
 * Calcule via computeWeatherCoefficient + extendForecastToDays la projection
 * de consommation. Affiche : durée, coef météo, conso prévue, déficit éventuel.
 */
import { BaseScreen } from '@/router/screen';
import type { ScreenId, WeatherForecast } from '@/types';
import type { StatsStore } from '@/stores/stats.store';
import type { HardwareStore } from '@/stores/hardware.store';
import {
  computeWeatherCoefficient,
  extendForecastToDays,
  type WeatherCoefficient,
} from '@/services/weather';
import { fmtLiters } from '@/utils/format';

export interface VacationScreenDeps {
  hardware: HardwareStore;
  stats: StatsStore;
  forecast: WeatherForecast;
}

const MIN_MARGIN_PCT = 0;
const MAX_MARGIN_PCT = 50;
const DEFAULT_MARGIN_PCT = 15;

export class VacationScreen extends BaseScreen {
  readonly id: ScreenId = 'vacation';
  private readonly deps: VacationScreenDeps;
  private inputHandler: ((e: Event) => void) | null = null;

  constructor(deps: VacationScreenDeps) {
    super();
    this.deps = deps;
  }

  protected override onMount(root: HTMLElement): void {
    const today = new Date().toISOString().slice(0, 10);
    const in21 = new Date(Date.now() + 21 * 86400 * 1000).toISOString().slice(0, 10);
    root.innerHTML = `
      <header class="screen-header">
        <h1>Planificateur de vacances</h1>
      </header>
      <form class="form" id="vacationForm">
        <div class="field">
          <label for="startDate">Départ</label>
          <input type="date" id="startDate" value="${today}" />
        </div>
        <div class="field">
          <label for="endDate">Retour</label>
          <input type="date" id="endDate" value="${in21}" />
        </div>
        <div class="field">
          <label for="marginPct">Marge sécurité (%)</label>
          <input type="range" id="marginPct" min="${MIN_MARGIN_PCT}" max="${MAX_MARGIN_PCT}"
                 value="${DEFAULT_MARGIN_PCT}" />
          <output id="marginValue">+${DEFAULT_MARGIN_PCT} %</output>
        </div>
      </form>
      <section class="vacation-projection" id="vacationProjection" aria-live="polite"></section>
    `;
    this.inputHandler = () => this.recompute();
    root.querySelector('#startDate')?.addEventListener('change', this.inputHandler);
    root.querySelector('#endDate')?.addEventListener('change', this.inputHandler);
    root.querySelector('#marginPct')?.addEventListener('input', this.inputHandler);
  }

  protected override onActivate(): void {
    this.recompute();
  }

  protected override onUnmount(): void {
    if (this.root && this.inputHandler) {
      // Pas critique : les listeners disparaissent avec les éléments DOM
    }
    this.inputHandler = null;
    if (this.root) this.root.innerHTML = '';
  }

  private recompute(): void {
    if (!this.root) return;
    const start = this.root.querySelector<HTMLInputElement>('#startDate')?.value;
    const end = this.root.querySelector<HTMLInputElement>('#endDate')?.value;
    const marginInput = this.root.querySelector<HTMLInputElement>('#marginPct');
    const marginPct = marginInput ? parseInt(marginInput.value, 10) : DEFAULT_MARGIN_PCT;
    const projection = this.root.querySelector<HTMLElement>('#vacationProjection');
    const marginValue = this.root.querySelector<HTMLElement>('#marginValue');
    if (!projection) return;
    if (marginValue) marginValue.textContent = `+${marginPct} %`;

    const days = computeDays(start, end);
    if (days < 1) {
      projection.innerHTML = '<p class="warn">Sélectionnez des dates valides.</p>';
      return;
    }

    const forecast = extendForecastToDays(this.deps.forecast, days);
    const stats = this.deps.stats.get().stats;
    const refs = {
      baseTempReference: stats.baseTempReference,
      baseEt0Reference: stats.baseEt0Reference,
    };
    let weather: WeatherCoefficient;
    try {
      weather = computeWeatherCoefficient(forecast, refs);
    } catch {
      projection.innerHTML = '<p class="warn">Données météo indisponibles.</p>';
      return;
    }

    const baseConsoLpd = stats.baseConsoLpd;
    const consoBase = baseConsoLpd * days * weather.coef;
    const consoWithMargin = consoBase * (1 + marginPct / 100);
    const totalTankCap = Object.values(this.deps.hardware.get().tanks).reduce(
      (sum, t) => sum + t.cap,
      0
    );
    const deficit = consoWithMargin - totalTankCap;
    const safe = deficit <= 0;

    projection.innerHTML = renderVacationProjection({
      days,
      coef: weather.coef,
      periodTag: weather.periodTag,
      consoBase,
      consoWithMargin,
      totalTankCap,
      deficit,
      safe,
    });
  }
}

export interface VacationProjectionData {
  days: number;
  coef: number;
  periodTag: WeatherCoefficient['periodTag'];
  consoBase: number;
  consoWithMargin: number;
  totalTankCap: number;
  deficit: number;
  safe: boolean;
}

export function renderVacationProjection(d: VacationProjectionData): string {
  const verdict = d.safe
    ? `<p class="ok">Capacité suffisante : marge ${fmtLiters(-d.deficit)} restante.</p>`
    : `<p class="warn">Déficit prévu : ${fmtLiters(d.deficit)} manquants.</p>`;
  return `
    <dl class="vacation-stats">
      <dt>Durée</dt><dd>${d.days} jour${d.days > 1 ? 's' : ''}</dd>
      <dt>Période</dt><dd>${d.periodTag}</dd>
      <dt>Coef météo</dt><dd>×${d.coef.toFixed(2)}</dd>
      <dt>Conso prévue</dt><dd>${fmtLiters(d.consoBase)}</dd>
      <dt>Conso + marge</dt><dd>${fmtLiters(d.consoWithMargin)}</dd>
      <dt>Capacité totale</dt><dd>${fmtLiters(d.totalTankCap)}</dd>
    </dl>
    ${verdict}
  `;
}

export function computeDays(start: string | undefined, end: string | undefined): number {
  if (!start || !end) return 0;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}
