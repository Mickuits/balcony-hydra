// ============================================================
// SensorManager — Lecture capteurs via MUX, US, I2C
// ============================================================

#pragma once

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_BME280.h>
#include <Adafruit_INA219.h>
#include "config_master.h"
#include "ConfigManager.h"

struct MoistureReading {
    uint16_t raw;       // ADC value
    uint8_t  percent;   // 0-100%
    bool     valid;
};

struct TankReading {
    float    distanceCm;
    float    levelCm;
    uint8_t  levelPct;
    bool     valid;
};

struct EnvironmentReading {
    float temperature;  // °C
    float humidity;     // %RH
    float pressure;     // hPa
    bool  valid;
};

struct PumpMetrics {
    float voltage;      // V
    float current_mA;   // mA
    float power_mW;     // mW
    bool  valid;        // INA219 read OK
};

struct SensorData {
    MoistureReading    moisture[NUM_MOISTURE_SENSORS];
    TankReading        tank[2];
    EnvironmentReading environment;
    PumpMetrics        pump;
    uint8_t            avgMoisture;
    unsigned long      timestamp;
};

// Per-pot chronic dryness tracking
struct PotAlert {
    uint8_t  consecutiveDryReadings;  // How many times in a row this pot was below threshold
    bool     alertSent;               // Already sent Telegram alert for this pot
};

class SensorManager {
public:
    SensorManager(const ConfigManager& configMgr);
    
    void begin();
    void readAll();
    
    // Individual read functions
    void readMoisture();
    void readTankLevels();
    void readEnvironment();
    void readPumpMetrics();
    
    const SensorData& data() const { return _data; }
    
    // Quick accessors
    uint8_t avgMoisture() const { return _data.avgMoisture; }
    uint8_t tankLevel() const { return _data.tank[0].valid ? _data.tank[0].levelPct : 0; }
    bool    tankLevelsMatch() const;
    float   temperature() const { return _data.environment.temperature; }
    float   pumpCurrent() const { return _data.pump.current_mA; }
    
    // Per-pot alerts (chronic dryness despite watering)
    void updatePotAlerts(uint8_t minThreshold);
    bool   hasPotAlerts() const;
    String getPotAlertMessage() const;

    // Calibration
    void calibrateMoistureDry();
    void calibrateMoistureWet();

#ifdef HYDRA_TEST
    // Injection directe pour tests SIL natifs (non disponible en production)
    void injectTestEnvironment(const EnvironmentReading& env) { _data.environment = env; }
    void injectTestPumpMetrics(const PumpMetrics& pump) { _data.pump = pump; }
#endif

private:
    const ConfigManager& _configMgr;
    SensorData _data;
    // mutable: getPotAlertMessage() is const but flips alertSent to "already notified"
    mutable PotAlert _potAlerts[NUM_MOISTURE_SENSORS];
    
    Adafruit_BME280 _bme;
    Adafruit_INA219 _ina;
    bool _bmeOk;
    bool _inaOk;
    
    // MUX operations
    void     _selectMuxChannel(uint8_t channel);
    void     _enableMux1();
    void     _enableMux2();
    void     _disableAllMux();
    uint16_t _readAnalog(uint8_t adcPin);
    
    // Ultrasonic
    float _readUltrasonicCm(uint8_t trigPin, uint8_t echoPin);
    
    // Conversion
    uint8_t _rawToPercent(uint16_t raw) const;
};
