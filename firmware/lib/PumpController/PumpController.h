// ============================================================
// PumpController — Logique pompe, failsafes, scheduling
// ============================================================

#pragma once

#include <Arduino.h>
#include "config.h"
#include "ConfigManager.h"
#include "SensorManager.h"

enum class PumpState : uint8_t {
    IDLE       = 0,
    RUNNING    = 1,
    BLOCKED    = 2,  // Failsafe triggered
    ERROR      = 3
};

enum class PumpStopReason : uint8_t {
    NONE            = 0,
    DURATION_DONE   = 1,
    MANUAL_STOP     = 2,
    TANK_EMPTY      = 3,
    MAX_RUNTIME     = 4,
    OVERCURRENT     = 5,
    DRY_RUN         = 6
};

struct PumpStatus {
    PumpState      state;
    PumpStopReason lastStopReason;
    uint32_t       lastRunTimestamp;
    uint32_t       lastRunDurationS;
    uint32_t       totalCycleCount;
    float          lastCurrent_mA;
    bool           failsafeActive;
};

class PumpController {
public:
    PumpController(ConfigManager& configMgr, SensorManager& sensorMgr);
    
    void begin();
    void update();
    
    bool start(uint16_t durationS = 0);
    void stop(PumpStopReason reason = PumpStopReason::MANUAL_STOP);
    void resetFailsafe();
    
    PumpState      state() const { return _status.state; }
    const PumpStatus& status() const { return _status; }
    bool           isRunning() const { return _status.state == PumpState::RUNNING; }
    bool           isBlocked() const { return _status.state == PumpState::BLOCKED; }
    uint32_t       runningForS() const;
    
    bool shouldWater(uint8_t hour, uint8_t minute) const;
    
    String toJson() const;
    
    // Safety callback — called when overcurrent or dry-run detected
    typedef void (*SafetyCallback)(PumpStopReason reason);
    void onSafetyEvent(SafetyCallback cb) { _safetyCb = cb; }

private:
    ConfigManager&  _configMgr;
    SensorManager&  _sensorMgr;
    PumpStatus      _status;
    SafetyCallback  _safetyCb = nullptr;
    
    uint32_t _startTime;
    uint16_t _targetDuration;
    
    void _pumpOn();
    void _pumpOff();
    bool _checkFailsafes();
};
