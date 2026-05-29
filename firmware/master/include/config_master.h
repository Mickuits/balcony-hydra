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
// GPIO 18 — conflit VSPI CLK RÉSOLU 2026-05-29 : le bus SPI TFT a été remappé
// (CLK 18→19, MISO 19→35). Le relay garde donc le 18 sans collision.
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

// ---- TFT ILI9341 + XPT2046 (bus SPI remappé, conflit relay résolu) ----
// Remap 2026-05-29 pour libérer le relay sur GPIO 18 :
//   CLK  18 -> 19   (sortie ; le 18 reste au relay)
//   MISO 19 -> 35   (GPIO 35 input-only : valide pour MISO = entrée ESP32)
//   MOSI 23         (inchangé)
// Le pinout TFT est piloté par un bloc de flags dans platformio.ini, gardé
// COMMENTÉ tant qu'aucun écran n'est branché (non validable en CI), à activer
// au 1er flash HW. Constantes miroir ci-dessous = source de vérité du pinout.
constexpr uint8_t PIN_TFT_SCLK     = 19;
constexpr uint8_t PIN_TFT_MOSI     = 23;
constexpr uint8_t PIN_TFT_MISO     = 35;
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
constexpr uint8_t  MUX1_CHANNELS         = 10;  // 10 capteurs intérieur
constexpr uint8_t  MUX2_CHANNELS         = 0;   // No 2nd MUX (PIN_MUX2_EN = 0xFF)

// ---- WEB SERVER ----
constexpr uint16_t WEB_SERVER_PORT       = 80;

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
// [DEPRECATED 2026-04-08] Remplacé par le pairing dynamique au premier boot.
// Conservé pour référence et debug uniquement.
// constexpr uint8_t DEFAULT_SLAVE_MAC[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
constexpr uint8_t PIN_MUX2_SIG = 0xFF;
constexpr uint8_t PIN_PUMP_A = 0xFF;  // Zone A remote
constexpr uint8_t ZONE_A_SENSORS_START = 0;
constexpr uint8_t ZONE_A_SENSORS_END = 9;
constexpr uint8_t PIN_MUX1_SIG = PIN_MUX_SIG;
