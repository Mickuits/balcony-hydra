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
