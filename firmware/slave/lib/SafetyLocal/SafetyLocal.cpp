// ============================================================
// SafetyLocal — Implementation
// ============================================================

#include "SafetyLocal.h"

SafetyLocal::SafetyLocal()
    : _state(LocalSafetyState::OK), _safeMode(false), _bootCount(0) {
    memset(_blockReason, 0, sizeof(_blockReason));
}

void SafetyLocal::begin() {
    _checkBootCrashes();
    _recordBoot();

    if (_safeMode) {
        _state = LocalSafetyState::SAFE_MODE;
        strncpy(_blockReason, "Boot loop (3+ crashes)", sizeof(_blockReason));
        Serial.println("[SAFETY-LOCAL] ⚠ SAFE MODE — pompe désactivée");
    } else {
        Serial.printf("[SAFETY-LOCAL] OK. Boot #%d.\n", _bootCount);
    }
}

bool SafetyLocal::canPumpRun(uint8_t tankLevelPct, float currentMA) const {
    if (_safeMode) return false;
    if (tankLevelPct < TANK_LEVEL_CRITICAL) return false;
    return true;
}

bool SafetyLocal::checkRuntime(uint32_t runningSec) const {
    if (runningSec >= PUMP_MAX_RUNTIME_S) {
        Serial.println("[SAFETY-LOCAL] ⚠ MAX RUNTIME atteint!");
        return false;
    }
    return true;
}

bool SafetyLocal::checkCurrent(float currentMA) const {
    if (currentMA > 3000.0) {
        Serial.printf("[SAFETY-LOCAL] ⚠ SURINTENSITÉ: %.0fmA\n", currentMA);
        return false;
    }
    if (currentMA < 50.0) {
        Serial.printf("[SAFETY-LOCAL] ⚠ MARCHE À SEC: %.0fmA\n", currentMA);
        return false;
    }
    return true;
}

bool SafetyLocal::checkTank(uint8_t tankLevelPct) const {
    return tankLevelPct >= TANK_LEVEL_CRITICAL;
}

void SafetyLocal::markBootStable() {
    Preferences prefs;
    prefs.begin("safety_s", false);
    prefs.putUChar("bootCnt", 0);
    prefs.end();
    _bootCount = 0;
    Serial.println("[SAFETY-LOCAL] Boot stable — compteur remis à 0.");
}

void SafetyLocal::resetSafeMode() {
    _safeMode = false;
    _state = LocalSafetyState::OK;
    memset(_blockReason, 0, sizeof(_blockReason));
    markBootStable();
    Serial.println("[SAFETY-LOCAL] Safe mode désactivé.");
}

void SafetyLocal::_checkBootCrashes() {
    Preferences prefs;
    prefs.begin("safety_s", true);
    _bootCount = prefs.getUChar("bootCnt", 0);
    prefs.end();

    if (_bootCount >= SAFETY_MAX_BOOT_CRASHES) {
        _safeMode = true;
    }
}

void SafetyLocal::_recordBoot() {
    Preferences prefs;
    prefs.begin("safety_s", false);
    uint8_t count = prefs.getUChar("bootCnt", 0) + 1;
    prefs.putUChar("bootCnt", count);
    prefs.end();
    _bootCount = count;
}
