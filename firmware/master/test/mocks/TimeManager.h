// ============================================================
// TimeManager — SIL mock stub
// Minimal interface for native test builds (no DS3231/NTP/solar).
// Real implementation: firmware/master/lib/TimeManager/
// ============================================================
#pragma once

#include <Arduino.h>
#include <time.h>

struct SolarTimes {
    uint8_t sunriseHour;
    uint8_t sunriseMin;
    uint8_t sunsetHour;
    uint8_t sunsetMin;
    bool    valid;
};

struct TimeStatus {
    bool       rtcPresent;
    bool       rtcValid;
    bool       ntpSynced;
    uint32_t   lastNtpSync;
    uint32_t   ntpSyncCount;
    SolarTimes solar;
};

class TimeManager {
public:
    TimeManager() : _hasTime(true) {
        _status = {true, true, true, 0, 1, {7, 30, 20, 15, true}};
        _mockTime = {0, 30, 14, 15, 7, 125, 0, 0, 0};  // 14:30 Aug 15 2025
    }

    void begin() {}
    void update() {}

    bool hasValidTime() const { return _hasTime; }
    bool getTime(struct tm& t) const { t = _mockTime; return _hasTime; }
    uint8_t  hour()   const { return _mockTime.tm_hour; }
    uint8_t  minute() const { return _mockTime.tm_min; }
    uint8_t  second() const { return _mockTime.tm_sec; }
    uint16_t year()   const { return _mockTime.tm_year + 1900; }
    uint8_t  month()  const { return _mockTime.tm_mon + 1; }
    uint8_t  day()    const { return _mockTime.tm_mday; }
    String   timeStr()     const { return String("14:30:00"); }
    String   dateStr()     const { return String("2025-08-15"); }
    String   dateTimeStr() const { return String("2025-08-15 14:30:00"); }

    const SolarTimes& solar() const { return _status.solar; }
    bool isSolarTimeFor(uint8_t /*h*/, uint8_t /*m*/, int8_t /*offsetMin*/, bool /*sunset*/) const {
        return false;  // Tests must control via setMockSolarMatch() if needed
    }

    const TimeStatus& status() const { return _status; }
    void setLocation(float /*lat*/, float /*lon*/) {}
    void syncNTP() {}
    String toJson() const { return String("{\"mock\":true}"); }

    // Test helpers
    void setMockTime(int h, int m, int mon, int day = 15) {
        _mockTime.tm_hour = h; _mockTime.tm_min = m;
        _mockTime.tm_mon = mon; _mockTime.tm_mday = day;
    }
    void setMockHasTime(bool v) { _hasTime = v; }

private:
    TimeStatus _status;
    struct tm  _mockTime;
    bool       _hasTime;
};
