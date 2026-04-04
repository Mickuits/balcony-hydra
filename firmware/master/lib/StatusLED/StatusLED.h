// ============================================================
// StatusLED — LED RGB indicateur d'état système
// ============================================================

#pragma once

#include <Arduino.h>

// RGB LED pins (common cathode — HIGH = ON)
constexpr uint8_t PIN_LED_R = 17;
constexpr uint8_t PIN_LED_G = 19;
constexpr uint8_t PIN_LED_B = 23;

// PWM channels (ESP32 LEDC)
constexpr uint8_t LEDC_CH_R = 4;
constexpr uint8_t LEDC_CH_G = 5;
constexpr uint8_t LEDC_CH_B = 6;
constexpr uint32_t LEDC_FREQ = 5000;
constexpr uint8_t LEDC_RES  = 8;  // 0-255

enum class LedState : uint8_t {
    OFF              = 0,
    OK               = 1,   // Vert fixe
    OK_SLEEP_SOON    = 2,   // Vert respiration
    AP_MODE          = 3,   // Bleu fixe
    WIFI_CONNECTING  = 4,   // Bleu clignotant
    WATERING         = 5,   // Cyan fixe
    WARNING          = 6,   // Jaune clignotant
    FAILSAFE         = 7,   // Rouge fixe
    CRITICAL         = 8,   // Rouge clignotant rapide
    BUTTON_ACK       = 9,   // Blanc flash 3×
    BOOT             = 10   // Blanc fixe
};

class StatusLED {
public:
    void begin();
    void update();  // Call in loop — handles animations
    void setState(LedState state);
    LedState state() const { return _state; }
    
    // One-shot effects (auto-return to previous state)
    void flashButtonAck();
    void flashError();

private:
    LedState _state = LedState::OFF;
    LedState _prevState = LedState::OFF;
    uint32_t _lastUpdate = 0;
    uint32_t _effectStart = 0;
    bool     _effectActive = false;
    uint8_t  _effectStep = 0;
    bool     _blinkOn = false;
    uint8_t  _breathVal = 0;
    int8_t   _breathDir = 1;

    void _setRGB(uint8_t r, uint8_t g, uint8_t b);
    void _off();
    void _updateAnimation();
};
