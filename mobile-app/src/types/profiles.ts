/**
 * Types des profils hydriques de plantes.
 */

export type ProfileId = 'HERB_MED' | 'FRUIT_DEMANDING' | 'SUCCULENT_DRY' | 'LEAFY_GREENS';

export interface PlantProfile {
  name: ProfileId;
  label: string;
  dry: number; // % seuil critique
  ok: number; // % seuil cible
  vol: number; // ml par cycle
  cooldown: number; // secondes entre cycles
  potCount: number;
  /** Coefficient humidité gagnée par ml (utilisé par recomputeProjection) */
  k: number;
}

export type ProfilesMap = Record<ProfileId, PlantProfile>;
