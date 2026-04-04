// ============================================================
// config_slave.h — Pins et config spécifiques à l'ESCLAVE (balcon)
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
// Solaire 20W + LiFePO4 12V 6Ah + MPPT + LM2596 (12V→5V)
// Fusible 5A sortie batterie + fusible 3A ligne pompe
// Fusible thermique 72°C sur câble batterie

// ---- BATTERY MONITORING (optionnel, via ADC) ----
// Diviseur de tension 100kΩ/100kΩ sur batterie → GPIO 35
constexpr uint8_t PIN_BATT_ADC     = 35;  // ADC1_CH7, input only
constexpr float   BATT_DIVIDER     = 2.0; // Ratio diviseur
constexpr float   BATT_FULL_MV     = 13200; // 4× 3.3V LiFePO4
constexpr float   BATT_EMPTY_MV    = 10000; // 4× 2.5V LiFePO4

// ---- ESP-NOW ----
// Master MAC address (à configurer après flash du maître)
