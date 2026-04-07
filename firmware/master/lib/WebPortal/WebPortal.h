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

class WebPortal {
public:
    WebPortal(ConfigManager& configMgr, SensorManager& sensorMgr,
              PumpController& pumpCtrl, WifiManager& wifiMgr);

    void begin();
    void stop();

private:
    AsyncWebServer _server;
    ConfigManager&  _configMgr;
    SensorManager&  _sensorMgr;
    PumpController& _pumpCtrl;
    WifiManager&    _wifiMgr;

    void _setupRoutes();
    void _servePage(AsyncWebServerRequest* req);
    void _handleApiStatus(AsyncWebServerRequest* req);
    void _handleApiSensors(AsyncWebServerRequest* req);
    void _handleApiConfig(AsyncWebServerRequest* req);
    void _handleApiConfigUpdate(AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total);
    void _handleApiPumpStart(AsyncWebServerRequest* req);
    void _handleApiPumpStop(AsyncWebServerRequest* req);
    void _handleApiResetFailsafe(AsyncWebServerRequest* req);
    void _handleApiReboot(AsyncWebServerRequest* req);
    void _handleApiFactoryReset(AsyncWebServerRequest* req);
    void _handleCaptivePortal(AsyncWebServerRequest* req);

    static const char _html[] PROGMEM;
};
