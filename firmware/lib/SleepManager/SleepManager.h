// ============================================================
// SleepManager — Deep sleep ESP32 avec réveil RTC
// ============================================================

#pragma once

#include <Arduino.h>
#include <esp_sleep.h>
#include "config.h"
#include "ConfigManager.h"

class SleepManager {
public:
    SleepManager(ConfigManager& configMgr);
    
    void begin();
    void enterDeepSleep();
    bool isWakeFromSleep() const;
    esp_sleep_wakeup_cause_t wakeupCause() const;
    const char* wakeupReasonStr() const;

private:
    ConfigManager& _configMgr;
};
