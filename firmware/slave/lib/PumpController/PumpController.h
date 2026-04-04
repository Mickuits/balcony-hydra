// ============================================================
// PumpController — Dual-zone pump control
// Zone A: Balcon (GPIO 27) | Zone B: Intérieur (GPIO 15)
// Each zone: independent moisture threshold, pump, schedule
// ============================================================

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include "config_slave.h"
#include "ConfigManager.h"
#include "SensorManager.h"

class TimeManager;
class PlantProfile;

enum class PumpState : uint8_t {
    IDLE    = 0,
    RUNNING = 1,
    BLOCKED = 2,
    ERROR   = 3
};

enum class PumpStopReason : uint8_t {
    NONE          = 0,
    DURATION_DONE = 1,
    MANUAL_STOP   = 2,
    TANK_EMPTY    = 3,
    MAX_RUNTIME   = 4,
    OVERCURRENT   = 5,
    DRY_RUN       = 6
};

struct ZoneStatus {
    PumpState      state;
    PumpStopReason lastStopReason;
    uint32_t       lastRunTimestamp;
    uint32_t       lastRunDurationS;
    uint32_t       totalCycleCount;
    float          lastCurrent_mA;
    bool           failsafeActive;
    uint8_t        avgMoisture;      // Zone-specific average
    
    // Auto mode anti-spam
    uint32_t       lastAutoWaterTime;
    uint8_t        autoCycleCount;
    uint32_t       autoCycleResetTime;
};

struct ZoneConfig {
    uint8_t  pin;
    uint8_t  sensorStart;
    uint8_t  sensorEnd;
    const char* name;
};

class PumpController {
public:
    PumpController(ConfigManager& configMgr, SensorManager& sensorMgr);
    
    void begin();
    void update();
    
    // Zone-specific commands
    bool start(uint8_t zone, uint16_t durationS = 0);
    void stop(uint8_t zone, PumpStopReason reason = PumpStopReason::MANUAL_STOP);
    void stopAll(PumpStopReason reason = PumpStopReason::MANUAL_STOP);
    void resetFailsafe(uint8_t zone);
    void resetAllFailsafes();
    
    // Legacy single-pump API (operates on both zones)
    bool start(uint16_t durationS = 0);
    void stop(PumpStopReason reason = PumpStopReason::MANUAL_STOP);
    void resetFailsafe();
    
    // Status
    const ZoneStatus& zoneStatus(uint8_t zone) const { return _zones[zone]; }
    bool isRunning(uint8_t zone) const { return _zones[zone].state == PumpState::RUNNING; }
    bool isRunning() const { return isRunning(0) || isRunning(1); }
    bool isBlocked(uint8_t zone) const { return _zones[zone].state == PumpState::BLOCKED; }
    bool isBlocked() const { return isBlocked(0) || isBlocked(1); }
    uint32_t runningForS(uint8_t zone) const;
    uint8_t zoneMoisture(uint8_t zone) const { return _zones[zone].avgMoisture; }
    
    // Auto mode
    bool shouldAutoWater(uint8_t zone) const;
    bool shouldWater(uint8_t hour, uint8_t minute, uint8_t zone) const;
    
    // Kept for compatibility
    bool shouldWater(uint8_t hour, uint8_t minute) const { return shouldWater(hour, minute, 0) || shouldWater(hour, minute, 1); }
    bool shouldAutoWater() const { return shouldAutoWater(0) || shouldAutoWater(1); }
    const ZoneStatus& status() const { return _zones[0]; }
    
    void setTimeManager(TimeManager* tm) { _timeMgr = tm; }
    void setPlantProfile(PlantProfile* pp) { _plantProfile = pp; }
    
    String toJson() const;
    
    typedef void (*SafetyCallback)(PumpStopReason reason);
    void onSafetyEvent(SafetyCallback cb) { _safetyCb = cb; }
    
    // Update zone moisture averages from sensor data
    void updateZoneMoisture();

private:
    ConfigManager&  _configMgr;
    SensorManager&  _sensorMgr;
    TimeManager*    _timeMgr = nullptr;
    PlantProfile*   _plantProfile = nullptr;
    SafetyCallback  _safetyCb = nullptr;
    
    ZoneStatus _zones[NUM_ZONES];
    uint32_t   _startTime[NUM_ZONES];
    uint16_t   _targetDuration[NUM_ZONES];
    
    static const ZoneConfig _zoneConfig[NUM_ZONES];
    
    void _pumpOn(uint8_t zone);
    void _pumpOff(uint8_t zone);
    bool _checkFailsafes(uint8_t zone);
    bool _isAutoCooldownOk(uint8_t zone) const;
    bool _isAutoMaxCyclesOk(uint8_t zone) const;
};
