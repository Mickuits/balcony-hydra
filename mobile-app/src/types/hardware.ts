/**
 * Types du state hardware — miroir typé de l'objet HARDWARE du proto legacy.
 * Source de vérité pour la communication MQTT/REST avec le firmware ESP32.
 */

export type ControllerId = 'MASTER' | 'SLAVE';

export type SafetyManagerState = 'NORMAL' | 'THERMAL_LOCKOUT' | 'HARD_LOCKOUT' | 'SAFE_MODE';

export type PairingStatus = 'PAIRED' | 'UNPAIRED' | 'PAIRING';

export type PotVisualState =
  | 'crit' // sous seuil dry (rouge)
  | 'dry' // sous seuil ok (orange)
  | 'ok' // dans la plage cible
  | 'high' // récemment arrosé
  | 'watering' // en cours d'arrosage
  | 'off'; // désactivé

export type ZoneLabel = 'balcon' | 'interieur';

export interface MasterState {
  online: boolean;
  uptime: number; // secondes depuis boot
  lastSync: number; // secondes depuis dernier sync
  ramUsed: number; // kB
  ramTotal: number; // kB
  flashUsed: number; // MB
  flashTotal: number; // MB
  mqttRtt: number; // ms
  powerVolt: number; // V
  wanLatency: number; // ms
  wanLoss: number; // % packet loss
  zone: 'B';
  avgHum: number; // moyenne humidité zone B 0-100
  pumpRunning: boolean;
}

export interface SlaveState {
  online: boolean;
  rssi: number; // dBm
  voltage: number; // V
  lastSeq: number; // # séquence ESP-NOW
  zone: 'A';
  avgHum: number;
  pumpRunning: boolean;
}

export interface UpsState {
  charge: number; // 0-100 %
  voltage: number; // V
  runtimeRemain: number; // secondes
}

export interface PairingState {
  status: PairingStatus;
  masterMac: string; // format AA:BB:CC:DD:EE:FF
  slaveMac: string | null;
  lastSeq: number;
  rssi: number; // dBm
  lastPingMs: number; // ms RTT
  pairedSince: number; // secondes depuis pairing
  magicByte: string; // ex '0xBA'
}

export interface SafetyState {
  state: SafetyManagerState;
  reason: string | null;
  sinceLockoutS: number;
  tempPcb: number; // °C
  bootCrashCount: number;
  thermalCoolingRemainS: number;
  relayArmed: boolean;
  pumpEnabled: boolean;
}

export interface Pot {
  controller: ControllerId;
  muxChannel: number; // 0-9
  hum: number; // 0-100 %
  tempSoil: number; // °C
  ec: number; // mS/cm
  lastWater: number; // secondes depuis dernier arrosage
  profileId: string;
  name: string;
  species: string;
  nameShort: string;
  zone: ZoneLabel;
  state: PotVisualState;
  vol: number; // ml
}

export interface Tank {
  controller: ControllerId;
  name: string;
  cap: number; // L (capacité)
  vol: number; // L (volume actuel)
  lastFill: number; // secondes depuis remplissage
  cycles: number; // # cycles depuis dernier remplissage
  sensorOk: boolean;
  distSensor: number; // cm
  distFull: number; // cm
  sigmaMm: number; // mm (précision capteur US)
  driftPct: number; // % drift 21j
  calibAge: number; // secondes depuis calibration
}

export interface HardwareState {
  master: MasterState;
  slaves: Record<string, SlaveState>;
  ups: UpsState;
  pairing: PairingState;
  safety: SafetyState;
  pots: Record<string, Pot>;
  tanks: Record<string, Tank>;
}
