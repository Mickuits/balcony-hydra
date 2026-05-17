/**
 * Types des payloads MQTT publiés par le master.
 * Source de vérité : docs/mobile_api_contract.md §2.1
 */

export type MqttBridgeState = 'mock' | 'connecting' | 'connected' | 'error';

export interface MqttConfig {
  url: string; // ws://host:port
  user: string;
  pass: string;
}

/** Payload `hydra/sensors` */
export interface MqttSensorsPayload {
  avgMoisture: number;
  tankLevel: number;
  temperature: number;
  humidity: number;
  pressure: number;
}

/** Zone subset du payload `hydra/pump` */
export interface MqttPumpZoneState {
  state: number;
  stateLabel: string;
  running: boolean;
  runningForS: number;
  avgMoisture: number;
  totalCycles: number;
  lastCurrent: number;
  failsafe: boolean;
  lastStopReason: number;
}

/** Payload `hydra/pump` — dual-zone */
export interface MqttPumpPayload {
  balcon: MqttPumpZoneState;
  interieur: MqttPumpZoneState;
}

/** Payload `hydra/alerts` */
export interface MqttAlertPayload {
  alert: string;
  timestamp: number;
}

export type MqttTopicName = 'hydra/sensors' | 'hydra/pump' | 'hydra/alerts';
