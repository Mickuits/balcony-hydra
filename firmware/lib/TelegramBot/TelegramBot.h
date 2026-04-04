// ============================================================
// TelegramBot — Alertes push + commandes interactives
// ============================================================

#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <UniversalTelegramBot.h>
#include "config.h"
#include "ConfigManager.h"
#include "SensorManager.h"
#include "PumpController.h"

// Forward declaration
class SafetyManager;

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

private:
    WiFiClientSecure _secureClient;
    UniversalTelegramBot* _bot;
    ConfigManager&  _configMgr;
    SensorManager&  _sensorMgr;
    PumpController& _pumpCtrl;
    SafetyManager*  _safetyMgr = nullptr;
    
    uint32_t _lastCheck;
    uint32_t _lastHeartbeat;
    bool     _enabled;
    
    void _handleMessages(int numNew);
    String _buildStatusMessage();
    String _chatId() const;
};
