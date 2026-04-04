// ============================================================
// SafetyLocal — Failsafes locaux esclave (sans relay)
//
// Protections disponibles localement (sans maître):
//   - Pull-down 10kΩ MOSFET (HW, pompe OFF si crash)
//   - Fusible 3A ligne pompe (HW)
//   - Fusible 5A batterie (HW)
//   - Fusible thermique 72°C (HW)
//   - Max runtime firmware (SW)
//   - Tank level < critical (SW)
//   - Overcurrent INA219 > 3A (SW)
//   - Dry-run INA219 < 50mA (SW)
//   - Boot crash counter (SW)
// ============================================================

#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include "../../common/config_common.h"

enum class LocalSafetyState : uint8_t {
    OK           = 0,
    WARNING      = 1,
    BLOCKED      = 2,
    SAFE_MODE    = 3
};

class SafetyLocal {
public:
    SafetyLocal();
    void begin();

    // Pre-checks before pump start
    bool canPumpRun(uint8_t tankLevelPct, float currentMA) const;

    // Runtime checks (call every second while pump running)
    bool checkRuntime(uint32_t runningSec) const;
    bool checkCurrent(float currentMA) const;  // Returns false if fault
    bool checkTank(uint8_t tankLevelPct) const;

    // Boot crash detection
    bool isSafeMode() const { return _safeMode; }
    void markBootStable();
    void resetSafeMode();

    LocalSafetyState state() const { return _state; }
    const char* blockReason() const { return _blockReason; }

private:
    LocalSafetyState _state;
    bool             _safeMode;
    char             _blockReason[48];
    uint8_t          _bootCount;

    void _checkBootCrashes();
    void _recordBoot();
};
