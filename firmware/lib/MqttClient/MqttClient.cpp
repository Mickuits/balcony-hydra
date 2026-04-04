// ============================================================
// MqttClient — Implementation
// ============================================================

#include "MqttClient.h"

MqttClient::MqttClient(ConfigManager& configMgr, SensorManager& sensorMgr, PumpController& pumpCtrl)
    : _mqtt(_wifiClient), _configMgr(configMgr), _sensorMgr(sensorMgr), _pumpCtrl(pumpCtrl),
      _lastReconnect(0), _lastPublish(0) {}

void MqttClient::begin() {
    if (!_hasConfig()) {
        Serial.println("[MQTT] Pas de broker configuré — désactivé.");
        return;
    }
    const auto& net = _configMgr.config().network;
    _mqtt.setServer(net.mqttHost, net.mqttPort);
    _mqtt.setCallback([this](char* t, byte* p, unsigned int l) { _onMessage(t, p, l); });
    _mqtt.setBufferSize(512);
    Serial.printf("[MQTT] Broker: %s:%d\n", net.mqttHost, net.mqttPort);
}

void MqttClient::update() {
    if (!_hasConfig()) return;
    if (!WiFi.isConnected()) return;

    if (!_mqtt.connected()) {
        if (millis() - _lastReconnect > 15000) {
            _lastReconnect = millis();
            _reconnect();
        }
        return;
    }
    _mqtt.loop();
    
    // Auto-publish every 60s
    if (millis() - _lastPublish > 60000) {
        _lastPublish = millis();
        publishSensors();
        publishPumpStatus();
    }
}

bool MqttClient::isConnected() const { return _mqtt.connected(); }

void MqttClient::_reconnect() {
    const auto& net = _configMgr.config().network;
    String clientId = "hydra-" + String(ESP.getEfuseMac(), HEX);
    
    bool ok;
    if (strlen(net.mqttUser) > 0) {
        ok = _mqtt.connect(clientId.c_str(), net.mqttUser, net.mqttPass);
    } else {
        ok = _mqtt.connect(clientId.c_str());
    }
    
    if (ok) {
        Serial.println("[MQTT] Connecté.");
        _mqtt.subscribe(MQTT_TOPIC_PREFIX "cmd/#");
        publishAlert("Hydra en ligne");
    } else {
        Serial.printf("[MQTT] Échec connexion (rc=%d)\n", _mqtt.state());
    }
}

void MqttClient::publishSensors() {
    if (!_mqtt.connected()) return;
    
    JsonDocument doc;
    const auto& sd = _sensorMgr.data();
    doc["avgMoisture"] = sd.avgMoisture;
    doc["tankLevel"]   = sd.tank[0].valid ? sd.tank[0].levelPct : -1;
    doc["temperature"] = sd.environment.valid ? sd.environment.temperature : -99;
    doc["humidity"]    = sd.environment.valid ? sd.environment.humidity : -1;
    doc["pressure"]    = sd.environment.valid ? sd.environment.pressure : -1;
    
    String payload;
    serializeJson(doc, payload);
    _mqtt.publish(MQTT_TOPIC_SENSORS, payload.c_str(), true);
}

void MqttClient::publishPumpStatus() {
    if (!_mqtt.connected()) return;
    _mqtt.publish(MQTT_TOPIC_PUMP, _pumpCtrl.toJson().c_str(), true);
}

void MqttClient::publishAlert(const char* message) {
    if (!_mqtt.connected()) return;
    JsonDocument doc;
    doc["alert"] = message;
    doc["timestamp"] = millis() / 1000;
    String payload;
    serializeJson(doc, payload);
    _mqtt.publish(MQTT_TOPIC_ALERTS, payload.c_str());
    Serial.printf("[MQTT] Alerte: %s\n", message);
}

void MqttClient::_onMessage(char* topic, byte* payload, unsigned int len) {
    String msg;
    for (unsigned int i = 0; i < len; i++) msg += (char)payload[i];
    Serial.printf("[MQTT] Reçu %s: %s\n", topic, msg.c_str());
    
    String t = String(topic);
    if (t.endsWith("cmd/water")) { _pumpCtrl.start(); }
    else if (t.endsWith("cmd/stop")) { _pumpCtrl.stop(); }
    else if (t.endsWith("cmd/reset")) { _pumpCtrl.resetFailsafe(); }
    else if (t.endsWith("cmd/reboot")) { ESP.restart(); }
}

bool MqttClient::_hasConfig() const {
    return strlen(_configMgr.config().network.mqttHost) > 0;
}
