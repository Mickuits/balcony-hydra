// ============================================================
// config_slave.h — Pins et config ESCLAVE (balcon, USB secteur)
// ============================================================

#pragma once

#include "../../common/config_common.h"

// ---- PUMP A (Balcon, locale) ----
constexpr uint8_t PIN_PUMP_A       = 27;  // MOSFET gate + pull-down 10kΩ

// ---- SENSORS (Zone A — Balcon) ----
constexpr uint8_t PIN_MUX_SIG      = 36;  // ADC1_CH0
constexpr uint8_t PIN_MUX_EN       = 4;
constexpr uint8_t PIN_MUX_S0       = 32;
constexpr uint8_t PIN_MUX_S1       = 33;
constexpr uint8_t PIN_MUX_S2       = 25;
constexpr uint8_t PIN_MUX_S3       = 26;
constexpr uint8_t PIN_US_TRIG      = 14;
constexpr uint8_t PIN_US_ECHO      = 34;

// ---- I2C (BME280 + INA219) ----
constexpr uint8_t PIN_SDA          = 21;
constexpr uint8_t PIN_SCL          = 22;

// ---- LED RGB ----
constexpr uint8_t PIN_LED_R        = 17;
constexpr uint8_t PIN_LED_G        = 19;
constexpr uint8_t PIN_LED_B        = 23;

// ---- LED ONBOARD (heartbeat) ----
constexpr uint8_t PIN_LED_ONBOARD  = 2;

// ---- ALIMENTATION ----
// USB 5V secteur via prise balcon — pas de batterie/solaire
// Fusible 3A inline sur ligne pompe 12V (si pompe 12V)

// ---- SLAVE FLAG ----
#define HYDRA_SLAVE 1

// ---- LEGACY ALIASES (for v3 module compatibility) ----
constexpr uint8_t PIN_PUMP         = PIN_PUMP_A;
constexpr uint8_t PIN_LED          = PIN_LED_ONBOARD;
constexpr uint8_t PIN_MUX1_EN      = PIN_MUX_EN;
constexpr uint8_t PIN_MUX2_EN      = 0xFF;  // No 2nd MUX
constexpr uint8_t PIN_MUX2_SIG     = 0xFF;
constexpr uint8_t PIN_US1_TRIG     = PIN_US_TRIG;
constexpr uint8_t PIN_US1_ECHO     = PIN_US_ECHO;
constexpr uint8_t PIN_US2_TRIG     = 0xFF;  // No 2nd US (vases communicants)
constexpr uint8_t PIN_US2_ECHO     = 0xFF;
constexpr uint8_t PIN_BUTTON       = 0xFF;  // No button on slave

// ---- SENSOR COUNTS (Zone A only) ----
constexpr uint8_t  NUM_MOISTURE_SENSORS  = 10;
constexpr uint8_t  NUM_TANKS             = 1;
constexpr float    TANK_VOLUME_L         = 50.0;  // 2x25L vases communicants
constexpr uint8_t  MUX1_CHANNELS         = 10;
constexpr uint8_t  MUX2_CHANNELS         = 0;

// ---- ZONE MAPPING (single zone) ----
// Slave only manages Zone A locally
constexpr uint8_t ZONE_A_SENSORS_START = 0;
constexpr uint8_t ZONE_A_SENSORS_END   = 9;

// ---- WATERING DEFAULTS ----
// DEFAULT_PUMP_DURATION vient de config_common.h
constexpr uint32_t DEFAULT_SLEEP_INTERVAL_S = 3600;
constexpr uint32_t DEFAULT_HEARTBEAT_MS = 43200000;
constexpr uint16_t DEFAULT_MQTT_PORT = 1883;

// ---- LEDC (for StatusLED compatibility) ----
constexpr uint8_t LEDC_CH_R        = 4;
constexpr uint8_t LEDC_CH_G        = 5;
constexpr uint8_t LEDC_CH_B        = 6;
constexpr uint32_t LEDC_FREQ       = 5000;

// ---- OTA ----
#define OTA_HOSTNAME "hydra-slave"
