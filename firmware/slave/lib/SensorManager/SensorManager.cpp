// ============================================================
// SensorManager — Implementation
// ============================================================

#include "SensorManager.h"

static const uint8_t MUX_ADDR_PINS[] = { PIN_MUX_S0, PIN_MUX_S1, PIN_MUX_S2, PIN_MUX_S3 };
static const uint8_t NUM_SAMPLES = 5;  // Oversampling for noise reduction

SensorManager::SensorManager(const ConfigManager& configMgr)
    : _configMgr(configMgr), _bmeOk(false), _inaOk(false) {
    memset(&_data, 0, sizeof(SensorData));
    memset(_potAlerts, 0, sizeof(_potAlerts));
}

void SensorManager::begin() {
    // MUX address pins
    for (auto pin : MUX_ADDR_PINS) {
        pinMode(pin, OUTPUT);
        digitalWrite(pin, LOW);
    }
    
    // MUX enable pins (active LOW — start disabled)
    pinMode(PIN_MUX1_EN, OUTPUT);
    // PIN_MUX2_EN not used on slave (single MUX)
    _disableAllMux();
    
    // Ultrasonic pins
    pinMode(PIN_US1_TRIG, OUTPUT);
    pinMode(PIN_US1_ECHO, INPUT);
    pinMode(PIN_US2_TRIG, OUTPUT);
    pinMode(PIN_US2_ECHO, INPUT);
    
    // ADC resolution
    analogReadResolution(12);  // 0-4095
    analogSetAttenuation(ADC_11db);  // 0-3.3V full range
    
    // I2C
    Wire.begin(PIN_SDA, PIN_SCL);
    
    // BME280
    _bmeOk = _bme.begin(0x76, &Wire);
    if (_bmeOk) {
        _bme.setSampling(Adafruit_BME280::MODE_FORCED,
                         Adafruit_BME280::SAMPLING_X1,
                         Adafruit_BME280::SAMPLING_X1,
                         Adafruit_BME280::SAMPLING_X1,
                         Adafruit_BME280::FILTER_X4,
                         Adafruit_BME280::STANDBY_MS_1000);
        Serial.println("[SENSOR] BME280 OK (0x76)");
    } else {
        Serial.println("[SENSOR] BME280 ABSENT — environnement désactivé");
    }
    
    // INA219
    _inaOk = _ina.begin(&Wire);
    if (_inaOk) {
        _ina.setCalibration_32V_1A();
        Serial.println("[SENSOR] INA219 OK (0x40)");
    } else {
        Serial.println("[SENSOR] INA219 ABSENT — mesure courant désactivée");
    }
    
    Serial.printf("[SENSOR] Init terminé. BME:%s INA:%s\n",
                  _bmeOk ? "OK" : "KO", _inaOk ? "OK" : "KO");
}

void SensorManager::readAll() {
    readMoisture();
    readTankLevels();
    readEnvironment();
    readPumpMetrics();
    _data.timestamp = millis();
}

// ---- MOISTURE ----

void SensorManager::readMoisture() {
    const auto& mCfg = _configMgr.config().moisture;
    uint32_t totalPct = 0;
    uint8_t validCount = 0;
    
    // MUX 1: channels 0-15 (sensors 0-15)
    _enableMux1();
    for (uint8_t i = 0; i < MUX1_CHANNELS && i < NUM_MOISTURE_SENSORS; i++) {
        _selectMuxChannel(i);
        delayMicroseconds(500);  // Settling time
        
        uint16_t raw = _readAnalog(PIN_MUX1_SIG);
        _data.moisture[i].raw     = raw;
        _data.moisture[i].percent = _rawToPercent(raw);
        _data.moisture[i].valid   = (raw > 100 && raw < 4000);  // Sanity check
        
        if (_data.moisture[i].valid) {
            totalPct += _data.moisture[i].percent;
            validCount++;
        }
    }
    _disableAllMux();
    
    // MUX 2: channels 0-3 (sensors 16-19)
    if (NUM_MOISTURE_SENSORS > MUX1_CHANNELS) {
        _enableMux2();
        for (uint8_t i = 0; i < MUX2_CHANNELS; i++) {
            uint8_t sensorIdx = MUX1_CHANNELS + i;
            if (sensorIdx >= NUM_MOISTURE_SENSORS) break;
            
            _selectMuxChannel(i);
            delayMicroseconds(500);
            
            uint16_t raw = _readAnalog(PIN_MUX2_SIG);
            _data.moisture[sensorIdx].raw     = raw;
            _data.moisture[sensorIdx].percent = _rawToPercent(raw);
            _data.moisture[sensorIdx].valid   = (raw > 100 && raw < 4000);
            
            if (_data.moisture[sensorIdx].valid) {
                totalPct += _data.moisture[sensorIdx].percent;
                validCount++;
            }
        }
        _disableAllMux();
    }
    
    _data.avgMoisture = validCount > 0 ? totalPct / validCount : 0;
    
    Serial.printf("[SENSOR] Humidité: %d capteurs valides, moyenne %d%%\n",
                  validCount, _data.avgMoisture);
}

// ---- TANK LEVELS ----

void SensorManager::readTankLevels() {
    const auto& tCfg = _configMgr.config().tank;
    
    // Sensor 1 (principal — Bidon 3)
    float dist1 = _readUltrasonicCm(PIN_US1_TRIG, PIN_US1_ECHO);
    _data.tank[0].distanceCm = dist1;
    _data.tank[0].valid = (dist1 > 1.0 && dist1 < tCfg.heightCm + 10.0);
    if (_data.tank[0].valid) {
        _data.tank[0].levelCm  = tCfg.heightCm - dist1;
        if (_data.tank[0].levelCm < 0) _data.tank[0].levelCm = 0;
        _data.tank[0].levelPct = (uint8_t)constrain(
            (_data.tank[0].levelCm / tCfg.heightCm) * 100.0, 0, 100);
    }
    
    // Sensor 2 (redondance — Bidon 1)
    float dist2 = _readUltrasonicCm(PIN_US2_TRIG, PIN_US2_ECHO);
    // Slave: single US sensor for 2x25L vases communicants
    // tank[1] mirrors tank[0] (same level)
    _data.tank[1] = _data.tank[0];
    }
    
    Serial.printf("[SENSOR] Réservoir: %d%% (US1: %.1fcm, US2: %.1fcm)\n",
                  _data.tank[0].levelPct, dist1, dist2);
}

// ---- ENVIRONMENT ----

void SensorManager::readEnvironment() {
    if (!_bmeOk) {
        _data.environment.valid = false;
        return;
    }
    
    _bme.takeForcedMeasurement();
    _data.environment.temperature = _bme.readTemperature();
    _data.environment.humidity    = _bme.readHumidity();
    _data.environment.pressure    = _bme.readPressure() / 100.0;
    _data.environment.valid = !isnan(_data.environment.temperature);
    
    if (_data.environment.valid) {
        Serial.printf("[SENSOR] Environnement: %.1f°C, %.0f%%HR, %.0fhPa\n",
                      _data.environment.temperature,
                      _data.environment.humidity,
                      _data.environment.pressure);
    }
}

// ---- PUMP CURRENT ----

void SensorManager::readPumpMetrics() {
    if (!_inaOk) {
        _data.pump.valid = false;
        return;
    }
    
    _data.pump.voltage    = _ina.getBusVoltage_V();
    _data.pump.current_mA = _ina.getCurrent_mA();
    _data.pump.power_mW   = _ina.getPower_mW();
    _data.pump.valid = true;
    
    Serial.printf("[SENSOR] Pompe: %.1fV, %.0fmA, %.0fmW\n",
                  _data.pump.voltage, _data.pump.current_mA, _data.pump.power_mW);
}

// ---- MUX CONTROL ----

void SensorManager::_selectMuxChannel(uint8_t channel) {
    for (uint8_t i = 0; i < 4; i++) {
        digitalWrite(MUX_ADDR_PINS[i], (channel >> i) & 1);
    }
}

void SensorManager::_enableMux1() {
    digitalWrite(PIN_MUX1_EN, LOW);   // Active LOW
    // MUX2 not present on slave
}

void SensorManager::_enableMux2() {
    digitalWrite(PIN_MUX1_EN, HIGH);  // Disable MUX1
    digitalWrite(PIN_MUX2_EN, LOW);   // Active LOW
}

void SensorManager::_disableAllMux() {
    digitalWrite(PIN_MUX1_EN, HIGH);
    // PIN_MUX2_EN not present on slave
}

uint16_t SensorManager::_readAnalog(uint8_t adcPin) {
    uint32_t sum = 0;
    for (uint8_t i = 0; i < NUM_SAMPLES; i++) {
        sum += analogRead(adcPin);
        delayMicroseconds(100);
    }
    return sum / NUM_SAMPLES;
}

// ---- ULTRASONIC ----

float SensorManager::_readUltrasonicCm(uint8_t trigPin, uint8_t echoPin) {
    // 3 readings, take median for noise rejection
    float readings[3];
    for (uint8_t i = 0; i < 3; i++) {
        digitalWrite(trigPin, LOW);
        delayMicroseconds(2);
        digitalWrite(trigPin, HIGH);
        delayMicroseconds(10);
        digitalWrite(trigPin, LOW);
        
        unsigned long duration = pulseIn(echoPin, HIGH, 30000);  // 30ms timeout (~5m)
        readings[i] = (duration == 0) ? -1.0 : (duration * 0.0343) / 2.0;
        delay(30);
    }
    
    // Sort and return median
    for (uint8_t i = 0; i < 2; i++) {
        for (uint8_t j = i + 1; j < 3; j++) {
            if (readings[j] < readings[i]) {
                float tmp = readings[i];
                readings[i] = readings[j];
                readings[j] = tmp;
            }
        }
    }
    return readings[1];  // Median
}

// ---- CONVERSION ----

uint8_t SensorManager::_rawToPercent(uint16_t raw) const {
    const auto& m = _configMgr.config().moisture;
    if (raw >= m.airValue) return 0;
    if (raw <= m.waterValue) return 100;
    return map(raw, m.airValue, m.waterValue, 0, 100);
}

bool SensorManager::tankLevelsMatch() const {
    if (!_data.tank[0].valid || !_data.tank[1].valid) return true;  // Can't check
    return abs((int)_data.tank[0].levelPct - (int)_data.tank[1].levelPct) < 15;
}

void SensorManager::calibrateMoistureDry() {
    _enableMux1();
    _selectMuxChannel(0);
    delayMicroseconds(500);
    uint16_t val = _readAnalog(PIN_MUX1_SIG);
    _disableAllMux();
    Serial.printf("[CALIB] Air sec: ADC = %d\n", val);
}

void SensorManager::calibrateMoistureWet() {
    _enableMux1();
    _selectMuxChannel(0);
    delayMicroseconds(500);
    uint16_t val = _readAnalog(PIN_MUX1_SIG);
    _disableAllMux();
    Serial.printf("[CALIB] Immergé: ADC = %d\n", val);
}

// ---- PER-POT ALERTS ----

static const uint8_t CHRONIC_DRY_THRESHOLD = 6;  // 6 lectures consécutives = ~3 min en actif, ou 6 cycles deep sleep

void SensorManager::updatePotAlerts(uint8_t minThreshold) {
    for (uint8_t i = 0; i < NUM_MOISTURE_SENSORS; i++) {
        if (!_data.moisture[i].valid) continue;
        
        if (_data.moisture[i].percent < minThreshold) {
            _potAlerts[i].consecutiveDryReadings++;
        } else {
            _potAlerts[i].consecutiveDryReadings = 0;
            _potAlerts[i].alertSent = false;  // Reset alert when pot is OK
        }
    }
}

bool SensorManager::hasPotAlerts() const {
    for (uint8_t i = 0; i < NUM_MOISTURE_SENSORS; i++) {
        if (_potAlerts[i].consecutiveDryReadings >= CHRONIC_DRY_THRESHOLD && !_potAlerts[i].alertSent) {
            return true;
        }
    }
    return false;
}

String SensorManager::getPotAlertMessage() const {
    String msg = "⚠🌱 Pots chroniquement secs:\n";
    bool any = false;
    for (uint8_t i = 0; i < NUM_MOISTURE_SENSORS; i++) {
        if (_potAlerts[i].consecutiveDryReadings >= CHRONIC_DRY_THRESHOLD && !_potAlerts[i].alertSent) {
            msg += "  Pot #" + String(i + 1) + ": " + String(_data.moisture[i].percent) + "% ";
            msg += "(" + String(_potAlerts[i].consecutiveDryReadings) + " lectures)\n";
            _potAlerts[i].alertSent = true;  // Mark as sent
            any = true;
        }
    }
    if (!any) return "";
    msg += "→ Ajuster le goutteur ou vérifier le capteur";
    return msg;
}