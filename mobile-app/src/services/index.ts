/**
 * Barrel export — services métier (storage, REST, MQTT, mock, weather).
 */
export { StorageService, storageService, STORAGE_KEYS } from './storage';
export type { StorageKey } from './storage';

export { RestClient } from './rest-client';
export type { RestClientEvents } from './rest-client';

export { MqttBridge } from './mqtt-bridge';
export type {
  MqttLikeClient,
  MqttConnectFn,
  MqttConnectOptions,
  MqttBridgeDeps,
} from './mqtt-bridge';

export { MockService, classifyPotState } from './mock-service';
export type { MockServiceDeps } from './mock-service';

export { computeWeatherCoefficient, extendForecastToDays } from './weather';
export type { WeatherCoefficient, WeatherReferences } from './weather';

export { ConfigBackupService } from './config-backup';
export type { ConfigBackup, ConfigBackupServiceDeps } from './config-backup';

export { ErrorTracking } from './error-tracking';
export type { ErrorEntry, ErrorSeverity, ErrorTrackingDeps } from './error-tracking';
