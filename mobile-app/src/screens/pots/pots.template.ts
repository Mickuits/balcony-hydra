/**
 * Template HTML de l'écran Pots — grid des 20 pots avec filtres.
 *
 * Pas de contenu data-bind ici — la grille est rendue dynamiquement
 * par PotsScreen.renderGrid() en fonction du filtre actif.
 */
export function renderPotsTemplate(): string {
  return `
    <header class="screen-header">
      <h1>Mes pots</h1>
      <p class="subtitle" data-bind="pots.title">—</p>
    </header>

    <nav class="pot-filters" role="tablist" aria-label="Filtre des pots">
      <button type="button" class="filter-chip" role="tab" data-filter="all" aria-selected="true">Tous</button>
      <button type="button" class="filter-chip" role="tab" data-filter="crit">Critiques</button>
      <button type="button" class="filter-chip" role="tab" data-filter="dry">Secs</button>
      <button type="button" class="filter-chip" role="tab" data-filter="watering">Arrosage</button>
      <button type="button" class="filter-chip" role="tab" data-filter="off">Désactivés</button>
    </nav>

    <section class="pots-grid" aria-label="Grille des pots" id="potsGrid">
      <!-- pots injectés dynamiquement -->
    </section>

    <footer class="screen-footer">
      <button type="button" data-action="addPot" class="btn btn-primary">
        Ajouter un pot
      </button>
    </footer>
  `;
}

/**
 * Render d'une tuile de pot — pure fonction prenant les props,
 * retourne le HTML. Testable en isolation.
 */
export interface PotTileProps {
  id: string;
  state: 'crit' | 'dry' | 'ok' | 'high' | 'watering' | 'off';
  hum: number;
  zone: 'balcon' | 'interieur';
  nameShort: string;
}

export function renderPotTile(props: PotTileProps): string {
  const humDisplay = props.state === 'off' ? '—' : `${Math.round(props.hum)}%`;
  const fillHeight = props.state === 'off' ? 0 : Math.round(Math.max(0, Math.min(100, props.hum)));
  const isAlert = props.state === 'crit' || props.state === 'dry' || props.state === 'off';
  return `
    <button type="button" class="pot pot-${props.state}"
            data-pot-id="${escapeAttr(props.id)}"
            data-zone="${escapeAttr(props.zone)}"
            data-status="${isAlert ? 'alert' : 'ok'}"
            aria-label="Pot ${escapeAttr(props.id)} ${escapeAttr(props.nameShort)} ${humDisplay}">
      <span class="fill" style="height:${fillHeight}%" aria-hidden="true"></span>
      <span class="id">${escapeText(props.id)}</span>
      <span class="name">${escapeText(props.nameShort)}</span>
      <span class="pct">${humDisplay}</span>
    </button>
  `;
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
