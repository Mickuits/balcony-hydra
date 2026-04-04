// ============================================================
// SafetyManager — Implementation v2
// Auto-recovery vs hard lockout logic
// ============================================================

#include "SafetyManager.h"

SafetyManager::SafetyManager(SensorManager& sensorMgr, StatusLED& led)
    : _sensorMgr(sensorMgr), _led(led), _lastCheck(0), _tempWarningSent(false) {
    memset(&_status, 0, sizeof(SafetyStatus));
    _status.state = SafetyState::NOMINAL;
    _status.lockoutType = LockoutType::NONE;
}

void SafetyManager::begin() {
    pinMode(PIN_SAFETY_RELAY, OUTPUT);
    _disengageRelay();

    _checkBootCrashes();
    _recordBoot();

    if (_status.crashSafeMode) {
        Serial.println("[SAFETY] ⚠⚠⚠ SAFE MODE — 3+ crashes détectés");
        Serial.println("[SAFETY] Pompe désactivée. /unlock Telegram ou bouton 10s pour reset.");
        _enterLockout(LockoutType::BOOT_CRASH, "Boot loop — safe mode");
    } else {
        Serial.printf("[SAFETY] Init OK. Boot #%d. Relay désarmé.\n", _status.bootCount);
    }
}

void SafetyManager::update() {
    if (millis() - _lastCheck < 2000) return;
    _lastCheck = millis();

    if (_status.crashSafeMode) {
        _updateLed();
        return;
    }

    _checkTemperature();
    _checkThermalAutoRecovery();
    _updateLed();
}

// ---- RELAY CONTROL ----

bool SafetyManager::armPump() {
    if (isLockout() || _status.crashSafeMode) {
        Serial.printf("[SAFETY] armPump() REFUSÉ — %s\n", _status.lockoutReason);
        return false;
    }

    // Pre-arm temperature check
    if (_sensorMgr.data().environment.valid &&
        _sensorMgr.data().environment.temperature > SAFETY_TEMP_CRITICAL) {
        _enterLockout(LockoutType::THERMAL, "T° critique avant arm");
        return false;
    }

    _engageRelay();
    Serial.println("[SAFETY] Relay ARMÉ");
    return true;
}

void SafetyManager::disarmPump() {
    _disengageRelay();
    Serial.println("[SAFETY] Relay DÉSARMÉ");
}

// ---- LOCKOUT STATUS ----

bool SafetyManager::isLockout() const {
    return _status.state == SafetyState::LOCKOUT_AUTO ||
           _status.state == SafetyState::LOCKOUT_HARD ||
           _status.state == SafetyState::SAFE_MODE;
}

bool SafetyManager::isHardLockout() const {
    return _status.state == SafetyState::LOCKOUT_HARD ||
           _status.state == SafetyState::SAFE_MODE;
}

// ---- REMOTE UNLOCK (Telegram /unlock or Web API) ----

bool SafetyManager::remoteUnlock(const String& source) {
    if (!isHardLockout()) {
        Serial.printf("[SAFETY] remoteUnlock(%s) — pas de hard lockout actif\n", source.c_str());
        return false;
    }

    // For overcurrent/dry-run: allow remote unlock (operator decides pump is OK)
    // For boot crash: clear crash counter and exit safe mode
    if (_status.lockoutType == LockoutType::BOOT_CRASH) {
        _prefs.begin("safety", false);
        _prefs.putUChar("bootCnt", 0);
        _prefs.end();
        _status.crashSafeMode = false;
    }

    _exitLockout(("Unlock distant via " + source).c_str());
    _alert(("✅ Système déverrouillé à distance via " + source).c_str());
    return true;
}

void SafetyManager::physicalReset() {
    // Same as remote unlock but from button
    if (_status.lockoutType == LockoutType::BOOT_CRASH) {
        _prefs.begin("safety", false);
        _prefs.putUChar("bootCnt", 0);
        _prefs.end();
        _status.crashSafeMode = false;
    }

    _exitLockout("Reset physique (bouton)");
    _alert("✅ Système déverrouillé (bouton physique)");
}

// ---- NOTIFICATIONS FROM PUMPCONTROLLER ----

void SafetyManager::notifyPumpOvercurrent() {
    _disengageRelay();
    _enterLockout(LockoutType::OVERCURRENT, "Surintensité pompe — problème mécanique?");
    _alert("🔴⚡ SURINTENSITÉ pompe — lockout dur. Envoyez /unlock pour réarmer.");
}

void SafetyManager::notifyPumpDryRun() {
    _disengageRelay();
    _enterLockout(LockoutType::DRY_RUN, "Marche à sec pompe — problème hydraulique?");
    _alert("🔴💧 MARCHE À SEC pompe — lockout dur. Envoyez /unlock pour réarmer.");
}

void SafetyManager::notifyTankRecovered() {
    // Auto-recovery: tank was critical, now it's OK again
    if (_status.lockoutType == LockoutType::TANK_EMPTY) {
        _exitLockout("Niveau réservoir rétabli");
        _alert("✅💧 Réservoir rempli — système opérationnel");
    }
}

void SafetyManager::markBootStable() {
    _prefs.begin("safety", false);
    _prefs.putUChar("bootCnt", 0);
    _prefs.end();
    _status.bootCount = 0;
    Serial.println("[SAFETY] Boot stable — compteur crash remis à 0.");
}

// ---- TEMPERATURE ----

void SafetyManager::_checkTemperature() {
    if (!_sensorMgr.data().environment.valid) return;

    float temp = _sensorMgr.data().environment.temperature;
    _status.lastTemperature = temp;

    // CRITICAL → auto-recovery lockout
    if (temp >= SAFETY_TEMP_CRITICAL) {
        if (_status.lockoutType != LockoutType::THERMAL) {
            _disengageRelay();
            _enterLockout(LockoutType::THERMAL,
                          "T° CRITIQUE — coupure auto. Reprendra quand T° < 45°C pendant 5 min");
            String msg = "🔴🌡 T° CRITIQUE: " + String(temp, 1) + "°C — système coupé (auto-recovery quand T° normalise)";
            _alert(msg.c_str());
        }
        _status.thermalResumeTracking = false;  // Reset recovery timer
        return;
    }

    // WARNING
    if (temp >= SAFETY_TEMP_WARNING && !_tempWarningSent) {
        if (_status.state == SafetyState::NOMINAL) {
            _status.state = SafetyState::WARNING;
        }
        String msg = "⚠🌡 T° haute: " + String(temp, 1) + "°C";
        _alert(msg.c_str());
        _tempWarningSent = true;
    }

    // Clear warning when back to normal with hysteresis
    if (temp < SAFETY_TEMP_WARNING - 3.0 && _tempWarningSent) {
        _tempWarningSent = false;
        if (_status.state == SafetyState::WARNING) {
            _status.state = SafetyState::NOMINAL;
        }
    }
}

void SafetyManager::_checkThermalAutoRecovery() {
    if (_status.lockoutType != LockoutType::THERMAL) return;
    if (!_sensorMgr.data().environment.valid) return;

    float temp = _sensorMgr.data().environment.temperature;

    if (temp <= SAFETY_TEMP_RESUME) {
        // Start tracking stable period
        if (!_status.thermalResumeTracking) {
            _status.thermalResumeTracking = true;
            _status.thermalResumeStart = millis();
            Serial.printf("[SAFETY] T° = %.1f°C < %.0f°C — début fenêtre stabilisation 5 min\n",
                          temp, SAFETY_TEMP_RESUME);
        }

        // Check if stable for 5 minutes
        if (millis() - _status.thermalResumeStart >= SAFETY_TEMP_STABLE_MS) {
            _exitLockout("T° stable < 45°C pendant 5 min — auto-recovery");
            String msg = "✅🌡 T° normalisée (" + String(temp, 1) + "°C, stable 5 min) — système opérationnel";
            _alert(msg.c_str());
        }
    } else {
        // T° remontée → reset timer
        if (_status.thermalResumeTracking) {
            _status.thermalResumeTracking = false;
            Serial.printf("[SAFETY] T° remontée à %.1f°C — reset fenêtre stabilisation\n", temp);
        }
    }
}

// ---- BOOT CRASH DETECTION ----

void SafetyManager::_checkBootCrashes() {
    _prefs.begin("safety", true);
    _status.bootCount = _prefs.getUChar("bootCnt", 0);
    _prefs.end();

    if (_status.bootCount >= SAFETY_MAX_BOOT_CRASHES) {
        _status.crashSafeMode = true;
    }
}

void SafetyManager::_recordBoot() {
    _prefs.begin("safety", false);
    uint8_t count = _prefs.getUChar("bootCnt", 0) + 1;
    _prefs.putUChar("bootCnt", count);
    _prefs.end();
    _status.bootCount = count;
    Serial.printf("[SAFETY] Boot #%d enregistré.\n", count);
}

// ---- LOCKOUT MANAGEMENT ----

void SafetyManager::_enterLockout(LockoutType type, const char* reason) {
    _disengageRelay();
    _status.lockoutType = type;
    strncpy(_status.lockoutReason, reason, sizeof(_status.lockoutReason));

    switch (type) {
        case LockoutType::THERMAL:
        case LockoutType::TANK_EMPTY:
            _status.state = SafetyState::LOCKOUT_AUTO;
            Serial.printf("[SAFETY] LOCKOUT AUTO: %s\n", reason);
            break;
        case LockoutType::OVERCURRENT:
        case LockoutType::DRY_RUN:
            _status.state = SafetyState::LOCKOUT_HARD;
            Serial.printf("[SAFETY] LOCKOUT DUR: %s\n", reason);
            break;
        case LockoutType::BOOT_CRASH:
            _status.state = SafetyState::SAFE_MODE;
            _status.crashSafeMode = true;
            Serial.printf("[SAFETY] SAFE MODE: %s\n", reason);
            break;
        default:
            break;
    }

    _updateLed();
}

void SafetyManager::_exitLockout(const char* reason) {
    _status.state = SafetyState::NOMINAL;
    _status.lockoutType = LockoutType::NONE;
    _status.thermalResumeTracking = false;
    memset(_status.lockoutReason, 0, sizeof(_status.lockoutReason));
    _tempWarningSent = false;
    _led.setState(LedState::OK);
    Serial.printf("[SAFETY] LOCKOUT LEVÉ: %s\n", reason);
}

// ---- INTERNAL ----

void SafetyManager::_engageRelay() {
    digitalWrite(PIN_SAFETY_RELAY, HIGH);
    _status.relayEngaged = true;
}

void SafetyManager::_disengageRelay() {
    digitalWrite(PIN_SAFETY_RELAY, LOW);
    _status.relayEngaged = false;
}

void SafetyManager::_alert(const char* msg) {
    Serial.printf("[SAFETY] %s\n", msg);
    if (_alertCb) _alertCb(msg);
}

void SafetyManager::_updateLed() {
    switch (_status.state) {
        case SafetyState::SAFE_MODE:
        case SafetyState::LOCKOUT_HARD:
            _led.setState(LedState::CRITICAL);
            break;
        case SafetyState::LOCKOUT_AUTO:
            _led.setState(LedState::FAILSAFE);
            break;
        case SafetyState::WARNING:
            _led.setState(LedState::WARNING);
            break;
        default:
            break;  // Let main.cpp manage OK/WATERING/AP states
    }
}

String SafetyManager::toJson() const {
    JsonDocument doc;
    doc["state"] = static_cast<uint8_t>(_status.state);
    const char* stateLabels[] = {"Nominal", "Alerte", "Lockout auto", "Lockout dur", "Safe mode"};
    doc["stateLabel"] = stateLabels[static_cast<uint8_t>(_status.state)];
    doc["lockoutType"] = static_cast<uint8_t>(_status.lockoutType);
    const char* typeLabels[] = {"Aucun", "Thermique", "Réservoir", "Surintensité", "Marche à sec", "Boot crash"};
    doc["lockoutTypeLabel"] = typeLabels[static_cast<uint8_t>(_status.lockoutType)];
    doc["relayEngaged"] = _status.relayEngaged;
    doc["temperature"] = _status.lastTemperature;
    doc["bootCount"] = _status.bootCount;
    doc["lockoutReason"] = _status.lockoutReason;
    doc["canAutoRecover"] = (_status.state == SafetyState::LOCKOUT_AUTO);
    doc["needsUnlock"] = isHardLockout();
    String out;
    serializeJson(doc, out);
    return out;
}
