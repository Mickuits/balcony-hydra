// ============================================================
// MqttClient — Publication MQTT + commandes
// ============================================================

#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "config.h"
#include "ConfigManager.h"
#include "SensorManager.h"
#include "PumpController.h"

class MqttClient {
public:
    MqttClient(ConfigManager& configMgr, SensorManager& sensorMgr, PumpController& pumpCtrl);

    void begin();
    void update();
    bool isConnected() const;
    void publishSensors();
    void publishPumpStatus();
    void publishAlert(const char* message);

private:
    WiFiClient      _wifiClient;
    PubSubClient    _mqtt;
    ConfigManager&  _configMgr;
    SensorManager&  _sensorMgr;
    PumpController& _pumpCtrl;
    
    uint32_t _lastReconnect;
    uint32_t _lastPublish;
    
    void _reconnect();
    void _onMessage(char* topic, byte* payload, unsigned int len);
    bool _hasConfig() const;
};
