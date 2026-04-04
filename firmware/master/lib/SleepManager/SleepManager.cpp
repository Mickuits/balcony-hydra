// ============================================================
// SleepManager — Implementation
// ============================================================

#include "SleepManager.h"

SleepManager::SleepManager(ConfigManager& configMgr) : _configMgr(configMgr) {}

void SleepManager::begin() {
    if (isWakeFromSleep()) {
        Serial.printf("[SLEEP] Réveil depuis deep sleep. Cause: %s\n", wakeupReasonStr());
    }
}

void SleepManager::enterDeepSleep() {
    uint32_t sleepS = _configMgr.config().sleepIntervalS;
    
    Serial.printf("[SLEEP] Entrée deep sleep pour %d secondes (%dh%dm)\n",
                  sleepS, sleepS / 3600, (sleepS % 3600) / 60);
    Serial.flush();
    
    // Disable WiFi and BT before sleep
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
    btStop();
    
    // Configure timer wakeup
    esp_sleep_enable_timer_wakeup((uint64_t)sleepS * 1000000ULL);
    
    // Ensure pump is OFF
    digitalWrite(PIN_PUMP, LOW);
    
    delay(100);
    esp_deep_sleep_start();
}

bool SleepManager::isWakeFromSleep() const {
    return esp_sleep_get_wakeup_cause() != ESP_SLEEP_WAKEUP_UNDEFINED;
}

esp_sleep_wakeup_cause_t SleepManager::wakeupCause() const {
    return esp_sleep_get_wakeup_cause();
}

const char* SleepManager::wakeupReasonStr() const {
    switch (esp_sleep_get_wakeup_cause()) {
        case ESP_SLEEP_WAKEUP_TIMER:     return "Timer RTC";
        case ESP_SLEEP_WAKEUP_EXT0:      return "Ext0 (GPIO)";
        case ESP_SLEEP_WAKEUP_EXT1:      return "Ext1 (GPIO)";
        case ESP_SLEEP_WAKEUP_TOUCHPAD:  return "Touchpad";
        case ESP_SLEEP_WAKEUP_ULP:       return "ULP";
        default:                         return "Premier boot";
    }
}
