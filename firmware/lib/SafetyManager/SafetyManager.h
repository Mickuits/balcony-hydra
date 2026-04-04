// ============================================================
// SafetyManager — Couche sécurité hardware indépendante
//
// POLITIQUE:
//   Auto-recovery: thermal, tank critique
//   Hard lockout (/unlock requis): overcurrent, dry-run, boot crash
//   Irréversible (physique): fusibles thermique/électrique
// ============================================================

#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include "config.h"
#include "SensorManager.h"
#include "StatusLED.h"

constexpr uint8_t PIN_SAFETY_RELAY = 18;

constexpr float    SAFETY_TEMP_WARNING      = 50.0;
constexpr float    SAFETY_TEMP_CRITICAL     = 58.0;
constexpr float    SAFETY_TEMP_RESUME       = 45.0;
constexpr uint32_t SAFETY_TEMP_STABLE_MS    = 300000;  // 5 min stable avant auto-réarm
constexpr uint8_t  SAFETY_MAX_BOOT_CRASHES  = 3;
constexpr uint32_t SAFETY_STABLE_BOOT_MS    = 60000;

enum class SafetyState : uint8_t {
    NOMINAL      = 0,
    WARNING      = 1,
    LOCKOUT_AUTO = 2,
    LOCKOUT_HARD = 3,
    SAFE_MODE    = 4
};

enum class LockoutType : uint8_t {
    NONE         = 0,
    THERMAL      = 1,  // Auto-recovery
    TANK_EMPTY   = 2,  // Auto-recovery
    OVERCURRENT  = 3,  // Hard
    DRY_RUN      = 4,  // Hard
    BOOT_CRASH   = 5   // Hard (safe mode)
};

struct SafetyStatus {
    SafetyState state;
    LockoutType lockoutType;
    bool        relayEngaged;
    bool        crashSafeMode;
    float       lastTemperature;
    uint8_t     bootCount;
    uint32_t    thermalResumeStart;
    bool        thermalResumeTracking;
    char        lockoutReason[80];
};

class SafetyManager {
public:
    SafetyManager(SensorManager& sensorMgr, StatusLED& led);
    void begin();
    void update();

    bool armPump();
    void disarmPump();

    bool isPumpArmed() const { return _status.relayEngaged; }
    bool isLockout() const;
    bool isHardLockout() const;
    bool isSafeMode() const { return _status.crashSafeMode; }
    SafetyState state() const { return _status.state; }
    LockoutType lockoutType() const { return _status.lockoutType; }
    const SafetyStatus& status() const { return _status; }

    bool remoteUnlock(const String& source);
    void physicalReset();
    void notifyPumpOvercurrent();
    void notifyPumpDryRun();
    void notifyTankRecovered();
    void markBootStable();

    typedef void (*AlertCallback)(const char* message);
    void onAlert(AlertCallback cb) { _alertCb = cb; }
    String toJson() const;

private:
    SensorManager& _sensorMgr;
    StatusLED&     _led;
    SafetyStatus   _status;
    Preferences    _prefs;
    AlertCallback  _alertCb = nullptr;
    uint32_t _lastCheck;
    bool     _tempWarningSent;

    void _checkTemperature();
    void _checkThermalAutoRecovery();
    void _checkBootCrashes();
    void _engageRelay();
    void _disengageRelay();
    void _enterLockout(LockoutType type, const char* reason);
    void _exitLockout(const char* reason);
    void _alert(const char* msg);
    void _recordBoot();
    void _updateLed();
};
