// ============================================================
// BALCONY HYDRA v3 — Configuration Système
// ============================================================

#pragma once

#include <Arduino.h>

// ---- VERSION ----
#ifndef HYDRA_VERSION
#define HYDRA_VERSION "3.0.0"
#endif

// ---- PIN ASSIGNMENTS ----
// Analog inputs (ADC1 only — WiFi safe)
constexpr uint8_t PIN_MUX1_SIG      = 36;   // VP — ADC1_CH0
constexpr uint8_t PIN_MUX2_SIG      = 39;   // VN — ADC1_CH3

// MUX address lines (shared)
constexpr uint8_t PIN_MUX_S0        = 32;
constexpr uint8_t PIN_MUX_S1        = 33;
constexpr uint8_t PIN_MUX_S2        = 25;
constexpr uint8_t PIN_MUX_S3        = 26;

// MUX enable (active LOW)
constexpr uint8_t PIN_MUX1_EN       = 4;
constexpr uint8_t PIN_MUX2_EN       = 16;

// Ultrasonic sensors
constexpr uint8_t PIN_US1_TRIG      = 14;
constexpr uint8_t PIN_US1_ECHO      = 34;   // Input only
constexpr uint8_t PIN_US2_TRIG      = 12;
constexpr uint8_t PIN_US2_ECHO      = 35;   // Input only

// Pump MOSFET gate
constexpr uint8_t PIN_PUMP          = 27;

// I2C (default ESP32)
constexpr uint8_t PIN_SDA           = 21;
constexpr uint8_t PIN_SCL           = 22;

// Status LED (onboard)
constexpr uint8_t PIN_LED           = 2;

// ---- SENSOR CONFIG ----
constexpr uint8_t  NUM_MOISTURE_SENSORS  = 20;
constexpr uint8_t  MUX1_CHANNELS         = 16;  // Sensors 0-15
constexpr uint8_t  MUX2_CHANNELS         = 4;   // Sensors 16-19
constexpr uint16_t MOISTURE_AIR_VALUE    = 3200; // ADC value in dry air
constexpr uint16_t MOISTURE_WATER_VALUE  = 1200; // ADC value submerged

// Ultrasonic
constexpr float    TANK_HEIGHT_CM        = 35.0; // Internal height of 25L jerrican
constexpr float    TANK_MIN_LEVEL_CM     = 5.0;  // Min level before failsafe
constexpr uint8_t  NUM_TANKS             = 3;
constexpr float    TANK_VOLUME_L         = 25.0;

// ---- PUMP CONFIG ----
constexpr float    PUMP_FLOW_RATE_LPM    = 2.0;  // Liters per minute
constexpr uint32_t PUMP_MAX_RUNTIME_S    = 300;   // Hard limit 5 min

// ---- DEFAULT WATERING SCHEDULE ----
constexpr uint8_t  DEFAULT_WATER_HOUR_1  = 7;    // Morning
constexpr uint8_t  DEFAULT_WATER_MIN_1   = 0;
constexpr uint8_t  DEFAULT_WATER_HOUR_2  = 20;   // Evening
constexpr uint8_t  DEFAULT_WATER_MIN_2   = 0;
constexpr uint16_t DEFAULT_PUMP_DURATION = 60;   // Seconds per cycle

// ---- SLEEP CONFIG ----
constexpr uint32_t DEFAULT_SLEEP_INTERVAL_S = 3600; // 1 hour
constexpr uint32_t MIN_SLEEP_INTERVAL_S     = 600;  // 10 min
constexpr uint32_t MAX_SLEEP_INTERVAL_S     = 21600; // 6 hours

// ---- MOISTURE THRESHOLDS ----
constexpr uint8_t  DEFAULT_MOISTURE_MIN  = 30;   // Below → needs water (%)
constexpr uint8_t  DEFAULT_MOISTURE_MAX  = 70;   // Above → skip watering (%)

// ---- TANK LEVEL THRESHOLDS ----
constexpr uint8_t  TANK_LEVEL_CRITICAL   = 10;   // % → pump failsafe
constexpr uint8_t  TANK_LEVEL_WARNING    = 25;   // % → Telegram alert

// ---- NETWORK ----
constexpr uint16_t WEB_SERVER_PORT       = 80;
constexpr uint32_t HEARTBEAT_INTERVAL_MS = 43200000; // 12 hours

// ---- MQTT TOPICS ----
#define MQTT_TOPIC_PREFIX   "hydra/"
#define MQTT_TOPIC_SENSORS  MQTT_TOPIC_PREFIX "sensors"
#define MQTT_TOPIC_PUMP     MQTT_TOPIC_PREFIX "pump"
#define MQTT_TOPIC_ALERTS   MQTT_TOPIC_PREFIX "alerts"
#define MQTT_TOPIC_STATUS   MQTT_TOPIC_PREFIX "status"

// ---- NVS KEYS ----
#define NVS_NAMESPACE       "hydra"
