// ============================================================
// config_master.h — Configuration complete MAITRE (interieur)
// Inclut config_common.h (constantes partagees M/S)
// ============================================================

#pragma once

#include "../../common/config_common.h"

#define HYDRA_MASTER 1

// ---- PUMP B (Interieur, filaire) ----
constexpr uint8_t PIN_PUMP_B       = 27;
constexpr uint8_t PIN_PUMP         = PIN_PUMP_B;  // Legacy alias

// ---- SAFETY RELAY ----
constexpr uint8_t PIN_SAFETY_RELAY = 18;

// ---- SENSORS (Zone B local, 10 capteurs MUX) ----
constexpr uint8_t PIN_MUX_SIG      = 36;
constexpr uint8_t PIN_MUX_EN       = 4;
constexpr uint8_t PIN_MUX1_EN      = 4;
constexpr uint8_t PIN_MUX2_EN      = 0xFF; // No 2nd MUX
constexpr uint8_t PIN_MUX_S0       = 32;
constexpr uint8_t PIN_MUX_S1       = 33;
constexpr uint8_t PIN_MUX_S2       = 25;
constexpr uint8_t PIN_MUX_S3       = 26;

// ---- ULTRASONIC (1 reservoir interieur) ----
constexpr uint8_t PIN_US1_TRIG     = 14;
constexpr uint8_t PIN_US1_ECHO     = 34;
constexpr uint8_t PIN_US2_TRIG     = 0xFF;
constexpr uint8_t PIN_US2_ECHO     = 0xFF;

// ---- I2C (DS3231) ----
constexpr uint8_t PIN_SDA          = 21;
constexpr uint8_t PIN_SCL          = 22;

// ---- TFT ILI9341 + XPT2046 (VSPI) ----
constexpr uint8_t PIN_TFT_CS       = 13;
constexpr uint8_t PIN_TFT_DC       = 12;
constexpr uint8_t PIN_TFT_RST      = 0xFF;
constexpr uint8_t PIN_TOUCH_CS     = 15;

// ---- LED RGB (moved off SPI pins) ----
constexpr uint8_t PIN_LED_R        = 16;
constexpr uint8_t PIN_LED_G        = 17;
constexpr uint8_t PIN_LED_B        = 2;
constexpr uint8_t PIN_LED          = 2;
constexpr uint8_t LEDC_CH_R        = 4;
constexpr uint8_t LEDC_CH_G        = 5;
constexpr uint8_t LEDC_CH_B        = 6;
constexpr uint32_t LEDC_FREQ       = 5000;

// ---- BUTTON ----
constexpr uint8_t PIN_BUTTON       = 5;

// ---- SENSOR COUNTS ----
constexpr uint8_t  NUM_MOISTURE_SENSORS  = 10;
constexpr uint8_t  NUM_TANKS             = 1;
constexpr float    TANK_VOLUME_L         = 25.0;

// ---- ZONE MAPPING ----
constexpr uint8_t ZONE_B_SENSORS_START = 0;
constexpr uint8_t ZONE_B_SENSORS_END   = 9;

// ---- WATERING DEFAULTS ----
constexpr uint8_t  DEFAULT_WATER_HOUR_1  = 7;
constexpr uint8_t  DEFAULT_WATER_MIN_1   = 0;
constexpr uint8_t  DEFAULT_WATER_HOUR_2  = 20;
constexpr uint8_t  DEFAULT_WATER_MIN_2   = 0;
constexpr bool     DEFAULT_SOLAR_SUNRISE_EN   = true;
constexpr bool     DEFAULT_SOLAR_SUNSET_EN    = true;

// ---- NETWORK / MQTT ----
constexpr uint16_t DEFAULT_MQTT_PORT = 1883;
#define MQTT_TOPIC_PREFIX    "hydra/"
#define MQTT_TOPIC_SENSORS   MQTT_TOPIC_PREFIX "sensors"
#define MQTT_TOPIC_PUMP      MQTT_TOPIC_PREFIX "pump"
#define MQTT_TOPIC_ALERTS    MQTT_TOPIC_PREFIX "alerts"

// ---- HEARTBEAT / SLEEP ----
constexpr uint32_t DEFAULT_SLEEP_INTERVAL_S    = 3600;
constexpr uint32_t DEFAULT_HEARTBEAT_MS        = 43200000;

// ---- OTA ----
constexpr bool DEFAULT_OTA_ENABLED = true;
#define OTA_HOSTNAME "hydra-master"

// ---- ESP-NOW SLAVE MAC ----
constexpr uint8_t DEFAULT_SLAVE_MAC[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
constexpr uint8_t PIN_MUX2_SIG = 0xFF;
constexpr uint8_t PIN_PUMP_A = 0xFF;  // Zone A remote
constexpr uint8_t ZONE_A_SENSORS_START = 0;
constexpr uint8_t ZONE_A_SENSORS_END = 9;
constexpr uint8_t PIN_MUX1_SIG = PIN_MUX_SIG;
