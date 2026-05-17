/**
 * Types des réponses REST API du firmware master.
 * Source de vérité : docs/mobile_api_contract.md §1
 */

import type { WateringMode } from './config';

export type RestState = 'mock' | 'ready' | 'error' | 'unauthorized';

export interface RestConfig {
  url: string;
  token: string;
}

export interface RestResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  latencyMs?: number;
  mock?: boolean;
}

/** Response `GET /api/status` (subset utilisé par l'app) */
export interface ApiStatusResponse {
  mode: number; // 0=AUTO, 1=SCHEDULED, 2=MANUAL, 3=SOLAR
  uptimeS: number;
  sensors: {
    avgMoisture: number;
    tankLevel: number; // % zone B master
    tank1Cm: number;
    tank2Cm: number;
    temperature: number;
    humidity: number;
    pressure: number;
    envValid: boolean;
  };
  pump: {
    running: boolean;
    runningForS: number;
    state: number; // 0=IDLE, 1=RUNNING, 2=BLOCKED, 3=ERROR
    failsafe: boolean;
    totalCycles: number;
    lastCurrent: number; // mA
  };
  config: {
    pumpDuration: number;
    sleepInterval: number;
    moisture: { min: number; max: number };
    schedule: { hour1: number; min1: number; hour2: number; min2: number };
    network: { wifiSsid: string; mqttHost: string };
  };
  wifi: {
    connected: boolean;
    ap: boolean;
    ip: string;
    rssi: number;
  };
}

export interface ApiSensorReading {
  id: number;
  raw: number;
  pct: number;
  ok: boolean;
}

export interface ApiSensorsResponse {
  moisture: ApiSensorReading[];
}

export interface ApiSafetyStatusResponse {
  state: number;
  stateLabel: string;
  lockoutType: number;
  lockoutTypeLabel: string;
  relayEngaged: boolean;
  temperature: number;
  bootCount: number;
  lockoutReason: string;
  canAutoRecover: boolean;
  needsUnlock: boolean;
}

export interface ApiMessageResponse {
  message: string;
  hint?: string;
}

/** Payload pour `POST /api/config` (fusion partielle) */
export interface ApiConfigUpdate {
  mode?: WateringMode;
  pumpDuration?: number;
  moisture?: { min?: number; max?: number };
  schedule?: { hour1?: number; min1?: number; hour2?: number; min2?: number };
  network?: { wifiSsid?: string; mqttHost?: string };
}
