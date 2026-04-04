// ============================================================
// TftDashboard — LCD TFT 2.4" ILI9341 + tactile XPT2046
// 7 écrans navigables par touch ou bouton
//
// Écrans:
//   0. MAIN      — Vue d'ensemble (humidité, tank, T°, comm)
//   1. WIFI      — Config WiFi (scan + clavier virtuel)
//   2. WATERING  — Config arrosage (mode, seuils, durée)
//   3. SECURITY  — État sécurité + bouton unlock
//   4. SENSORS   — Liste 20 capteurs + alertes
//   5. PROFILES  — Profils hydriques par plante
//   6. AUTONOMY  — Calcul autonomie + barres visuelles
//
// Librairies: TFT_eSPI + XPT2046_Touchscreen
// SPI: VSPI (MOSI=23, MISO=19, CLK=18)
// LED RGB déplacée sur GPIO 16, 17, 2 pour éviter conflit SPI
// ============================================================

#pragma once

#include <Arduino.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>

// Forward declarations
class ConfigManager;
class SensorManager;
class PumpController;
class SafetyManager;
class TimeManager;
class PlantProfile;
class AutonomyCalculator;
class EspNowMaster;
class WifiManager;

enum class Screen : uint8_t {
    MAIN      = 0,
    WIFI      = 1,
    WATERING  = 2,
    SECURITY  = 3,
    SENSORS   = 4,
    PROFILES  = 5,
    AUTONOMY  = 6,
    COUNT     = 7
};

class TftDashboard {
public:
    TftDashboard();
    void begin();
    void update();  // Refresh display + handle touch

    // Navigate
    void setScreen(Screen screen);
    Screen currentScreen() const { return _currentScreen; }

    // Inject dependencies
    void setModules(ConfigManager* cfg, SensorManager* sens, PumpController* pump,
                    SafetyManager* safety, TimeManager* time, PlantProfile* profiles,
                    AutonomyCalculator* autonomy, EspNowMaster* comm, WifiManager* wifi);

    // Force refresh (after data change)
    void refresh();

    // WiFi config screen result
    bool hasWiFiCredentials() const { return _wifiConfigDone; }
    const char* wifiSSID() const { return _wifiSSID; }
    const char* wifiPass() const { return _wifiPass; }

private:
    TFT_eSPI          _tft;
    XPT2046_Touchscreen _touch;
    Screen            _currentScreen;
    uint32_t          _lastRefresh;
    bool              _needsRedraw;
    bool              _wifiConfigDone;
    char              _wifiSSID[33];
    char              _wifiPass[65];

    // Module pointers
    ConfigManager*     _cfg = nullptr;
    SensorManager*     _sens = nullptr;
    PumpController*    _pump = nullptr;
    SafetyManager*     _safety = nullptr;
    TimeManager*       _time = nullptr;
    PlantProfile*      _profiles = nullptr;
    AutonomyCalculator* _autonomy = nullptr;
    EspNowMaster*      _comm = nullptr;
    WifiManager*       _wifi = nullptr;

    // Screen renderers
    void _drawMain();
    void _drawWifi();
    void _drawWatering();
    void _drawSecurity();
    void _drawSensors();
    void _drawProfiles();
    void _drawAutonomy();

    // Touch handlers
    void _handleTouch(int16_t x, int16_t y);
    void _handleMainTouch(int16_t x, int16_t y);
    void _handleWifiTouch(int16_t x, int16_t y);

    // UI helpers
    void _drawHeader(const char* title);
    void _drawNavBar();
    void _drawProgressBar(int16_t x, int16_t y, int16_t w, int16_t h,
                          uint8_t percent, uint16_t color);
    void _drawButton(int16_t x, int16_t y, int16_t w, int16_t h,
                     const char* label, uint16_t bgColor);
    void _drawKeyboard();

    // Colors
    static const uint16_t COL_BG       = 0x0000;  // Black
    static const uint16_t COL_TEXT     = 0xFFFF;  // White
    static const uint16_t COL_HEADER   = 0x001F;  // Blue
    static const uint16_t COL_OK       = 0x07E0;  // Green
    static const uint16_t COL_WARN     = 0xFD20;  // Orange
    static const uint16_t COL_ERROR    = 0xF800;  // Red
    static const uint16_t COL_CYAN     = 0x07FF;
    static const uint16_t COL_GRAY     = 0x7BEF;
    static const uint16_t COL_DARKGRAY = 0x3186;
};
