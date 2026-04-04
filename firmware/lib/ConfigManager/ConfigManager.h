// ============================================================
// ConfigManager — Persistance NVS des paramètres système
// ============================================================

#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include "config.h"

struct WateringSchedule {
    uint8_t hour1;
    uint8_t min1;
    uint8_t hour2;
    uint8_t min2;
    bool    enabled1;
    bool    enabled2;
};

struct MoistureConfig {
    uint8_t  minThreshold;   // % — below → needs water
    uint8_t  maxThreshold;   // % — above → skip
    uint16_t airValue;       // ADC raw in dry air
    uint16_t waterValue;     // ADC raw submerged
};

struct TankConfig {
    float   heightCm;
    float   minLevelCm;
    uint8_t criticalPct;
    uint8_t warningPct;
};

struct NetworkConfig {
    char wifiSsid[33];
    char wifiPass[65];
    char mqttHost[65];
    uint16_t mqttPort;
    char mqttUser[33];
    char mqttPass[65];
    char telegramToken[50];
    char telegramChatId[15];
    char apSsid[33];
    char apPass[33];
};

enum class WateringMode : uint8_t {
    AUTOMATIC = 0,  // Capteurs humidité décident (schedule ou solaire)
    SCHEDULED = 1,  // Heures fixes
    SOLAR     = 2,  // Calé sur lever/coucher du soleil
    MANUAL    = 3   // Commande uniquement
};

struct SolarConfig {
    int8_t sunriseOffsetMin;   // Offset en minutes (ex: +30 = 30 min après lever)
    int8_t sunsetOffsetMin;    // Offset en minutes (ex: +30 = 30 min après coucher)
    bool   sunriseEnabled;
    bool   sunsetEnabled;
    float  latitude;
    float  longitude;
};

struct SystemConfig {
    WateringSchedule schedule;
    MoistureConfig   moisture;
    TankConfig       tank;
    NetworkConfig    network;
    SolarConfig      solar;
    WateringMode     mode;
    uint16_t         pumpDurationS;
    uint32_t         sleepIntervalS;
    uint32_t         heartbeatIntervalMs;
    bool             otaEnabled;
};

class ConfigManager {
public:
    ConfigManager();
    
    void begin();
    void loadDefaults();
    void load();
    void save();
    void reset();
    
    SystemConfig& config();
    const SystemConfig& config() const;
    
    // Serialization for web portal
    String toJson() const;
    bool fromJson(const String& json);
    
    // Individual accessors for convenience
    WateringMode mode() const { return _config.mode; }
    void setMode(WateringMode m) { _config.mode = m; }
    
    bool isWateringTime(uint8_t hour, uint8_t minute) const;
    bool needsWatering(uint8_t moisturePct) const;
    bool isTankCritical(uint8_t levelPct) const;
    bool isTankWarning(uint8_t levelPct) const;

private:
    Preferences _prefs;
    SystemConfig _config;
    
    void _saveNetwork();
    void _loadNetwork();
    void _saveSchedule();
    void _loadSchedule();
};
