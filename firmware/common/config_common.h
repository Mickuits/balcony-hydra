// ============================================================
// config_common.h — Constantes partagées maître + esclave
// ============================================================

#pragma once

#include <Arduino.h>

// ---- PROJECT ----
#define HYDRA_VERSION "4.0"

// ---- LOCATION (Mougins le Haut) ----
constexpr float    DEFAULT_LATITUDE  = 43.61;
constexpr float    DEFAULT_LONGITUDE = 6.99;

// ---- ZONES ----
constexpr uint8_t NUM_ZONES = 2;
constexpr uint8_t ZONE_A    = 0;  // Balcon (esclave)
constexpr uint8_t ZONE_B    = 1;  // Intérieur (maître)
constexpr uint8_t POTS_PER_ZONE = 10;

// ---- PUMP LIMITS ----
constexpr uint32_t PUMP_MAX_RUNTIME_S  = 300;  // 5 min hard limit

// ---- MOISTURE ----
constexpr uint8_t  DEFAULT_MOISTURE_MIN = 30;
constexpr uint8_t  DEFAULT_MOISTURE_MAX = 70;
constexpr uint16_t MOISTURE_AIR_VALUE   = 3200;
constexpr uint16_t MOISTURE_WATER_VALUE = 1200;

// ---- AUTO MODE ----
constexpr uint32_t DEFAULT_AUTO_COOLDOWN_S   = 7200;   // 2h
constexpr uint8_t  DEFAULT_AUTO_MAX_CYCLES   = 4;
constexpr uint32_t AUTO_CYCLE_RESET_INTERVAL = 86400;  // 24h

// ---- TANK ----
constexpr float   TANK_HEIGHT_CM     = 35.0;
constexpr uint8_t TANK_LEVEL_CRITICAL = 10;
constexpr uint8_t TANK_LEVEL_WARNING  = 25;

// ---- COMMUNICATION ----
constexpr uint32_t ESPNOW_PING_INTERVAL_MS = 60000;   // 60s heartbeat
constexpr uint8_t  ESPNOW_MAX_MISSED_PONGS = 3;       // → alert after 3 missed
constexpr uint32_t ESPNOW_SENSOR_INTERVAL_MS = 30000;  // 30s sensor read cycle

// ---- SAFETY ----
// Thermal safety (BME280 ambiant, pas batterie)
constexpr float    SAFETY_TEMP_WARNING     = 50.0;
constexpr float    SAFETY_TEMP_CRITICAL    = 58.0;
constexpr float    SAFETY_TEMP_RESUME      = 45.0;
constexpr uint32_t SAFETY_TEMP_STABLE_MS   = 300000;  // 5 min
constexpr uint8_t  SAFETY_MAX_BOOT_CRASHES = 3;
constexpr uint32_t SAFETY_STABLE_BOOT_MS   = 60000;   // 60s

// ---- SOLAR ----
constexpr int8_t  DEFAULT_SUNRISE_OFFSET_MIN = 0;
constexpr int8_t  DEFAULT_SUNSET_OFFSET_MIN  = 30;
constexpr uint16_t DEFAULT_PUMP_DURATION = 60;
constexpr float   TANK_MIN_LEVEL_CM    = 3.0;
constexpr uint32_t HEARTBEAT_INTERVAL_MS = 43200000;
#define NVS_NAMESPACE "hydra"
// MUX channel counts are firmware-specific (master uses 1×MUX 10ch, slave
// uses 1×MUX 10ch with MUX2 disabled). Defined per firmware in
// config_master.h / config_slave.h to keep cohérent with PIN_MUX2_EN.
constexpr uint32_t MIN_SLEEP_INTERVAL_S = 60;
constexpr uint32_t MAX_SLEEP_INTERVAL_S = 86400;
constexpr uint8_t  DEFAULT_WATERING_HOUR_1 = 7;
constexpr uint8_t  DEFAULT_WATERING_MIN_1 = 0;
constexpr uint8_t  DEFAULT_WATERING_HOUR_2 = 20;
constexpr uint8_t  DEFAULT_WATERING_MIN_2 = 0;
