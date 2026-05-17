/**
 * Seed initial CONFIG — valeurs par défaut pour Mougins le Haut.
 */
import type { SystemConfig } from '@/types';

export const INITIAL_CONFIG: SystemConfig = {
  location: {
    city: 'Mougins',
    postal: '06250',
    lat: 43.65,
    lng: 6.96,
  },
  system: {
    masterIp: '192.168.1.42',
    masterId: 'NODE_M01',
    fwVersion: 'v4.2.1',
    fwBuild: 318,
    mqttBroker: '192.168.1.10:1883',
    wifiSsid: 'Mougins_5G',
  },
  thresholds: {
    tankWarn: 30,
    tankCrit: 15,
    potDryDefault: 28,
    potOkDefault: 52,
  },
  vacation: {
    startDate: '',
    endDate: '',
    safetyMargin: 20,
    notificationsEnabled: true,
  },
  watering: {
    mode: 'AUTO',
    auto: {
      moistureMinPct: 35,
      moistureMaxPct: 60,
      cooldownH: 2,
      maxCyclesPerDay: 4,
    },
    scheduled: {
      slot1: { hour: 7, minute: 0, volumeMl: 200, enabled: true },
      slot2: { hour: 19, minute: 0, volumeMl: 200, enabled: false },
    },
    solar: {
      sunriseOffsetMin: 0,
      sunsetOffsetMin: 30,
      sunriseEnabled: false,
      sunsetEnabled: true,
    },
  },
};
