/**
 * Seed initial PROFILES — 4 profils hydriques par défaut.
 */
import type { ProfilesMap } from '@/types';

export const INITIAL_PROFILES: ProfilesMap = {
  HERB_MED: {
    name: 'HERB_MED',
    label: 'Herbes méditerranéennes',
    dry: 28,
    ok: 52,
    vol: 150,
    cooldown: 4 * 3600,
    potCount: 7,
    k: 0.22,
  },
  FRUIT_DEMANDING: {
    name: 'FRUIT_DEMANDING',
    label: 'Fruits demandants',
    dry: 38,
    ok: 65,
    vol: 300,
    cooldown: 6 * 3600,
    potCount: 5,
    k: 0.1,
  },
  SUCCULENT_DRY: {
    name: 'SUCCULENT_DRY',
    label: 'Plantes succulentes',
    dry: 12,
    ok: 25,
    vol: 50,
    cooldown: 48 * 3600,
    potCount: 4,
    k: 0.4,
  },
  LEAFY_GREENS: {
    name: 'LEAFY_GREENS',
    label: 'Feuillages verts',
    dry: 35,
    ok: 60,
    vol: 200,
    cooldown: 12 * 3600,
    potCount: 3,
    k: 0.18,
  },
};
