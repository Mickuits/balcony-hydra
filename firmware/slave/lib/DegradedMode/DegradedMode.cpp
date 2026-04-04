// ============================================================
// DegradedMode — Implementation
// ============================================================

#include "DegradedMode.h"

DegradedMode::DegradedMode()
    : _lastWaterTime(0), _cycleCount(0), _cycleResetTime(0) {
    memset(&_cfg, 0, sizeof(DegradedConfig));
}

void DegradedMode::begin() {
    Preferences prefs;
    prefs.begin("degraded", true);

    if (prefs.isKey("valid") && prefs.getBool("valid", false)) {
        _cfg.moistureMin     = prefs.getUChar("moistMin", DEFAULT_MOISTURE_MIN);
        _cfg.moistureMax     = prefs.getUChar("moistMax", DEFAULT_MOISTURE_MAX);
        _cfg.pumpDurationS   = prefs.getUShort("duration", 60);
        _cfg.cooldownS       = prefs.getULong("cooldown", DEFAULT_AUTO_COOLDOWN_S);
        _cfg.maxCyclesPerDay  = prefs.getUChar("maxCycles", DEFAULT_AUTO_MAX_CYCLES);
        _cfg.valid = true;
        Serial.printf("[DEGRADED] Config NVS: min=%d%% max=%d%% dur=%ds cool=%ds max=%d/24h\n",
                      _cfg.moistureMin, _cfg.moistureMax, _cfg.pumpDurationS,
                      _cfg.cooldownS, _cfg.maxCyclesPerDay);
    } else {
        // No config ever received — use safe defaults (no watering)
        _cfg.moistureMin     = DEFAULT_MOISTURE_MIN;
        _cfg.moistureMax     = DEFAULT_MOISTURE_MAX;
        _cfg.pumpDurationS   = 60;
        _cfg.cooldownS       = DEFAULT_AUTO_COOLDOWN_S;
        _cfg.maxCyclesPerDay  = DEFAULT_AUTO_MAX_CYCLES;
        _cfg.valid = false;
        Serial.println("[DEGRADED] Pas de config NVS — defaults (pas d'arrosage auto)");
    }

    prefs.end();
    _cycleResetTime = millis();
}

void DegradedMode::saveConfig(uint8_t moistMin, uint8_t moistMax, uint16_t duration,
                               uint32_t cooldown, uint8_t maxCycles) {
    Preferences prefs;
    prefs.begin("degraded", false);
    prefs.putBool("valid", true);
    prefs.putUChar("moistMin", moistMin);
    prefs.putUChar("moistMax", moistMax);
    prefs.putUShort("duration", duration);
    prefs.putULong("cooldown", cooldown);
    prefs.putUChar("maxCycles", maxCycles);
    prefs.end();

    _cfg.moistureMin = moistMin;
    _cfg.moistureMax = moistMax;
    _cfg.pumpDurationS = duration;
    _cfg.cooldownS = cooldown;
    _cfg.maxCyclesPerDay = maxCycles;
    _cfg.valid = true;

    Serial.println("[DEGRADED] Config sauvée en NVS");
}

bool DegradedMode::shouldWater(uint8_t avgMoisture) const {
    if (!_cfg.valid) return false;  // No config → no auto watering

    if (avgMoisture >= _cfg.moistureMin) return false;  // Soil is OK

    // Cooldown check
    if (_lastWaterTime > 0) {
        uint32_t elapsed = (millis() - _lastWaterTime) / 1000;
        if (elapsed < _cfg.cooldownS) return false;
    }

    // Max cycles check
    if (millis() - _cycleResetTime > AUTO_CYCLE_RESET_INTERVAL * 1000UL) {
        _cycleCount = 0;
        _cycleResetTime = millis();
    }
    if (_cycleCount >= _cfg.maxCyclesPerDay) return false;

    return true;
}

void DegradedMode::recordCycle() {
    _lastWaterTime = millis();
    _cycleCount++;
    Serial.printf("[DEGRADED] Cycle enregistré: %d/%d\n", _cycleCount, _cfg.maxCyclesPerDay);
}
