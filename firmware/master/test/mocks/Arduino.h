// ============================================================
// Arduino.h Mock — Pour tests natifs PC (pio test -e native)
// Simule les fonctions Arduino essentielles sans hardware
// ============================================================

#pragma once

#include <cstdint>
#include <cstring>
#include <cstdio>
#include <cmath>
#include <cstdlib>
#include <string>
#include <algorithm>

// ---- Arduino types ----
typedef uint8_t byte;
typedef bool boolean;

// ---- Pin modes ----
#define INPUT         0
#define OUTPUT        1
#define INPUT_PULLUP  2
#define HIGH          1
#define LOW           0
#define FALLING       2

// ---- Mock GPIO state ----
namespace MockHW {
    static uint8_t pinModes[40] = {};
    static uint8_t pinStates[40] = {};
    static uint16_t adcValues[40] = {};
    static uint32_t _millis = 0;
    static bool _serialEnabled = false;

    inline void reset() {
        memset(pinModes, 0, sizeof(pinModes));
        memset(pinStates, 0, sizeof(pinStates));
        memset(adcValues, 0, sizeof(adcValues));
        _millis = 0;
    }

    inline void advanceMillis(uint32_t ms) { _millis += ms; }
    inline void setMillis(uint32_t ms) { _millis = ms; }
    inline void setADC(uint8_t pin, uint16_t value) { adcValues[pin] = value; }
}

// ---- Arduino functions ----
inline void pinMode(uint8_t pin, uint8_t mode) {
    if (pin < 40) MockHW::pinModes[pin] = mode;
}

inline void digitalWrite(uint8_t pin, uint8_t val) {
    if (pin < 40) MockHW::pinStates[pin] = val;
}

inline uint8_t digitalRead(uint8_t pin) {
    return (pin < 40) ? MockHW::pinStates[pin] : 0;
}

inline uint16_t analogRead(uint8_t pin) {
    return (pin < 40) ? MockHW::adcValues[pin] : 0;
}

inline uint32_t millis() { return MockHW::_millis; }
inline uint32_t micros() { return MockHW::_millis * 1000; }
inline void delay(uint32_t ms) { MockHW::_millis += ms; }
inline void delayMicroseconds(uint32_t us) { MockHW::_millis += us / 1000; }
inline void yield() {}

// ---- Math ----
#ifndef constrain
#define constrain(amt, low, high) ((amt) < (low) ? (low) : ((amt) > (high) ? (high) : (amt)))
#endif
#ifndef map
inline long map(long x, long in_min, long in_max, long out_min, long out_max) {
    return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}
#endif
#ifndef radians
#define radians(deg) ((deg) * M_PI / 180.0)
#endif

// ---- Interrupts ----
inline void attachInterrupt(uint8_t, void(*)(), int) {}
inline uint8_t digitalPinToInterrupt(uint8_t pin) { return pin; }

// ---- LEDC (PWM) ----
inline void ledcSetup(uint8_t, uint32_t, uint8_t) {}
inline void ledcAttachPin(uint8_t, uint8_t) {}
inline void ledcWrite(uint8_t, uint32_t) {}

// ---- Watchdog ----
namespace esp_task_wdt {
    inline void init(uint32_t, bool) {}
    inline void add(void*) {}
    inline void reset() {}
}
#define esp_task_wdt_init(t, p) esp_task_wdt::init(t, p)
#define esp_task_wdt_add(h) esp_task_wdt::add(h)
#define esp_task_wdt_reset() esp_task_wdt::reset()

// ---- String class (simplified) ----
class String {
public:
    std::string _s;
    String() {}
    String(const char* s) : _s(s ? s : "") {}
    String(const std::string& s) : _s(s) {}
    String(int val) : _s(std::to_string(val)) {}
    String(float val, int dec = 2) {
        char buf[32];
        snprintf(buf, sizeof(buf), "%.*f", dec, val);
        _s = buf;
    }
    String(uint32_t val) : _s(std::to_string(val)) {}

    const char* c_str() const { return _s.c_str(); }
    size_t length() const { return _s.length(); }
    bool isEmpty() const { return _s.empty(); }

    String& operator+=(const String& rhs) { _s += rhs._s; return *this; }
    String& operator+=(const char* rhs) { if(rhs) _s += rhs; return *this; }
    String operator+(const String& rhs) const { return String((_s + rhs._s).c_str()); }
    String operator+(const char* rhs) const { return String((_s + (rhs?rhs:"")).c_str()); }
    bool operator==(const char* rhs) const { return _s == (rhs?rhs:""); }
    bool operator==(const String& rhs) const { return _s == rhs._s; }
    bool operator!=(const char* rhs) const { return _s != (rhs?rhs:""); }

    String substring(int from, int to = -1) const {
        if (to < 0) return String(_s.substr(from).c_str());
        return String(_s.substr(from, to - from).c_str());
    }
    bool startsWith(const char* prefix) const {
        return _s.substr(0, strlen(prefix)) == prefix;
    }
    int toInt() const { return atoi(_s.c_str()); }
    float toFloat() const { return atof(_s.c_str()); }
    void trim() {
        auto start = _s.find_first_not_of(" \t\r\n");
        auto end = _s.find_last_not_of(" \t\r\n");
        if (start == std::string::npos) _s = "";
        else _s = _s.substr(start, end - start + 1);
    }
    void toLowerCase() {
        for (auto& c : _s) c = tolower(c);
    }
};

inline String operator+(const char* lhs, const String& rhs) {
    return String((std::string(lhs?lhs:"") + rhs._s).c_str());
}

// ---- Serial mock ----
class SerialMock {
public:
    void begin(unsigned long) { MockHW::_serialEnabled = true; }
    void println(const char* s = "") { if (MockHW::_serialEnabled) printf("%s\n", s); }
    void println(const String& s) { println(s.c_str()); }
    void printf(const char* fmt, ...) {
        if (!MockHW::_serialEnabled) return;
        va_list args;
        va_start(args, fmt);
        vprintf(fmt, args);
        va_end(args);
    }
    void print(const char* s) { if (MockHW::_serialEnabled) printf("%s", s); }
};

static SerialMock Serial;

// ---- Preferences mock (NVS) ----
class Preferences {
public:
    void begin(const char*, bool = false) {}
    void end() {}
    void clear() {}
    bool isKey(const char*) { return false; }
    uint8_t getUChar(const char*, uint8_t def = 0) { return def; }
    uint16_t getUShort(const char*, uint16_t def = 0) { return def; }
    uint32_t getULong(const char*, uint32_t def = 0) { return def; }
    float getFloat(const char*, float def = 0) { return def; }
    bool getBool(const char*, bool def = false) { return def; }
    size_t getBytes(const char*, void*, size_t) { return 0; }
    void putUChar(const char*, uint8_t) {}
    void putUShort(const char*, uint16_t) {}
    void putULong(const char*, uint32_t) {}
    void putFloat(const char*, float) {}
    void putBool(const char*, bool) {}
    void putBytes(const char*, const void*, size_t) {}
};

// ---- WiFi mock ----
class WiFiMock {
public:
    int8_t RSSI() { return -55; }
};
static WiFiMock WiFi;

// ---- ESP restart mock ----
namespace ESP_mock {
    static bool restarted = false;
    inline void restart() { restarted = true; }
}
#define ESP ESP_mock

// ---- getLocalTime mock ----
inline bool getLocalTime(struct tm* info, uint32_t = 0) {
    if (!info) return false;
    info->tm_hour = 14;
    info->tm_min = 30;
    info->tm_mon = 7;  // August
    info->tm_mday = 15;
    info->tm_year = 125; // 2025
    return true;
}

// ---- IRAM_ATTR ----
#define IRAM_ATTR
#define PROGMEM
