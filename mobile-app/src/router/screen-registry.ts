/**
 * Screen registry — mapping ScreenId → Screen factory + groupes nav.
 *
 * Le registre centralise la construction de tous les screens. Les factories
 * sont lazy (instanciation au boot mais pas le mount). Cela permet :
 *  - de garder une référence stable pour les tests (singletons).
 *  - de remplacer un screen par une stub en test sans toucher au router.
 */
import type { ScreenId, NavId } from '@/types';
import type { Screen } from './screen';

/**
 * Mapping ScreenId → NavId (bottom-nav highlight).
 *
 * Les screens "leaf" (detail, addPot, addPairing, …) héritent du parent.
 */
export const NAV_OF_SCREEN: Record<ScreenId, NavId> = {
  dashboard: 'dashboard',
  pots: 'pots',
  detail: 'pots',
  addPot: 'pots',
  editPot: 'pots',
  stats: 'stats',
  profiles: 'pots',
  vacation: 'stats',
  tanks: 'tanks',
  tankDetail: 'tanks',
  tankConfig: 'tanks',
  addTank: 'tanks',
  tankEdit: 'tanks',
  system: 'system',
  configurator: 'system',
  addPairing: 'system',
};

/**
 * Liste exhaustive des ScreenId — sert de runtime check pour s'assurer
 * que le registre couvre tous les screens.
 */
export const ALL_SCREEN_IDS: readonly ScreenId[] = [
  'dashboard',
  'pots',
  'detail',
  'addPot',
  'editPot',
  'stats',
  'profiles',
  'vacation',
  'tanks',
  'tankDetail',
  'tankConfig',
  'addTank',
  'tankEdit',
  'system',
  'configurator',
  'addPairing',
] as const;

/**
 * Construit le registre Map<ScreenId, Screen> à partir d'une factory map.
 * Vérifie qu'il n'y a pas de screen manquant.
 */
export function buildScreenRegistry(
  factories: Partial<Record<ScreenId, () => Screen>>
): Map<ScreenId, Screen> {
  const map = new Map<ScreenId, Screen>();
  for (const id of ALL_SCREEN_IDS) {
    const factory = factories[id];
    if (!factory) {
      throw new Error(`buildScreenRegistry: factory manquante pour "${id}"`);
    }
    map.set(id, factory());
  }
  return map;
}
