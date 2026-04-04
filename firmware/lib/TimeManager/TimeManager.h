// ============================================================
// TimeManager — DS3231 RTC + NTP sync + calcul solaire
//
// Hiérarchie des sources d'heure:
//   1. DS3231 (pile CR2032, survit à tout)
//   2. NTP sync quand WiFi dispo → corrige DS3231
//   3. millis() fallback si rien ne marche
//
// Calcul solaire: algorithme NOAA simplifié
//   → lever/coucher du soleil pour Mougins le Haut (configurable)
//   → offset configurable (ex: arrosage 30 min après coucher)
// ============================================================

#pragma once

#include <Arduino.h>
#include <Wire.h>
#include <time.h>
#include "config.h"

// DS3231 I2C address
constexpr uint8_t DS3231_ADDR = 0x68;

// Location: imported from config.h (DEFAULT_LATITUDE, DEFAULT_LONGITUDE)
constexpr int8_t DEFAULT_TIMEZONE = 1;   // CET (UTC+1), CEST auto-handled by NTP

struct SolarTimes {
    uint8_t sunriseHour;
    uint8_t sunriseMin;
    uint8_t sunsetHour;
    uint8_t sunsetMin;
    bool    valid;
};

struct TimeStatus {
    bool     rtcPresent;       // DS3231 detected on I2C
    bool     rtcValid;         // DS3231 has valid time (not 2000-01-01)
    bool     ntpSynced;        // NTP sync successful at least once
    uint32_t lastNtpSync;      // millis() of last NTP sync
    uint32_t ntpSyncCount;     // Total NTP syncs since boot
    SolarTimes solar;          // Today's sunrise/sunset
};

class TimeManager {
public:
    TimeManager();
    
    void begin();
    void update();  // Call periodically — handles NTP resync + solar recalc
    
    // Current time
    bool     getTime(struct tm& timeinfo) const;
    uint8_t  hour() const;
    uint8_t  minute() const;
    uint8_t  second() const;
    uint16_t year() const;
    uint8_t  month() const;
    uint8_t  day() const;
    String   timeStr() const;   // "HH:MM:SS"
    String   dateStr() const;   // "YYYY-MM-DD"
    String   dateTimeStr() const; // "YYYY-MM-DD HH:MM:SS"
    bool     hasValidTime() const;
    
    // Solar
    const SolarTimes& solar() const { return _status.solar; }
    bool isSolarTimeFor(uint8_t h, uint8_t m, int8_t offsetMin, bool sunset) const;
    
    // Status
    const TimeStatus& status() const { return _status; }
    
    // Location (configurable for portability)
    void setLocation(float lat, float lon) { _lat = lat; _lon = lon; }
    
    // Force NTP sync
    void syncNTP();
    
    // JSON
    String toJson() const;

private:
    TimeStatus _status;
    float _lat;
    float _lon;
    int8_t _tz;
    uint32_t _lastSolarCalc;
    uint8_t  _lastSolarDay;
    
    // DS3231
    bool _ds3231Detect();
    bool _ds3231Read(struct tm& t);
    void _ds3231Write(const struct tm& t);
    uint8_t _bcd2dec(uint8_t bcd);
    uint8_t _dec2bcd(uint8_t dec);
    
    // NTP → DS3231
    void _syncRtcFromNtp();
    
    // Solar calculation (NOAA simplified)
    void _calcSolar(uint16_t year, uint8_t month, uint8_t day);
    float _calcSunAngle(float jd, float lat, float lon, bool sunrise);
};
