// ============================================================
// Arduino.h — Mock pour tests natifs esclave
//
// Fournit les types de base, les macros et un minimum de HAL
// (millis contrôlable + Preferences NVS en mémoire) nécessaires
// pour compiler ET exercer en natif :
//   - Protocol.h / config_common.h (types purs)
//   - DegradedMode + SafetyLocal (logique mode dégradé E2E)
// Pas de hardware réel : tout est simulé côté PC.
// ============================================================

#pragma once

#include <cstdint>
#include <cstring>
#include <cstdio>
#include <cmath>
#include <cstdlib>
#include <string>
#include <map>
#include <vector>
#include <algorithm>

typedef uint8_t byte;
typedef bool boolean;

// GPIO stubs (non utilisés dans les tests esclave, mais requis pour
// les headers qui incluent config_slave.h via config_common.h)
#ifndef HIGH
#define HIGH 1
#define LOW  0
#endif
#ifndef INPUT
#define INPUT    0
#define OUTPUT   1
#endif
#define IRAM_ATTR
#define PROGMEM

// ---- HAL simulé : horloge contrôlable depuis les tests ----
// Permet d'exercer cooldown / max cycles / reset 24h de DegradedMode
// sans attendre le temps réel. reset() remet l'horloge à 0.
namespace MockHW {
    inline uint32_t _millis = 0;
    inline void reset()                  { _millis = 0; }
    inline void setMillis(uint32_t ms)   { _millis = ms; }
    inline void advanceMillis(uint32_t ms){ _millis += ms; }
}

inline void pinMode(uint8_t, uint8_t) {}
inline void digitalWrite(uint8_t, uint8_t) {}
inline uint8_t digitalRead(uint8_t) { return 0; }
inline uint16_t analogRead(uint8_t) { return 0; }
inline uint32_t millis() { return MockHW::_millis; }
inline void delay(uint32_t ms) { MockHW::_millis += ms; }
inline void delayMicroseconds(uint32_t) {}

#ifndef isnan
using std::isnan;
#endif

// String minimal (non utilisé par les tests slave, mais requis par
// certains headers via inclusion transitoire)
class String {
public:
    String() {}
    String(const char*) {}
    const char* c_str() const { return ""; }
};

// Serial stub (silencieux en test natif)
struct SerialMock {
    void begin(unsigned long) {}
    void println(const char* = "") {}
    void print(const char* = "") {}
    void printf(const char*, ...) {}
};
inline SerialMock Serial;

// ---- Preferences (NVS avec stockage réel en mémoire) ----
// Roundtrip persistant entre instances (store statique) → simule la NVS
// qui survit aux reboots. resetAll() vide tout entre deux tests.
class Preferences {
    static inline std::map<std::string, std::vector<uint8_t>> _store;
    static inline std::string _ns;
    std::string _key(const char* k) const { return _ns + "::" + k; }
public:
    bool begin(const char* ns, bool /*ro*/ = false) { _ns = ns ? ns : ""; return true; }
    void end() {}
    void clear() {
        auto p = _ns + "::";
        for (auto it = _store.begin(); it != _store.end();)
            if (it->first.substr(0, p.size()) == p) it = _store.erase(it); else ++it;
    }
    bool isKey(const char* k) { return _store.count(_key(k)) > 0; }
    void putUChar(const char* k, uint8_t v) { _store[_key(k)] = {v}; }
    uint8_t getUChar(const char* k, uint8_t def = 0) {
        auto it = _store.find(_key(k)); return it != _store.end() ? it->second[0] : def;
    }
    void putUShort(const char* k, uint16_t v) { auto& d = _store[_key(k)]; d.resize(2); memcpy(d.data(), &v, 2); }
    uint16_t getUShort(const char* k, uint16_t def = 0) {
        auto it = _store.find(_key(k)); if (it == _store.end()) return def;
        uint16_t v; memcpy(&v, it->second.data(), 2); return v;
    }
    void putULong(const char* k, uint32_t v) { auto& d = _store[_key(k)]; d.resize(4); memcpy(d.data(), &v, 4); }
    uint32_t getULong(const char* k, uint32_t def = 0) {
        auto it = _store.find(_key(k)); if (it == _store.end()) return def;
        uint32_t v; memcpy(&v, it->second.data(), 4); return v;
    }
    void putBool(const char* k, bool v) { putUChar(k, v ? 1 : 0); }
    bool getBool(const char* k, bool def = false) {
        return _store.count(_key(k)) ? (_store[_key(k)][0] != 0) : def;
    }
    void remove(const char* k) { _store.erase(_key(k)); }
    static void resetAll() { _store.clear(); }
};
