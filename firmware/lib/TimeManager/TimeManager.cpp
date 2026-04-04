// ============================================================
// TimeManager — Implementation
// ============================================================

#include "TimeManager.h"
#include <ArduinoJson.h>
#include <math.h>

// NTP resync interval: 6 hours
static const uint32_t NTP_RESYNC_INTERVAL_MS = 6UL * 3600UL * 1000UL;

TimeManager::TimeManager()
    : _lat(DEFAULT_LATITUDE), _lon(DEFAULT_LONGITUDE), _tz(DEFAULT_TIMEZONE),
      _lastSolarCalc(0), _lastSolarDay(0) {
    memset(&_status, 0, sizeof(TimeStatus));
}

void TimeManager::begin() {
    // 1. Detect DS3231 on I2C bus
    _status.rtcPresent = _ds3231Detect();
    if (_status.rtcPresent) {
        struct tm t;
        if (_ds3231Read(t)) {
            // Check if time is valid (not factory default 2000-01-01)
            if (t.tm_year > 120) {  // > 2020
                _status.rtcValid = true;
                // Set system time from DS3231
                time_t epoch = mktime(&t);
                struct timeval tv = { .tv_sec = epoch, .tv_usec = 0 };
                settimeofday(&tv, NULL);
                Serial.printf("[TIME] DS3231 OK: %04d-%02d-%02d %02d:%02d:%02d\n",
                              t.tm_year + 1900, t.tm_mon + 1, t.tm_mday,
                              t.tm_hour, t.tm_min, t.tm_sec);
            } else {
                Serial.println("[TIME] DS3231 présent mais heure invalide (jamais sync)");
            }
        }
    } else {
        Serial.println("[TIME] DS3231 ABSENT — dépendance NTP uniquement");
    }
    
    // 2. Configure NTP (will sync when WiFi connects)
    configTzTime("CET-1CEST,M3.5.0,M10.5.0/3", "pool.ntp.org", "time.nist.gov", "time.google.com");
    Serial.println("[TIME] NTP configuré (CET/CEST auto, 3 serveurs)");
    
    // 3. Calculate solar times if we have a valid date
    if (hasValidTime()) {
        struct tm t;
        getTime(t);
        _calcSolar(t.tm_year + 1900, t.tm_mon + 1, t.tm_mday);
    }
}

void TimeManager::update() {
    // NTP resync periodically
    if (millis() - _status.lastNtpSync > NTP_RESYNC_INTERVAL_MS || _status.ntpSyncCount == 0) {
        syncNTP();
    }
    
    // Recalculate solar times once per day
    if (hasValidTime()) {
        struct tm t;
        getTime(t);
        if (t.tm_mday != _lastSolarDay) {
            _calcSolar(t.tm_year + 1900, t.tm_mon + 1, t.tm_mday);
            _lastSolarDay = t.tm_mday;
        }
    }
}

// ---- CURRENT TIME ----

bool TimeManager::getTime(struct tm& timeinfo) const {
    return getLocalTime(&timeinfo, 100);
}

uint8_t TimeManager::hour() const {
    struct tm t; return getTime(t) ? t.tm_hour : 0;
}

uint8_t TimeManager::minute() const {
    struct tm t; return getTime(t) ? t.tm_min : 0;
}

uint8_t TimeManager::second() const {
    struct tm t; return getTime(t) ? t.tm_sec : 0;
}

uint16_t TimeManager::year() const {
    struct tm t; return getTime(t) ? t.tm_year + 1900 : 0;
}

uint8_t TimeManager::month() const {
    struct tm t; return getTime(t) ? t.tm_mon + 1 : 0;
}

uint8_t TimeManager::day() const {
    struct tm t; return getTime(t) ? t.tm_mday : 0;
}

String TimeManager::timeStr() const {
    struct tm t;
    if (!getTime(t)) return "??:??:??";
    char buf[9];
    snprintf(buf, sizeof(buf), "%02d:%02d:%02d", t.tm_hour, t.tm_min, t.tm_sec);
    return String(buf);
}

String TimeManager::dateStr() const {
    struct tm t;
    if (!getTime(t)) return "????-??-??";
    char buf[11];
    snprintf(buf, sizeof(buf), "%04d-%02d-%02d", t.tm_year + 1900, t.tm_mon + 1, t.tm_mday);
    return String(buf);
}

String TimeManager::dateTimeStr() const {
    return dateStr() + " " + timeStr();
}

bool TimeManager::hasValidTime() const {
    struct tm t;
    if (!getLocalTime(&t, 100)) return false;
    return t.tm_year > 120;  // > 2020
}

// ---- SOLAR ----

bool TimeManager::isSolarTimeFor(uint8_t h, uint8_t m, int8_t offsetMin, bool sunset) const {
    if (!_status.solar.valid) return false;
    
    uint8_t targetH = sunset ? _status.solar.sunsetHour : _status.solar.sunriseHour;
    uint8_t targetM = sunset ? _status.solar.sunsetMin : _status.solar.sunriseMin;
    
    // Apply offset
    int totalMin = targetH * 60 + targetM + offsetMin;
    if (totalMin < 0) totalMin += 1440;
    if (totalMin >= 1440) totalMin -= 1440;
    
    uint8_t triggerH = totalMin / 60;
    uint8_t triggerM = totalMin % 60;
    
    return (h == triggerH && m == triggerM);
}

// ---- NTP SYNC ----

void TimeManager::syncNTP() {
    struct tm t;
    if (getLocalTime(&t, 5000)) {
        if (t.tm_year > 120) {
            _status.ntpSynced = true;
            _status.lastNtpSync = millis();
            _status.ntpSyncCount++;
            
            // Write NTP time to DS3231
            if (_status.rtcPresent) {
                _ds3231Write(t);
                _status.rtcValid = true;
                Serial.printf("[TIME] NTP → DS3231 sync OK: %s\n", dateTimeStr().c_str());
            } else {
                Serial.printf("[TIME] NTP sync OK: %s (pas de DS3231)\n", dateTimeStr().c_str());
            }
        }
    }
}

// ---- DS3231 I2C DRIVER ----

bool TimeManager::_ds3231Detect() {
    Wire.beginTransmission(DS3231_ADDR);
    return Wire.endTransmission() == 0;
}

bool TimeManager::_ds3231Read(struct tm& t) {
    Wire.beginTransmission(DS3231_ADDR);
    Wire.write(0x00);  // Start at register 0
    if (Wire.endTransmission() != 0) return false;
    
    Wire.requestFrom((uint8_t)DS3231_ADDR, (uint8_t)7);
    if (Wire.available() < 7) return false;
    
    t.tm_sec  = _bcd2dec(Wire.read() & 0x7F);
    t.tm_min  = _bcd2dec(Wire.read());
    t.tm_hour = _bcd2dec(Wire.read() & 0x3F);  // 24h format
    Wire.read();  // Day of week (skip)
    t.tm_mday = _bcd2dec(Wire.read());
    uint8_t raw_month = Wire.read();
    t.tm_mon  = _bcd2dec(raw_month & 0x1F) - 1;  // tm_mon is 0-based
    uint8_t raw_year = Wire.read();
    t.tm_year = _bcd2dec(raw_year) + 100;  // tm_year is years since 1900
    if (raw_month & 0x80) t.tm_year += 100;  // Century bit
    
    return true;
}

void TimeManager::_ds3231Write(const struct tm& t) {
    Wire.beginTransmission(DS3231_ADDR);
    Wire.write(0x00);
    Wire.write(_dec2bcd(t.tm_sec));
    Wire.write(_dec2bcd(t.tm_min));
    Wire.write(_dec2bcd(t.tm_hour));
    Wire.write(_dec2bcd(t.tm_wday + 1));  // DS3231 weekday 1-7
    Wire.write(_dec2bcd(t.tm_mday));
    Wire.write(_dec2bcd(t.tm_mon + 1));   // DS3231 month 1-12
    Wire.write(_dec2bcd(t.tm_year % 100));
    Wire.endTransmission();
}

uint8_t TimeManager::_bcd2dec(uint8_t bcd) {
    return (bcd >> 4) * 10 + (bcd & 0x0F);
}

uint8_t TimeManager::_dec2bcd(uint8_t dec) {
    return ((dec / 10) << 4) | (dec % 10);
}

// ---- SOLAR CALCULATION (NOAA SIMPLIFIED) ----
// Reference: https://gml.noaa.gov/grad/solcalc/solareqns.PDF

void TimeManager::_calcSolar(uint16_t yr, uint8_t mo, uint8_t dy) {
    // Julian day number
    int a = (14 - mo) / 12;
    int y = yr + 4800 - a;
    int m = mo + 12 * a - 3;
    float jd = dy + (153 * m + 2) / 5 + 365 * y + y / 4 - y / 100 + y / 400 - 32045;
    
    // Julian century
    float jc = (jd - 2451545.0) / 36525.0;
    
    // Solar geometry
    float geomMeanLongSun = fmod(280.46646 + jc * (36000.76983 + 0.0003032 * jc), 360.0);
    float geomMeanAnomSun = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
    float eccentEarthOrbit = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
    
    float sunEqOfCtr = sin(radians(geomMeanAnomSun)) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
                     + sin(radians(2.0 * geomMeanAnomSun)) * (0.019993 - 0.000101 * jc)
                     + sin(radians(3.0 * geomMeanAnomSun)) * 0.000289;
    
    float sunTrueLong = geomMeanLongSun + sunEqOfCtr;
    float sunAppLong = sunTrueLong - 0.00569 - 0.00478 * sin(radians(125.04 - 1934.136 * jc));
    
    float meanObliqEcliptic = 23.0 + (26.0 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60.0) / 60.0;
    float obliqCorr = meanObliqEcliptic + 0.00256 * cos(radians(125.04 - 1934.136 * jc));
    
    float sunDeclin = degrees(asin(sin(radians(obliqCorr)) * sin(radians(sunAppLong))));
    
    float varY = tan(radians(obliqCorr / 2.0)) * tan(radians(obliqCorr / 2.0));
    float eqOfTime = 4.0 * degrees(
        varY * sin(2.0 * radians(geomMeanLongSun))
        - 2.0 * eccentEarthOrbit * sin(radians(geomMeanAnomSun))
        + 4.0 * eccentEarthOrbit * varY * sin(radians(geomMeanAnomSun)) * cos(2.0 * radians(geomMeanLongSun))
        - 0.5 * varY * varY * sin(4.0 * radians(geomMeanLongSun))
        - 1.25 * eccentEarthOrbit * eccentEarthOrbit * sin(2.0 * radians(geomMeanAnomSun))
    );
    
    // Hour angle at sunrise/sunset (zenith = 90.833°)
    float zenith = 90.833;
    float haArg = cos(radians(zenith)) / (cos(radians(_lat)) * cos(radians(sunDeclin)))
                - tan(radians(_lat)) * tan(radians(sunDeclin));
    
    // Check for polar day/night
    if (haArg > 1.0 || haArg < -1.0) {
        _status.solar.valid = false;
        Serial.println("[TIME] Calcul solaire impossible (jour/nuit polaire)");
        return;
    }
    
    float haSunrise = degrees(acos(haArg));
    
    // Solar noon (minutes from midnight UTC)
    float solarNoon = (720.0 - 4.0 * _lon - eqOfTime) / 60.0;  // hours UTC
    
    // Sunrise/sunset in hours UTC
    float sunriseUTC = solarNoon - haSunrise / 15.0;
    float sunsetUTC  = solarNoon + haSunrise / 15.0;
    
    // Apply timezone
    float sunriseLocal = sunriseUTC + _tz;
    float sunsetLocal  = sunsetUTC + _tz;
    
    // Check if DST (rough: March last Sunday to October last Sunday)
    // Simplified: if month 4-9 → DST (+1h)
    if (mo >= 4 && mo <= 9) {
        sunriseLocal += 1.0;
        sunsetLocal += 1.0;
    }
    
    // Clamp to 0-24
    if (sunriseLocal < 0) sunriseLocal += 24.0;
    if (sunsetLocal < 0) sunsetLocal += 24.0;
    if (sunriseLocal >= 24) sunriseLocal -= 24.0;
    if (sunsetLocal >= 24) sunsetLocal -= 24.0;
    
    _status.solar.sunriseHour = (uint8_t)sunriseLocal;
    _status.solar.sunriseMin  = (uint8_t)((sunriseLocal - (float)_status.solar.sunriseHour) * 60.0);
    _status.solar.sunsetHour  = (uint8_t)sunsetLocal;
    _status.solar.sunsetMin   = (uint8_t)((sunsetLocal - (float)_status.solar.sunsetHour) * 60.0);
    _status.solar.valid = true;
    
    Serial.printf("[TIME] Solaire %04d-%02d-%02d: lever %02d:%02d, coucher %02d:%02d (Mougins le Haut)\n",
                  yr, mo, dy,
                  _status.solar.sunriseHour, _status.solar.sunriseMin,
                  _status.solar.sunsetHour, _status.solar.sunsetMin);
}

String TimeManager::toJson() const {
    JsonDocument doc;
    
    doc["dateTime"] = dateTimeStr();
    doc["hasValidTime"] = hasValidTime();
    
    JsonObject rtc = doc["rtc"].to<JsonObject>();
    rtc["present"] = _status.rtcPresent;
    rtc["valid"]   = _status.rtcValid;
    
    JsonObject ntp = doc["ntp"].to<JsonObject>();
    ntp["synced"]    = _status.ntpSynced;
    ntp["syncCount"] = _status.ntpSyncCount;
    ntp["lastSyncAgo"] = _status.lastNtpSync > 0 ? (millis() - _status.lastNtpSync) / 1000 : -1;
    
    JsonObject sol = doc["solar"].to<JsonObject>();
    sol["valid"] = _status.solar.valid;
    if (_status.solar.valid) {
        char buf[6];
        snprintf(buf, sizeof(buf), "%02d:%02d", _status.solar.sunriseHour, _status.solar.sunriseMin);
        sol["sunrise"] = String(buf);
        snprintf(buf, sizeof(buf), "%02d:%02d", _status.solar.sunsetHour, _status.solar.sunsetMin);
        sol["sunset"] = String(buf);
    }
    sol["latitude"]  = _lat;
    sol["longitude"] = _lon;
    
    String out;
    serializeJson(doc, out);
    return out;
}
