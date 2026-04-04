// ============================================================
// config_master.h — Pins et config spécifiques au MAÎTRE (intérieur)
// ============================================================

#pragma once

#include "../../common/config_common.h"

// ---- PUMP B (Intérieur, filaire) ----
constexpr uint8_t PIN_PUMP_B       = 27;  // MOSFET gate

// ---- SAFETY RELAY (coupe pompe B) ----
constexpr uint8_t PIN_SAFETY_RELAY = 18;

// ---- SENSORS (Zone B — Intérieur) ----
constexpr uint8_t PIN_MUX_SIG      = 36;  // ADC1_CH0
constexpr uint8_t PIN_MUX_EN       = 4;
constexpr uint8_t PIN_MUX_S0       = 32;
constexpr uint8_t PIN_MUX_S1       = 33;
constexpr uint8_t PIN_MUX_S2       = 25;
constexpr uint8_t PIN_MUX_S3       = 26;
constexpr uint8_t PIN_US_TRIG      = 14;
constexpr uint8_t PIN_US_ECHO      = 34;

// ---- I2C (DS3231 only on master) ----
constexpr uint8_t PIN_SDA          = 21;
constexpr uint8_t PIN_SCL          = 22;

// ---- TFT ILI9341 + XPT2046 (HSPI to avoid LED conflict) ----
constexpr uint8_t PIN_TFT_CS       = 13;
constexpr uint8_t PIN_TFT_DC       = 12;
constexpr uint8_t PIN_TFT_RST      = -1;  // Tied to 3.3V
constexpr uint8_t PIN_TOUCH_CS     = 15;
// HSPI: MOSI=13? No — use custom SPI
// Actually use VSPI default: MOSI=23, MISO=19, CLK=18
// LED RGB must move to avoid conflict (see below)

// ---- LED RGB (moved to avoid SPI conflict) ----
constexpr uint8_t PIN_LED_R        = 16;
constexpr uint8_t PIN_LED_G        = 17;
constexpr uint8_t PIN_LED_B        = 2;   // Onboard LED doubles as blue

// ---- BUTTON ----
constexpr uint8_t PIN_BUTTON       = 5;

// ---- ALIMENTATION ----
// USB 5V secteur — pas de batterie, pas de solaire

// ---- ESP-NOW ----
// Slave MAC address (à configurer après flash de l'esclave)
// Format: {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF}
// Configurable via portail web ou NVS
