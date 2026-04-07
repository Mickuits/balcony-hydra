// ============================================================
// ConfigManager — SLAVE (minimal, headers-only)
//
// L'esclave Balcony Hydra v4 ne persiste pas sa config en NVS :
// la source de vérité est le maître (qui pousse les paramètres
// via ESP-NOW si nécessaire). Ce ConfigManager fournit
// uniquement les structs et accesseurs attendus par
// SensorManager et PumpController, avec des défauts statiques
// repris de config_common.h + config_slave.h.
//
// Pas de Preferences, pas de JSON, pas de network — le slave
// est volontairement spartan. Si une mise à jour de config
// venant du maître doit être appliquée, elle passera par
// EspNowSlave qui mettra à jour _config en mémoire.
// ============================================================

#pragma once

#include <Arduino.h>
#include "config_slave.h"

struct WateringSchedule {
    uint8_t hour1;
    uint8_t min1;
    uint8_t hour2;
    uint8_t min2;
    bool    enabled1;
    bool    enabled2;
};

struct MoistureConfig {
    uint8_t  minThreshold;   // % — below → needs water
    uint8_t  maxThreshold;   // % — above → skip
    uint16_t airValue;       // ADC raw in dry air
    uint16_t waterValue;     // ADC raw submerged
};

struct TankConfig {
    float   heightCm;
    float   minLevelCm;
    uint8_t criticalPct;
    uint8_t warningPct;
};

enum class WateringMode : uint8_t {
    AUTOMATIC = 0,  // Capteurs humidité décident
    SCHEDULED = 1,  // Heures fixes
    SOLAR     = 2,  // Calé sur lever/coucher du soleil (master only)
    MANUAL    = 3   // Commande uniquement
};

struct AutoConfig {
    uint32_t cooldownS;       // Min time between two auto cycles
    uint8_t  maxCyclesPerDay; // Max auto watering per 24h
};

struct SystemConfig {
    WateringSchedule schedule;
    MoistureConfig   moisture;
    TankConfig       tank;
    AutoConfig       autoMode;
    WateringMode     mode;
    uint16_t         pumpDurationS;
    uint32_t         sleepIntervalS;
    uint32_t         heartbeatIntervalMs;
};

class ConfigManager {
public:
    ConfigManager() { loadDefaults(); }

    void begin() {
        Serial.println("[CONFIG] Defaults statiques chargés (slave, no NVS).");
    }

    void loadDefaults() {
        // Schedule (rarely used on slave — master drives schedule)
        _config.schedule.hour1    = DEFAULT_WATERING_HOUR_1;
        _config.schedule.min1     = DEFAULT_WATERING_MIN_1;
        _config.schedule.hour2    = DEFAULT_WATERING_HOUR_2;
        _config.schedule.min2     = DEFAULT_WATERING_MIN_2;
        _config.schedule.enabled1 = true;
        _config.schedule.enabled2 = false;

        // Moisture
        _config.moisture.minThreshold = DEFAULT_MOISTURE_MIN;
        _config.moisture.maxThreshold = DEFAULT_MOISTURE_MAX;
        _config.moisture.airValue     = MOISTURE_AIR_VALUE;
        _config.moisture.waterValue   = MOISTURE_WATER_VALUE;

        // Tank
        _config.tank.heightCm    = TANK_HEIGHT_CM;
        _config.tank.minLevelCm  = 3.0f;
        _config.tank.criticalPct = TANK_LEVEL_CRITICAL;
        _config.tank.warningPct  = TANK_LEVEL_WARNING;

        // Auto mode
        _config.autoMode.cooldownS       = DEFAULT_AUTO_COOLDOWN_S;
        _config.autoMode.maxCyclesPerDay = DEFAULT_AUTO_MAX_CYCLES;

        // System
        _config.mode               = WateringMode::AUTOMATIC;
        _config.pumpDurationS      = DEFAULT_PUMP_DURATION;
        _config.sleepIntervalS     = DEFAULT_SLEEP_INTERVAL_S;
        _config.heartbeatIntervalMs = DEFAULT_HEARTBEAT_MS;
    }

    SystemConfig&       config()       { return _config; }
    const SystemConfig& config() const { return _config; }

    WateringMode mode() const { return _config.mode; }
    void setMode(WateringMode m) { _config.mode = m; }

    bool isWateringTime(uint8_t hour, uint8_t minute) const {
        if (_config.schedule.enabled1 &&
            hour == _config.schedule.hour1 && minute == _config.schedule.min1) return true;
        if (_config.schedule.enabled2 &&
            hour == _config.schedule.hour2 && minute == _config.schedule.min2) return true;
        return false;
    }

    bool needsWatering(uint8_t moisturePct) const {
        return moisturePct < _config.moisture.minThreshold;
    }

    bool isTankCritical(uint8_t levelPct) const {
        return levelPct <= _config.tank.criticalPct;
    }

    bool isTankWarning(uint8_t levelPct) const {
        return levelPct <= _config.tank.warningPct;
    }

private:
    SystemConfig _config;
};
