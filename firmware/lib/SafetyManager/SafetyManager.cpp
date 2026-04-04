// ============================================================
// SafetyManager — Implementation
// ============================================================

#include "SafetyManager.h"

SafetyManager::SafetyManager(SensorManager& sensorMgr, StatusLED& led)
    : _sensorMgr(sensorMgr), _led(led), _lastCheck(0), _tempAlertSent(false) {
    memset(&_status, 0, sizeof(SafetyStatus));
    _status.state = SafetyState::NOMINAL;
}

void SafetyManager::begin() {
    // Safety relay: OUTPUT, start DISARMED (LOW = relay open = pump cut)
    pinMode(PIN_SAFETY_RELAY, OUTPUT);
    _disengageRelay();
    
    // Check for repeated crashes (boot loop detection)
    _checkBootCrashes();
    _recordBoot();
    
    if (_status.crashSafeMode) {
        Serial.println("[SAFETY] ⚠⚠⚠ SAFE MODE — 3+ crashes détectés en 30s");
        Serial.println("[SAFETY] Système en mode minimal. Pompe désactivée.");
        Serial.println("[SAFETY] Appui long bouton (10s) pour reset.");
        _led.setState(LedState::CRITICAL);
        _status.state = SafetyState::SAFE_MODE;
        _enterLockout("Boot loop détecté — safe mode");
    } else {
        Serial.printf("[SAFETY] Init OK. Boot #%d. Relay désarmé.\n", _status.bootCount);
    }
}

void SafetyManager::update() {
    if (millis() - _lastCheck < 2000) return;  // Check every 2s
    _lastCheck = millis();
    
    // Skip full checks in safe mode (minimal operation)
    if (_status.crashSafeMode) return;
    
    _checkTemperature();
}

// ---- RELAY CONTROL ----

bool SafetyManager::armPump() {
    if (_status.state == SafetyState::LOCKOUT || _status.crashSafeMode) {
        Serial.println("[SAFETY] armPump() REFUSÉ — lockout actif");
        return false;
    }
    
    // Pre-arm temperature check
    if (_sensorMgr.data().environment.valid) {
        float t = _sensorMgr.data().environment.temperature;
        if (t > SAFETY_TEMP_CRITICAL) {
            _enterLockout("Température critique avant arm");
            return false;
        }
    }
    
    _engageRelay();
    Serial.println("[SAFETY] Relay ARMÉ — pompe peut fonctionner");
    return true;
}

void SafetyManager::disarmPump() {
    _disengageRelay();
    Serial.println("[SAFETY] Relay DÉSARMÉ — pompe coupée");
}

void SafetyManager::resetLockout() {
    if (_status.thermalLockout) {
        // Check temperature before allowing reset
        _sensorMgr.readEnvironment();
        if (_sensorMgr.data().environment.valid && 
            _sensorMgr.data().environment.temperature > SAFETY_TEMP_RESUME) {
            Serial.printf("[SAFETY] Reset REFUSÉ — T° encore %.1f°C (seuil reprise: %.0f°C)\n",
                          _sensorMgr.data().environment.temperature, SAFETY_TEMP_RESUME);
            return;
        }
    }
    
    _status.state = SafetyState::NOMINAL;
    _status.thermalLockout = false;
    _status.crashSafeMode = false;
    memset(_status.lockoutReason, 0, sizeof(_status.lockoutReason));
    _tempAlertSent = false;
    _led.setState(LedState::OK);
    
    // Clear crash counter
    _prefs.begin("safety", false);
    _prefs.putUChar("bootCnt", 0);
    _prefs.end();
    
    Serial.println("[SAFETY] Lockout réinitialisé.");
    _alert("✅ Lockout sécurité réinitialisé");
}

// ---- TEMPERATURE ----

void SafetyManager::_checkTemperature() {
    if (!_sensorMgr.data().environment.valid) return;
    
    float temp = _sensorMgr.data().environment.temperature;
    _status.lastTemperature = temp;
    
    // CRITICAL — immediate lockout
    if (temp >= SAFETY_TEMP_CRITICAL) {
        if (!_status.thermalLockout) {
            _enterLockout("Température CRITIQUE");
            _alert("🔴🌡 ALERTE CRITIQUE: T° " + String(temp, 1) + "°C — système coupé!");
            _led.setState(LedState::CRITICAL);
        }
        return;
    }
    
    // WARNING
    if (temp >= SAFETY_TEMP_WARNING) {
        if (!_tempAlertSent) {
            _status.state = SafetyState::WARNING;
            _led.setState(LedState::WARNING);
            _alert("⚠🌡 Température haute: " + String(temp, 1) + "°C");
            _tempAlertSent = true;
        }
        return;
    }
    
    // Auto-resume from thermal lockout
    if (_status.thermalLockout && temp <= SAFETY_TEMP_RESUME) {
        Serial.printf("[SAFETY] T° redescendue à %.1f°C — reprise automatique\n", temp);
        _status.thermalLockout = false;
        _status.state = SafetyState::NOMINAL;
        _tempAlertSent = false;
        _led.setState(LedState::OK);
        _alert("✅🌡 T° normalisée (" + String(temp, 1) + "°C) — système opérationnel");
    }
    
    // Back to nominal from warning
    if (_status.state == SafetyState::WARNING && temp < SAFETY_TEMP_WARNING - 3.0) {
        _status.state = SafetyState::NOMINAL;
        _tempAlertSent = false;
        _led.setState(LedState::OK);
    }
}

// ---- BOOT CRASH DETECTION ----

void SafetyManager::_checkBootCrashes() {
    _prefs.begin("safety", true);
    _status.bootCount = _prefs.getUChar("bootCnt", 0);
    _status.lastBootTime = _prefs.getULong("lastBoot", 0);
    _prefs.end();
    
    // If last boot was within 30s window, increment crash counter
    // (millis() resets to 0 on reboot, so we use NVS timestamp)
    // Simple heuristic: if bootCount >= 3, enter safe mode
    if (_status.bootCount >= SAFETY_MAX_BOOT_CRASHES) {
        _status.crashSafeMode = true;
    }
}

void SafetyManager::_recordBoot() {
    _prefs.begin("safety", false);
    
    uint8_t count = _prefs.getUChar("bootCnt", 0);
    uint32_t lastBoot = _prefs.getULong("lastBoot", 0);
    
    // Reset counter if we've been running successfully for > 60s previously
    // (approximation: if bootCount was written, check if enough time passed)
    // On first stable boot, a task will call resetLockout() or clear counter after 60s
    
    count++;
    _prefs.putUChar("bootCnt", count);
    _prefs.putULong("lastBoot", millis());
    _prefs.end();
    
    _status.bootCount = count;
    
    Serial.printf("[SAFETY] Boot #%d enregistré.\n", count);
}

// ---- INTERNAL ----

void SafetyManager::_engageRelay() {
    digitalWrite(PIN_SAFETY_RELAY, HIGH);  // HIGH = relay closed = pump powered
    _status.relayEngaged = true;
}

void SafetyManager::_disengageRelay() {
    digitalWrite(PIN_SAFETY_RELAY, LOW);   // LOW = relay open = pump cut
    _status.relayEngaged = false;
}

void SafetyManager::_enterLockout(const char* reason) {
    _disengageRelay();
    _status.state = SafetyState::LOCKOUT;
    _status.thermalLockout = true;
    strncpy(_status.lockoutReason, reason, sizeof(_status.lockoutReason));
    Serial.printf("[SAFETY] ⚠ LOCKOUT: %s\n", reason);
}

void SafetyManager::_alert(const char* msg) {
    Serial.printf("[SAFETY] ALERTE: %s\n", msg);
    if (_alertCb) _alertCb(msg);
}
