/**
 * Barrel export + factory map pour tous les screens.
 *
 * Au boot, `main.ts` construit le registre via `buildScreenRegistry()`
 * (voir `router/screen-registry.ts`) en passant cette map de factories.
 *
 * Conventions :
 *  - dashboard → DashboardScreen (refactor v4.3 complet, ref impl)
 *  - autres → StubScreen avec titre + sous-titre
 */
import type { ScreenId } from '@/types';
import type { Screen } from '@/router';
import { DashboardScreen } from './dashboard/dashboard.screen';
import { StubScreen } from './stub-screen';
import type { DashboardScreenDeps } from './dashboard/dashboard.screen';

export { DashboardScreen } from './dashboard/dashboard.screen';
export { StubScreen } from './stub-screen';

/** Métadonnées d'affichage des stubs (titre + sous-titre). */
export const STUB_SCREEN_META: Record<
  Exclude<ScreenId, 'dashboard'>,
  { title: string; subtitle?: string }
> = {
  pots: { title: 'Mes pots' },
  detail: { title: 'Détail du pot' },
  addPot: { title: 'Ajouter un pot', subtitle: 'Wizard 5 étapes (en cours de portage)' },
  editPot: { title: 'Éditer le pot' },
  stats: { title: 'Statistiques' },
  profiles: { title: 'Profils plantes' },
  vacation: { title: 'Planificateur vacances' },
  tanks: { title: 'Mes réservoirs' },
  tankDetail: { title: 'Détail réservoir' },
  tankConfig: { title: 'Configuration réservoir' },
  addTank: { title: 'Ajouter un réservoir', subtitle: 'Wizard 4 étapes (stub)' },
  tankEdit: { title: 'Éditer le réservoir' },
  system: { title: 'Système' },
  configurator: { title: 'Configurateur' },
  addPairing: { title: 'Appairage esclave', subtitle: 'Wizard 3 étapes (en cours de portage)' },
};

export interface ScreenFactoriesDeps {
  dashboard: DashboardScreenDeps;
}

/**
 * Construit toutes les factories Screen pour le routeur.
 * Le dashboard utilise sa vraie implémentation, les autres restent en stub
 * en attendant les VAGUE 2.D / 2.E qui les porteront.
 */
export function buildScreenFactories(
  deps: ScreenFactoriesDeps
): Partial<Record<ScreenId, () => Screen>> {
  const factories: Partial<Record<ScreenId, () => Screen>> = {
    dashboard: () => new DashboardScreen(deps.dashboard),
  };
  for (const [id, meta] of Object.entries(STUB_SCREEN_META)) {
    factories[id as ScreenId] = () => new StubScreen({ id: id as ScreenId, ...meta });
  }
  return factories;
}
