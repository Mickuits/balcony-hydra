// ============================================================
// PumpController — Implementation
// ============================================================

#include "PumpController.h"
#include "TimeManager.h"

PumpController::PumpController(ConfigManager& configMgr, SensorManager& sensorMgr)
    : _configMgr(configMgr), _sensorMgr(sensorMgr),
      _startTime(0), _targetDuration(0) {
    memset(&_status, 0, sizeof(PumpStatus));
    _status.state = PumpState::IDLE;
    _status.lastStopReason = PumpStopReason::NONE;
}

void PumpController::begin() {
    pinMode(PIN_PUMP, OUTPUT);
    _pumpOff();  // Ensure pump is OFF at boot
    Serial.println("[PUMP] Initialisée. État: IDLE.");
}

void PumpController::update() {
    if (_status.state != PumpState::RUNNING) return;
    
    // Check duration
    uint32_t elapsed = runningForS();
    if (elapsed >= _targetDuration) {
        stop(PumpStopReason::DURATION_DONE);
        return;
    }
    
    // Check failsafes every second
    if (!_checkFailsafes()) {
        return;  // Failsafe triggered, pump stopped
    }
}

bool PumpController::start(uint16_t durationS) {
    // Block if failsafe active
    if (_status.failsafeActive) {
        Serial.println("[PUMP] BLOQUÉE — failsafe actif. Appeler resetFailsafe() d'abord.");
        return false;
    }
    
    // Pre-flight checks
    _sensorMgr.readTankLevels();
    if (_configMgr.isTankCritical(_sensorMgr.tankLevel())) {
        Serial.println("[PUMP] REFUSÉ — réservoir critique!");
        _status.state = PumpState::BLOCKED;
        _status.failsafeActive = true;
        _status.lastStopReason = PumpStopReason::TANK_EMPTY;
        return false;
    }
    
    _targetDuration = (durationS > 0) ? durationS : _configMgr.config().pumpDurationS;
    
    // Hard limit
    if (_targetDuration > PUMP_MAX_RUNTIME_S) {
        _targetDuration = PUMP_MAX_RUNTIME_S;
        Serial.printf("[PUMP] Durée limitée à %ds (max runtime)\n", PUMP_MAX_RUNTIME_S);
    }
    
    _pumpOn();
    _startTime = millis();
    _status.state = PumpState::RUNNING;
    _status.totalCycleCount++;
    
    Serial.printf("[PUMP] DÉMARRAGE — durée cible: %ds, cycle #%d\n",
                  _targetDuration, _status.totalCycleCount);
    return true;
}

void PumpController::stop(PumpStopReason reason) {
    _pumpOff();
    
    uint32_t duration = runningForS();
    _status.state = (reason == PumpStopReason::TANK_EMPTY || 
                     reason == PumpStopReason::OVERCURRENT ||
                     reason == PumpStopReason::DRY_RUN)
                    ? PumpState::BLOCKED : PumpState::IDLE;
    
    _status.lastStopReason    = reason;
    _status.lastRunTimestamp  = millis();
    _status.lastRunDurationS  = duration;
    
    if (_status.state == PumpState::BLOCKED) {
        _status.failsafeActive = true;
    }
    
    const char* reasons[] = {
        "NONE", "DURÉE OK", "STOP MANUEL", "RÉSERVOIR VIDE",
        "MAX RUNTIME", "SURINTENSITÉ", "MARCHE À SEC"
    };
    Serial.printf("[PUMP] ARRÊT — raison: %s, durée: %ds\n",
                  reasons[static_cast<uint8_t>(reason)], duration);
}

void PumpController::resetFailsafe() {
    _status.failsafeActive = false;
    _status.state = PumpState::IDLE;
    Serial.println("[PUMP] Failsafe réinitialisé.");
}

uint32_t PumpController::runningForS() const {
    if (_status.state != PumpState::RUNNING) return 0;
    return (millis() - _startTime) / 1000;
}

bool PumpController::shouldWater(uint8_t hour, uint8_t minute) const {
    const auto& cfg = _configMgr.config();
    
    switch (cfg.mode) {
        case WateringMode::AUTOMATIC:
            // Scheduled time AND moisture below threshold
            if (_configMgr.isWateringTime(hour, minute)) {
                return _configMgr.needsWatering(_sensorMgr.avgMoisture());
            }
            // Also check solar times if TimeManager available
            if (_timeMgr) {
                bool solarTrigger = false;
                if (cfg.solar.sunriseEnabled) {
                    solarTrigger |= _timeMgr->isSolarTimeFor(hour, minute, cfg.solar.sunriseOffsetMin, false);
                }
                if (cfg.solar.sunsetEnabled) {
                    solarTrigger |= _timeMgr->isSolarTimeFor(hour, minute, cfg.solar.sunsetOffsetMin, true);
                }
                if (solarTrigger) {
                    return _configMgr.needsWatering(_sensorMgr.avgMoisture());
                }
            }
            return false;
            
        case WateringMode::SCHEDULED:
            return _configMgr.isWateringTime(hour, minute);
            
        case WateringMode::SOLAR:
            // Solar-only: arrosage calé sur lever/coucher du soleil
            if (!_timeMgr) return false;
            if (cfg.solar.sunriseEnabled && _timeMgr->isSolarTimeFor(hour, minute, cfg.solar.sunriseOffsetMin, false)) {
                return true;
            }
            if (cfg.solar.sunsetEnabled && _timeMgr->isSolarTimeFor(hour, minute, cfg.solar.sunsetOffsetMin, true)) {
                return true;
            }
            return false;
            
        case WateringMode::MANUAL:
            return false;
    }
    return false;
}

void PumpController::_pumpOn() {
    digitalWrite(PIN_PUMP, HIGH);
}

void PumpController::_pumpOff() {
    digitalWrite(PIN_PUMP, LOW);
}

bool PumpController::_checkFailsafes() {
    // 1. Hard runtime limit
    if (runningForS() >= PUMP_MAX_RUNTIME_S) {
        stop(PumpStopReason::MAX_RUNTIME);
        Serial.println("[PUMP] ⚠ FAILSAFE: max runtime atteint!");
        return false;
    }
    
    // 2. Tank level (read fresh)
    _sensorMgr.readTankLevels();
    if (_configMgr.isTankCritical(_sensorMgr.tankLevel())) {
        stop(PumpStopReason::TANK_EMPTY);
        Serial.println("[PUMP] ⚠ FAILSAFE: réservoir critique!");
        return false;
    }
    
    // 3. Pump current anomaly (if INA219 available)
    _sensorMgr.readPumpMetrics();
    float current = _sensorMgr.pumpCurrent();
    _status.lastCurrent_mA = current;
    
    if (_sensorMgr.data().pump.valid) {
        // Dry run detection: current too low = no water flowing
        if (current < 50.0 && runningForS() > 3) {
            stop(PumpStopReason::DRY_RUN);
            Serial.printf("[PUMP] ⚠ FAILSAFE: marche à sec (%.0fmA)\n", current);
            if (_safetyCb) _safetyCb(PumpStopReason::DRY_RUN);
            return false;
        }
        
        // Overcurrent: pump blocked mechanically
        if (current > 3000.0) {
            stop(PumpStopReason::OVERCURRENT);
            Serial.printf("[PUMP] ⚠ FAILSAFE: surintensité (%.0fmA)\n", current);
            if (_safetyCb) _safetyCb(PumpStopReason::OVERCURRENT);
            return false;
        }
    }
    
    // 4. Tank levels divergence (raccord obstrué)
    if (!_sensorMgr.tankLevelsMatch()) {
        Serial.println("[PUMP] ⚠ ALERTE: niveaux US divergents — raccord obstrué?");
        // Don't stop pump, just alert (could be sensor noise)
    }
    
    return true;
}

String PumpController::toJson() const {
    JsonDocument doc;
    
    doc["state"]           = static_cast<uint8_t>(_status.state);
    doc["stateLabel"]      = (_status.state == PumpState::IDLE) ? "Arrêt" :
                             (_status.state == PumpState::RUNNING) ? "En marche" :
                             (_status.state == PumpState::BLOCKED) ? "Bloquée" : "Erreur";
    doc["running"]         = isRunning();
    doc["runningForS"]     = runningForS();
    doc["lastStopReason"]  = static_cast<uint8_t>(_status.lastStopReason);
    doc["lastRunDuration"] = _status.lastRunDurationS;
    doc["totalCycles"]     = _status.totalCycleCount;
    doc["lastCurrent"]     = _status.lastCurrent_mA;
    doc["failsafe"]        = _status.failsafeActive;
    
    String output;
    serializeJson(doc, output);
    return output;
}
