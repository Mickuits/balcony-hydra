// ============================================================
// StatusLED — Implementation
// ============================================================

#include "StatusLED.h"
#include "config_master.h"

void StatusLED::begin() {
    // Setup LEDC PWM channels
    ledcSetup(LEDC_CH_R, LEDC_FREQ, LEDC_RES);
    ledcSetup(LEDC_CH_G, LEDC_FREQ, LEDC_RES);
    ledcSetup(LEDC_CH_B, LEDC_FREQ, LEDC_RES);
    
    ledcAttachPin(PIN_LED_R, LEDC_CH_R);
    ledcAttachPin(PIN_LED_G, LEDC_CH_G);
    ledcAttachPin(PIN_LED_B, LEDC_CH_B);
    
    _off();
    setState(LedState::BOOT);
    Serial.println("[LED] RGB initialisée (G17/G19/G23).");
}

void StatusLED::setState(LedState state) {
    if (_effectActive) return;  // Don't interrupt one-shot effects
    _state = state;
    _blinkOn = true;
    _breathVal = 0;
    _breathDir = 1;
    _lastUpdate = millis();
    
    // Set initial color for fixed states
    switch (state) {
        case LedState::OFF:             _off(); break;
        case LedState::OK:              _setRGB(0, 80, 0); break;
        case LedState::AP_MODE:         _setRGB(0, 0, 120); break;
        case LedState::WATERING:        _setRGB(0, 120, 120); break;
        case LedState::FAILSAFE:        _setRGB(180, 0, 0); break;
        case LedState::BOOT:            _setRGB(60, 60, 60); break;
        default: break;  // Animated states handled in update()
    }
}

void StatusLED::update() {
    uint32_t now = millis();
    
    // Handle one-shot effects
    if (_effectActive) {
        uint32_t elapsed = now - _effectStart;
        
        if (_state == LedState::BUTTON_ACK) {
            // 3 white flashes, 100ms each, 100ms gap
            uint8_t phase = elapsed / 100;
            if (phase >= 6) {
                _effectActive = false;
                setState(_prevState);
                return;
            }
            if (phase % 2 == 0) _setRGB(120, 120, 120);
            else _off();
            return;
        }
        
        // Generic timeout for effects
        if (elapsed > 1000) {
            _effectActive = false;
            setState(_prevState);
            return;
        }
    }
    
    // Animated states
    _updateAnimation();
}

void StatusLED::_updateAnimation() {
    uint32_t now = millis();
    uint32_t dt = now - _lastUpdate;
    
    switch (_state) {
        case LedState::OK_SLEEP_SOON:
            // Green breathing (2s cycle)
            if (dt > 20) {
                _lastUpdate = now;
                _breathVal += _breathDir * 3;
                if (_breathVal >= 80) { _breathVal = 80; _breathDir = -1; }
                if (_breathVal <= 5)  { _breathVal = 5;  _breathDir = 1; }
                _setRGB(0, _breathVal, 0);
            }
            break;
            
        case LedState::WIFI_CONNECTING:
            // Blue blinking 500ms
            if (dt > 500) {
                _lastUpdate = now;
                _blinkOn = !_blinkOn;
                if (_blinkOn) _setRGB(0, 0, 120);
                else _off();
            }
            break;
            
        case LedState::WARNING:
            // Yellow blinking 1s
            if (dt > 1000) {
                _lastUpdate = now;
                _blinkOn = !_blinkOn;
                if (_blinkOn) _setRGB(180, 120, 0);
                else _off();
            }
            break;
            
        case LedState::CRITICAL:
            // Red fast blinking 200ms
            if (dt > 200) {
                _lastUpdate = now;
                _blinkOn = !_blinkOn;
                if (_blinkOn) _setRGB(255, 0, 0);
                else _off();
            }
            break;
            
        default:
            break;  // Fixed states — no animation needed
    }
}

void StatusLED::flashButtonAck() {
    _prevState = _state;
    _state = LedState::BUTTON_ACK;
    _effectActive = true;
    _effectStart = millis();
    _effectStep = 0;
}

void StatusLED::flashError() {
    // Quick red burst (non-blocking feedback)
    _setRGB(255, 0, 0);
    delay(150);
    _off();
    delay(100);
    _setRGB(255, 0, 0);
    delay(150);
    _off();
    delay(100);
    _setRGB(255, 0, 0);
    delay(150);
    _off();
}

void StatusLED::_setRGB(uint8_t r, uint8_t g, uint8_t b) {
    ledcWrite(LEDC_CH_R, r);
    ledcWrite(LEDC_CH_G, g);
    ledcWrite(LEDC_CH_B, b);
}

void StatusLED::_off() {
    _setRGB(0, 0, 0);
}
