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
            // AUTO = piloté par humidité, pas par horaire
            // shouldAutoWater() est appelé directement depuis la tâche capteurs
            return false;  // Ne jamais déclencher via le check horaire
            
        case WateringMode::SCHEDULED:
            return _configMgr.isWateringTime(hour, minute);
            
        case WateringMode::SOLAR:
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

bool PumpController::shouldAutoWater() const {
    if (_configMgr.config().mode != WateringMode::AUTOMATIC) return false;
    if (isRunning() || isBlocked()) return false;
    
    uint8_t moisture = _sensorMgr.avgMoisture();
    
    // Above max threshold → definitely no
    if (moisture >= _configMgr.config().moisture.maxThreshold) return false;
    
    // Above min threshold → no need
    if (moisture >= _configMgr.config().moisture.minThreshold) return false;
    
    // Below min threshold → check anti-spam protections
    if (!_isAutoCooldownOk()) {
        Serial.printf("[PUMP] AUTO: humidité %d%% < seuil mais cooldown actif (%ds restants)\n",
                      moisture, 
                      (int)(_configMgr.config().autoMode.cooldownS - (millis() - _lastAutoWaterTime) / 1000));
        return false;
    }
    
    if (!_isAutoMaxCyclesOk()) {
        Serial.printf("[PUMP] AUTO: humidité %d%% < seuil mais max cycles atteint (%d/%d)\n",
                      moisture, _autoCycleCount, _configMgr.config().autoMode.maxCyclesPerDay);
        return false;
    }
    
    Serial.printf("[PUMP] AUTO: humidité %d%% < seuil %d%% → arrosage déclenché\n",
                  moisture, _configMgr.config().moisture.minThreshold);
    
    // Update anti-spam counters
    _lastAutoWaterTime = millis();
    _autoCycleCount++;
    
    return true;
}

bool PumpController::_isAutoCooldownOk() const {
    if (_lastAutoWaterTime == 0) return true;  // First time
    uint32_t elapsed = (millis() - _lastAutoWaterTime) / 1000;
    return elapsed >= _configMgr.config().autoMode.cooldownS;
}

bool PumpController::_isAutoMaxCyclesOk() const {
    // Reset counter every 24h
    if (millis() - _autoCycleResetTime > AUTO_CYCLE_RESET_INTERVAL * 1000UL) {
        _autoCycleCount = 0;
        _autoCycleResetTime = millis();
    }
    return _autoCycleCount < _configMgr.config().autoMode.maxCyclesPerDay;
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
