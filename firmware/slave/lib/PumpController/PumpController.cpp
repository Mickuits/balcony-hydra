// ============================================================
// PumpController — Dual-zone Implementation
// ============================================================

#include "PumpController.h"
// TimeManager absent sur l'esclave — le timing est piloté par le maître via ESP-NOW.
// PlantProfile absent sur l'esclave — pas de calcul de cycle botanique local.

const ZoneConfig PumpController::_zoneConfig[NUM_ZONES] = {
    { PIN_PUMP_A, ZONE_A_SENSORS_START, ZONE_A_SENSORS_END, "Balcon" },
    { 0xFF, 0, 0, "N/A" }  // Zone B not on slave
};

PumpController::PumpController(ConfigManager& configMgr, SensorManager& sensorMgr)
    : _configMgr(configMgr), _sensorMgr(sensorMgr) {
    memset(_zones, 0, sizeof(_zones));
    memset(_startTime, 0, sizeof(_startTime));
    memset(_targetDuration, 0, sizeof(_targetDuration));
    for (uint8_t z = 0; z < NUM_ZONES; z++) {
        _zones[z].state = PumpState::IDLE;
    }
}

void PumpController::begin() {
    for (uint8_t z = 0; z < NUM_ZONES; z++) {
        pinMode(_zoneConfig[z].pin, OUTPUT);
        _pumpOff(z);
        Serial.printf("[PUMP] Zone %s (GPIO %d) initialisée.\n",
                      _zoneConfig[z].name, _zoneConfig[z].pin);
    }
}

void PumpController::update() {
    for (uint8_t z = 0; z < NUM_ZONES; z++) {
        if (_zones[z].state != PumpState::RUNNING) continue;
        
        uint32_t elapsed = runningForS(z);
        if (elapsed >= _targetDuration[z]) {
            stop(z, PumpStopReason::DURATION_DONE);
            continue;
        }
        _checkFailsafes(z);
    }
}

void PumpController::updateZoneMoisture() {
    const auto& data = _sensorMgr.data();
    for (uint8_t z = 0; z < NUM_ZONES; z++) {
        uint32_t total = 0;
        uint8_t count = 0;
        for (uint8_t i = _zoneConfig[z].sensorStart; i <= _zoneConfig[z].sensorEnd; i++) {
            if (i < NUM_MOISTURE_SENSORS && data.moisture[i].valid) {
                total += data.moisture[i].percent;
                count++;
            }
        }
        _zones[z].avgMoisture = count > 0 ? total / count : 0;
    }
}

// ---- ZONE-SPECIFIC COMMANDS ----

bool PumpController::start(uint8_t zone, uint16_t durationS) {
    if (zone >= NUM_ZONES) return false;
    if (_zones[zone].failsafeActive) {
        Serial.printf("[PUMP] %s: BLOQUÉE — failsafe actif.\n", _zoneConfig[zone].name);
        return false;
    }
    
    // Tank check via sensor closest to this zone
    uint8_t tankIdx = (zone == 0) ? 0 : 1;
    if (_sensorMgr.data().tank[tankIdx].valid &&
        _configMgr.isTankCritical(_sensorMgr.data().tank[tankIdx].levelPct)) {
        Serial.printf("[PUMP] %s: REFUSÉ — réservoir critique!\n", _zoneConfig[zone].name);
        _zones[zone].state = PumpState::BLOCKED;
        _zones[zone].failsafeActive = true;
        _zones[zone].lastStopReason = PumpStopReason::TANK_EMPTY;
        return false;
    }
    
    // Duration: from master command or config default (no PlantProfile on slave)
    if (durationS > 0) {
        _targetDuration[zone] = durationS;
    } else {
        _targetDuration[zone] = _configMgr.config().pumpDurationS;
    }
    if (_targetDuration[zone] > PUMP_MAX_RUNTIME_S) {
        _targetDuration[zone] = PUMP_MAX_RUNTIME_S;
    }
    
    _pumpOn(zone);
    _startTime[zone] = millis();
    _zones[zone].state = PumpState::RUNNING;
    _zones[zone].totalCycleCount++;
    
    Serial.printf("[PUMP] %s: DÉMARRAGE — %ds, cycle #%d\n",
                  _zoneConfig[zone].name, _targetDuration[zone], _zones[zone].totalCycleCount);
    return true;
}

void PumpController::stop(uint8_t zone, PumpStopReason reason) {
    if (zone >= NUM_ZONES) return;
    _pumpOff(zone);
    
    _zones[zone].lastRunDurationS = runningForS(zone);
    _zones[zone].lastRunTimestamp = millis();
    _zones[zone].lastStopReason = reason;
    
    if (reason == PumpStopReason::TANK_EMPTY || 
        reason == PumpStopReason::OVERCURRENT ||
        reason == PumpStopReason::DRY_RUN) {
        _zones[zone].state = PumpState::BLOCKED;
        _zones[zone].failsafeActive = true;
    } else {
        _zones[zone].state = PumpState::IDLE;
    }
    
    const char* reasons[] = {"NONE","DURÉE OK","STOP MANUEL","RÉSERVOIR VIDE",
                              "MAX RUNTIME","SURINTENSITÉ","MARCHE À SEC"};
    Serial.printf("[PUMP] %s: ARRÊT — %s, %ds\n",
                  _zoneConfig[zone].name, reasons[static_cast<uint8_t>(reason)],
                  _zones[zone].lastRunDurationS);
}

void PumpController::stopAll(PumpStopReason reason) {
    for (uint8_t z = 0; z < NUM_ZONES; z++) stop(z, reason);
}

void PumpController::resetFailsafe(uint8_t zone) {
    if (zone >= NUM_ZONES) return;
    _zones[zone].failsafeActive = false;
    _zones[zone].state = PumpState::IDLE;
    Serial.printf("[PUMP] %s: failsafe réinitialisé.\n", _zoneConfig[zone].name);
}

void PumpController::resetAllFailsafes() {
    for (uint8_t z = 0; z < NUM_ZONES; z++) resetFailsafe(z);
}

// ---- LEGACY SINGLE-PUMP API ----

bool PumpController::start(uint16_t durationS) {
    bool ok = false;
    for (uint8_t z = 0; z < NUM_ZONES; z++) ok |= start(z, durationS);
    return ok;
}

void PumpController::stop(PumpStopReason reason) { stopAll(reason); }
void PumpController::resetFailsafe() { resetAllFailsafes(); }

uint32_t PumpController::runningForS(uint8_t zone) const {
    if (zone >= NUM_ZONES || _zones[zone].state != PumpState::RUNNING) return 0;
    return (millis() - _startTime[zone]) / 1000;
}

// ---- AUTO MODE ----

bool PumpController::shouldAutoWater(uint8_t zone) const {
    if (zone >= NUM_ZONES) return false;
    if (_configMgr.config().mode != WateringMode::AUTOMATIC) return false;
    if (_zones[zone].state != PumpState::IDLE) return false;
    if (_zones[zone].failsafeActive) return false;
    
    uint8_t moisture = _zones[zone].avgMoisture;
    
    if (moisture >= _configMgr.config().moisture.maxThreshold) return false;
    if (moisture >= _configMgr.config().moisture.minThreshold) return false;
    
    if (!_isAutoCooldownOk(zone)) {
        Serial.printf("[PUMP] %s AUTO: hum %d%% < seuil mais cooldown actif\n",
                      _zoneConfig[zone].name, moisture);
        return false;
    }
    if (!_isAutoMaxCyclesOk(zone)) {
        Serial.printf("[PUMP] %s AUTO: hum %d%% < seuil mais max cycles (%d/%d)\n",
                      _zoneConfig[zone].name, moisture,
                      _zones[zone].autoCycleCount, _configMgr.config().autoMode.maxCyclesPerDay);
        return false;
    }
    
    Serial.printf("[PUMP] %s AUTO: hum %d%% < seuil %d%% → arrosage\n",
                  _zoneConfig[zone].name, moisture, _configMgr.config().moisture.minThreshold);
    
    _zones[zone].lastAutoWaterTime = millis();
    _zones[zone].autoCycleCount++;
    return true;
}

bool PumpController::shouldWater(uint8_t hour, uint8_t minute, uint8_t zone) const {
    if (zone >= NUM_ZONES) return false;
    const auto& cfg = _configMgr.config();
    
    switch (cfg.mode) {
        case WateringMode::AUTOMATIC:
            return false;  // AUTO = moisture-driven, not schedule
            
        case WateringMode::SCHEDULED:
            return _configMgr.isWateringTime(hour, minute);
            
        case WateringMode::SOLAR:
            // Mode SOLAR non supporté sur l'esclave — le maître calcule les créneaux
            // solaires (DS3231 + algo NOAA) et envoie CMD_PUMP_START au bon moment.
            return false;
            
        case WateringMode::MANUAL:
            return false;
    }
    return false;
}

// ---- ANTI-SPAM ----

bool PumpController::_isAutoCooldownOk(uint8_t zone) const {
    if (_zones[zone].lastAutoWaterTime == 0) return true;
    uint32_t elapsed = (millis() - _zones[zone].lastAutoWaterTime) / 1000;
    return elapsed >= _configMgr.config().autoMode.cooldownS;
}

bool PumpController::_isAutoMaxCyclesOk(uint8_t zone) const {
    if (millis() - _zones[zone].autoCycleResetTime > AUTO_CYCLE_RESET_INTERVAL * 1000UL) {
        _zones[zone].autoCycleCount = 0;
        _zones[zone].autoCycleResetTime = millis();
    }
    return _zones[zone].autoCycleCount < _configMgr.config().autoMode.maxCyclesPerDay;
}

// ---- HARDWARE ----

void PumpController::_pumpOn(uint8_t zone) {
    digitalWrite(_zoneConfig[zone].pin, HIGH);
}

void PumpController::_pumpOff(uint8_t zone) {
    digitalWrite(_zoneConfig[zone].pin, LOW);
}

bool PumpController::_checkFailsafes(uint8_t zone) {
    // Max runtime
    if (runningForS(zone) >= PUMP_MAX_RUNTIME_S) {
        stop(zone, PumpStopReason::MAX_RUNTIME);
        Serial.printf("[PUMP] %s: ⚠ FAILSAFE max runtime!\n", _zoneConfig[zone].name);
        return false;
    }
    
    // Tank level
    uint8_t tankIdx = (zone == 0) ? 0 : 1;
    _sensorMgr.readTankLevels();
    if (_sensorMgr.data().tank[tankIdx].valid &&
        _configMgr.isTankCritical(_sensorMgr.data().tank[tankIdx].levelPct)) {
        stop(zone, PumpStopReason::TANK_EMPTY);
        Serial.printf("[PUMP] %s: ⚠ FAILSAFE réservoir critique!\n", _zoneConfig[zone].name);
        return false;
    }
    
    // Current anomaly (INA219 measures total, applicable mainly to active zone)
    _sensorMgr.readPumpMetrics();
    float current = _sensorMgr.pumpCurrent();
    _zones[zone].lastCurrent_mA = current;
    
    if (_sensorMgr.data().pump.valid) {
        if (current < 50.0 && runningForS(zone) > 3) {
            stop(zone, PumpStopReason::DRY_RUN);
            if (_safetyCb) _safetyCb(PumpStopReason::DRY_RUN);
            return false;
        }
        if (current > 3000.0) {
            stop(zone, PumpStopReason::OVERCURRENT);
            if (_safetyCb) _safetyCb(PumpStopReason::OVERCURRENT);
            return false;
        }
    }
    
    return true;
}

// ---- JSON ----

String PumpController::toJson() const {
    JsonDocument doc;
    const char* zoneNames[] = { "balcon", "interieur" };
    
    for (uint8_t z = 0; z < NUM_ZONES; z++) {
        JsonObject zObj = doc[zoneNames[z]].to<JsonObject>();
        zObj["state"] = static_cast<uint8_t>(_zones[z].state);
        zObj["stateLabel"] = (_zones[z].state == PumpState::IDLE) ? "Arrêt" :
                             (_zones[z].state == PumpState::RUNNING) ? "En marche" :
                             (_zones[z].state == PumpState::BLOCKED) ? "Bloquée" : "Erreur";
        zObj["running"] = isRunning(z);
        zObj["runningForS"] = runningForS(z);
        zObj["avgMoisture"] = _zones[z].avgMoisture;
        zObj["totalCycles"] = _zones[z].totalCycleCount;
        zObj["lastCurrent"] = _zones[z].lastCurrent_mA;
        zObj["failsafe"] = _zones[z].failsafeActive;
        zObj["lastStopReason"] = static_cast<uint8_t>(_zones[z].lastStopReason);
    }
    
    String out;
    serializeJson(doc, out);
    return out;
}
