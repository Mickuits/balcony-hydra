/**
 * Types de la configuration utilisateur — miroir typé de CONFIG du proto.
 */

export type WateringMode = 'AUTO' | 'SCHEDULED' | 'SOLAR' | 'MANUAL';

export interface LocationConfig {
  city: string;
  postal: string;
  lat: number;
  lng: number;
}

export interface SystemMeta {
  masterIp: string;
  masterId: string;
  fwVersion: string;
  fwBuild: number;
  mqttBroker: string; // host:port
  wifiSsid: string;
}

export interface ThresholdsConfig {
  tankWarn: number; // %
  tankCrit: number; // %
  potDryDefault: number; // %
  potOkDefault: number; // %
}

export interface VacationConfig {
  startDate: string; // ISO date
  endDate: string;
  safetyMargin: number; // % margin sur autonomie
  notificationsEnabled: boolean;
}

export interface AutoModeConfig {
  moistureMinPct: number;
  moistureMaxPct: number;
  cooldownH: number; // heures
  maxCyclesPerDay: number;
}

export interface ScheduledSlot {
  hour: number;
  minute: number;
  volumeMl: number;
  enabled: boolean;
}

export interface ScheduledModeConfig {
  slot1: ScheduledSlot;
  slot2: ScheduledSlot;
}

export interface SolarModeConfig {
  sunriseOffsetMin: number;
  sunsetOffsetMin: number;
  sunriseEnabled: boolean;
  sunsetEnabled: boolean;
}

export interface WateringConfig {
  mode: WateringMode;
  auto: AutoModeConfig;
  scheduled: ScheduledModeConfig;
  solar: SolarModeConfig;
}

export interface SystemConfig {
  location: LocationConfig;
  system: SystemMeta;
  thresholds: ThresholdsConfig;
  vacation: VacationConfig;
  watering: WateringConfig;
}
