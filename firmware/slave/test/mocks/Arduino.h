// ============================================================
// Arduino.h — Mock minimal pour tests natifs esclave
//
// Fournit uniquement les types de base et les macros nécessaires
// pour compiler Protocol.h et config_common.h en environnement
// natif (PC). Pas de hardware, pas de périphériques.
// ============================================================

#pragma once

#include <cstdint>
#include <cstring>
#include <cstdio>
#include <cmath>
#include <cstdlib>

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

inline void pinMode(uint8_t, uint8_t) {}
inline void digitalWrite(uint8_t, uint8_t) {}
inline uint8_t digitalRead(uint8_t) { return 0; }
inline uint16_t analogRead(uint8_t) { return 0; }
inline uint32_t millis() { return 0; }
inline void delay(uint32_t) {}
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
    void printf(const char*, ...) {}
};
inline SerialMock Serial;
