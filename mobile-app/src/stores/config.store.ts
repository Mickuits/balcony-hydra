/**
 * ConfigStore — config utilisateur persistée localStorage.
 */
import { Store } from './store';
import { INITIAL_CONFIG } from '@/data';
import type { SystemConfig, WateringMode } from '@/types';

export class ConfigStore extends Store<SystemConfig> {
  constructor(initial: SystemConfig = INITIAL_CONFIG) {
    super(initial);
  }

  setWateringMode(mode: WateringMode): void {
    this.update((s) => ({ ...s, watering: { ...s.watering, mode } }));
  }

  setLocation(lat: number, lng: number, city?: string, postal?: string): void {
    this.update((s) => ({
      ...s,
      location: {
        ...s.location,
        lat,
        lng,
        city: city ?? s.location.city,
        postal: postal ?? s.location.postal,
      },
    }));
  }
}

export const configStore = new ConfigStore();
