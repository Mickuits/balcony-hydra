// ============================================================
// DegradedMode — Arrosage autonome esclave quand maître perdu
//
// Charge la dernière config reçue depuis NVS
// Arrose en local selon les seuils d'humidité
// Respecte cooldown + max cycles
// Tous les failsafes locaux restent actifs
// ============================================================

#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include "config_common.h"  // path injecté via -I../../common

struct DegradedConfig {
    uint8_t  moistureMin;
    uint8_t  moistureMax;
    uint16_t pumpDurationS;
    uint32_t cooldownS;
    uint8_t  maxCyclesPerDay;
    bool     valid;
};

class DegradedMode {
public:
    DegradedMode();
    void begin();

    // Save config received from master (call on CMD_SET_CONFIG)
    void saveConfig(uint8_t moistMin, uint8_t moistMax, uint16_t duration,
                    uint32_t cooldown, uint8_t maxCycles);

    // Check if should water (called in sensor loop when master lost)
    bool shouldWater(uint8_t avgMoisture) const;

    // Record a watering cycle
    void recordCycle();

    // Get saved config
    const DegradedConfig& config() const { return _cfg; }
    bool hasValidConfig() const { return _cfg.valid; }

private:
    DegradedConfig _cfg;
    mutable uint32_t _lastWaterTime;
    mutable uint8_t  _cycleCount;
    mutable uint32_t _cycleResetTime;
};
