// ============================================================
// TelegramBot — Alertes push + commandes interactives
// ============================================================

#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <UniversalTelegramBot.h>
#include "config_master.h"
#include "ConfigManager.h"
#include "SensorManager.h"
#include "PumpController.h"

// Forward declaration
class SafetyManager;
class PlantProfile;
class AutonomyCalculator;
class EspNowMaster;

class TelegramBot {
public:
    TelegramBot(ConfigManager& configMgr, SensorManager& sensorMgr, PumpController& pumpCtrl);

    void begin();
    void update();
    void sendAlert(const String& message);
    void sendHeartbeat();
    bool isEnabled() const;

    // Inject SafetyManager after construction (circular dependency)
    void setSafetyManager(SafetyManager* mgr) { _safetyMgr = mgr; }
    void setPlantProfile(PlantProfile* pp) { _plantProfile = pp; }
    void setAutonomyCalc(AutonomyCalculator* ac) { _autonomyCalc = ac; }
    void setEspNowMaster(EspNowMaster* espnow) { _espNowMaster = espnow; }

private:
    WiFiClientSecure _secureClient;
    UniversalTelegramBot* _bot;
    ConfigManager&  _configMgr;
    SensorManager&  _sensorMgr;
    PumpController& _pumpCtrl;
    SafetyManager*  _safetyMgr = nullptr;
    PlantProfile*       _plantProfile = nullptr;
    AutonomyCalculator* _autonomyCalc = nullptr;
    EspNowMaster*       _espNowMaster = nullptr;

    uint32_t _lastCheck;
    uint32_t _lastHeartbeat;
    bool     _enabled;

    // /factory_reset arming window — millis() expiry. 0 = non armé.
    // Pattern 2-step pour éviter un reset accidentel par tap sur l'historique chat.
    uint32_t _factoryResetArmedUntil = 0;
    static constexpr uint32_t FACTORY_RESET_WINDOW_MS = 30000;  // 30s pour confirmer

    void _handleMessages(int numNew);
    String _buildStatusMessage();
    String _chatId() const;
};
