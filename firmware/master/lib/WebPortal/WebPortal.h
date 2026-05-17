// ============================================================
// WebPortal — Portail web embarqué (français)
// AsyncWebServer + page HTML/CSS/JS en PROGMEM
// ============================================================

#pragma once

#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include "ConfigManager.h"
#include "SensorManager.h"
#include "PumpController.h"
#include "WifiManager.h"

class SafetyManager;  // Forward-declared — injected via setSafetyManager()

class WebPortal {
public:
    WebPortal(ConfigManager& configMgr, SensorManager& sensorMgr,
              PumpController& pumpCtrl, WifiManager& wifiMgr);

    void begin();
    void stop();

    // Optional: enable /api/safety/* routes (status + unlock)
    void setSafetyManager(SafetyManager* safetyMgr) { _safetyMgr = safetyMgr; }

private:
    AsyncWebServer _server;
    ConfigManager&  _configMgr;
    SensorManager&  _sensorMgr;
    PumpController& _pumpCtrl;
    WifiManager&    _wifiMgr;
    SafetyManager*  _safetyMgr = nullptr;  // Optional dependency

    void _setupRoutes();
    void _servePage(AsyncWebServerRequest* req);

    // Vérifie le header X-Hydra-Token. Retourne true si valide.
    // Si invalide ou absent : envoie 401 et retourne false (l'appelant
    // doit immédiatement return sans répondre). Pattern :
    //   if (!_authorized(req)) return;
    bool _authorized(AsyncWebServerRequest* req);
    void _handleApiStatus(AsyncWebServerRequest* req);
    void _handleApiSensors(AsyncWebServerRequest* req);
    void _handleApiConfig(AsyncWebServerRequest* req);
    void _handleApiConfigUpdate(AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total);
    void _handleApiPumpStart(AsyncWebServerRequest* req);
    void _handleApiPumpStop(AsyncWebServerRequest* req);
    void _handleApiResetFailsafe(AsyncWebServerRequest* req);
    void _handleApiReboot(AsyncWebServerRequest* req);
    void _handleApiFactoryReset(AsyncWebServerRequest* req);
    void _handleApiSafetyStatus(AsyncWebServerRequest* req);
    void _handleApiSafetyUnlock(AsyncWebServerRequest* req);
    void _handleCaptivePortal(AsyncWebServerRequest* req);

    static const char _html[] PROGMEM;
};
