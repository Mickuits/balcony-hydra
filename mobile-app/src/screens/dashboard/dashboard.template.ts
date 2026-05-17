/**
 * Template HTML du dashboard. Pure fonction → testable, pas de DOM.
 *
 * Bindings `data-bind` consommés par BindingEngine :
 *  - sys.uptime, sys.lastSync, sys.ramUsed, sys.mqttRtt
 *  - safety.state, safety.tempPcb
 *  - pots.alertCount, pots.avgHumidity
 *  - tanks.balcon.pct, tanks.interieur.pct
 */
export function renderDashboardTemplate(): string {
  return `
    <header class="dashboard-header">
      <h1>Tableau de bord</h1>
      <span class="badge" data-bind="safety.state"></span>
    </header>

    <section class="kpi-grid" aria-label="Indicateurs clés">
      <article class="kpi">
        <h3>Pots en alerte</h3>
        <strong data-bind="pots.alertCount" aria-live="polite">0</strong>
      </article>
      <article class="kpi">
        <h3>Humidité moyenne</h3>
        <strong><span data-bind="pots.avgHumidity">—</span> %</strong>
      </article>
      <article class="kpi">
        <h3>Réservoir balcon</h3>
        <strong><span data-bind="tanks.balcon.pct">—</span> %</strong>
      </article>
      <article class="kpi">
        <h3>Réservoir intérieur</h3>
        <strong><span data-bind="tanks.interieur.pct">—</span> %</strong>
      </article>
    </section>

    <section class="quick-actions" aria-label="Actions rapides">
      <button type="button" data-action="waterAll" class="btn btn-primary">
        Arroser tout
      </button>
      <button type="button" data-action="openVacation" class="btn btn-secondary">
        Planifier vacances
      </button>
    </section>

    <section class="system-line" aria-label="État système">
      <span>Uptime: <span data-bind="sys.uptime">—</span></span>
      <span>RAM: <span data-bind="sys.ramUsed">—</span> kB</span>
      <span>MQTT RTT: <span data-bind="sys.mqttRtt">—</span> ms</span>
      <span>T°: <span data-bind="safety.tempPcb">—</span> °C</span>
    </section>
  `;
}
