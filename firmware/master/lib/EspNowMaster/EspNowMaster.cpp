// ============================================================
// EspNowMaster — Implementation
// ============================================================

#include "EspNowMaster.h"
#include <ArduinoJson.h>

EspNowMaster* EspNowMaster::_instance = nullptr;

EspNowMaster::EspNowMaster()
    : _peerAdded(false), _commState(CommState::DISCONNECTED),
      _missedPongs(0), _lastPingSent(0), _lastPongReceived(0),
      _newSensorData(false) {
    memset(_slaveMac, 0, 6);
    memset(&_lastSensors, 0, sizeof(DataSensors));
    memset(&_lastPumpStatus, 0, sizeof(DataPumpStatus));
    memset(&_lastPong, 0, sizeof(DataPong));
    _instance = this;
}

void EspNowMaster::begin(const uint8_t* slaveMac) {
    memcpy(_slaveMac, slaveMac, 6);

    if (esp_now_init() != ESP_OK) {
        Serial.println("[ESPNOW] Init FAILED");
        return;
    }

    // Register callbacks
    esp_now_register_recv_cb(_onDataRecv);
    esp_now_register_send_cb(_onDataSent);

    // Add slave as peer
    esp_now_peer_info_t peer;
    memset(&peer, 0, sizeof(peer));
    memcpy(peer.peer_addr, _slaveMac, 6);
    peer.channel = 0;  // Auto
    peer.encrypt = false;  // TODO: add PMK/LMK encryption

    if (esp_now_add_peer(&peer) == ESP_OK) {
        _peerAdded = true;
        Serial.printf("[ESPNOW] Peer esclave ajouté: %02X:%02X:%02X:%02X:%02X:%02X\n",
                      _slaveMac[0], _slaveMac[1], _slaveMac[2],
                      _slaveMac[3], _slaveMac[4], _slaveMac[5]);
    } else {
        Serial.println("[ESPNOW] Ajout peer ÉCHOUÉ");
    }

    _commState = CommState::DISCONNECTED;
    sendPing();  // Initial ping
}

void EspNowMaster::update() {
    _checkHeartbeat();
}

// ---- SEND COMMANDS ----

bool EspNowMaster::sendPing() {
    CmdPing cmd;
    cmd.header = Protocol::makeHeader((uint8_t)CmdType::CMD_PING);
    cmd.masterUptime = millis();
    _lastPingSent = millis();
    return _sendEspNow(&cmd, sizeof(cmd));
}

bool EspNowMaster::sendReadSensors() {
    CmdReadSensors cmd;
    cmd.header = Protocol::makeHeader((uint8_t)CmdType::CMD_READ_SENSORS);
    return _sendEspNow(&cmd, sizeof(cmd));
}

bool EspNowMaster::sendPumpStart(uint16_t durationS) {
    CmdPumpStart cmd;
    cmd.header = Protocol::makeHeader((uint8_t)CmdType::CMD_PUMP_START);
    cmd.durationS = durationS;
    Serial.printf("[ESPNOW] → PUMP_START %ds\n", durationS);
    return _sendEspNow(&cmd, sizeof(cmd));
}

bool EspNowMaster::sendPumpStop(uint8_t reason) {
    CmdPumpStop cmd;
    cmd.header = Protocol::makeHeader((uint8_t)CmdType::CMD_PUMP_STOP);
    cmd.reason = reason;
    Serial.println("[ESPNOW] → PUMP_STOP");
    return _sendEspNow(&cmd, sizeof(cmd));
}

bool EspNowMaster::sendSetConfig(const CmdSetConfig& cfg) {
    Serial.println("[ESPNOW] → SET_CONFIG");
    return _sendEspNow(&cfg, sizeof(cfg));
}

bool EspNowMaster::sendReboot(uint32_t delayMs) {
    CmdReboot cmd;
    cmd.header = Protocol::makeHeader((uint8_t)CmdType::CMD_REBOOT);
    cmd.delayMs = delayMs;
    return _sendEspNow(&cmd, sizeof(cmd));
}

// ---- INTERNAL ----

bool EspNowMaster::_sendEspNow(const void* data, size_t len) {
    if (!_peerAdded) return false;
    esp_err_t result = esp_now_send(_slaveMac, (const uint8_t*)data, len);
    if (result != ESP_OK) {
        Serial.printf("[ESPNOW] Envoi échoué: %d\n", result);
    }
    return result == ESP_OK;
}

void EspNowMaster::_checkHeartbeat() {
    // Send PING every ESPNOW_PING_INTERVAL_MS
    if (millis() - _lastPingSent >= ESPNOW_PING_INTERVAL_MS) {
        sendPing();
        _missedPongs++;

        if (_missedPongs >= ESPNOW_MAX_MISSED_PONGS) {
            if (_commState != CommState::DEGRADED) {
                _commState = CommState::DEGRADED;
                Serial.println("[ESPNOW] ⚠ Esclave NON-RESPONSIVE — 3 PONG manqués!");
            }
        }
    }
}

// ---- CALLBACKS ----

void EspNowMaster::_onDataRecv(const uint8_t* mac, const uint8_t* data, int len) {
    if (_instance) _instance->_handleReceived(data, len);
}

void EspNowMaster::_onDataSent(const uint8_t* mac, esp_now_send_status_t status) {
    if (status != ESP_NOW_SEND_SUCCESS) {
        Serial.println("[ESPNOW] Envoi non confirmé");
    }
}

void EspNowMaster::_handleReceived(const uint8_t* data, int len) {
    if (len < (int)sizeof(MsgHeader)) return;

    const MsgHeader* header = (const MsgHeader*)data;
    if (!Protocol::validateHeader(*header)) return;

    Serial.printf("[ESPNOW] ← %s (%d bytes)\n", Protocol::typeName(header->type), len);

    switch (header->type) {
        case (uint8_t)DataType::DATA_PONG:
            if (len >= (int)sizeof(DataPong)) {
                memcpy(&_lastPong, data, sizeof(DataPong));
                _missedPongs = 0;
                _lastPongReceived = millis();
                _commState = CommState::ESPNOW_OK;
                if (_lastPong.mode == 1) {
                    Serial.println("[ESPNOW] Esclave en MODE DÉGRADÉ — sync données");
                }
            }
            break;

        case (uint8_t)DataType::DATA_SENSORS:
            if (len >= (int)sizeof(DataSensors)) {
                memcpy(&_lastSensors, data, sizeof(DataSensors));
                _newSensorData = true;
            }
            break;

        case (uint8_t)DataType::DATA_PUMP_STATUS:
            if (len >= (int)sizeof(DataPumpStatus)) {
                memcpy(&_lastPumpStatus, data, sizeof(DataPumpStatus));
            }
            break;

        case (uint8_t)DataType::DATA_ACK: {
            const DataAck* ack = (const DataAck*)data;
            Serial.printf("[ESPNOW] ACK cmd=%s seq=%d success=%d\n",
                          Protocol::typeName(ack->cmdType), ack->seqNum, ack->success);
            break;
        }

        case (uint8_t)DataType::DATA_ALERT: {
            const DataAlert* alert = (const DataAlert*)data;
            Serial.printf("[ESPNOW] ⚠ ALERTE esclave: type=%d msg=%s\n",
                          alert->alertType, alert->message);
            if (_alertCb) _alertCb(*alert);
            break;
        }
    }
}

String EspNowMaster::toJson() const {
    JsonDocument doc;
    const char* stateNames[] = {"Déconnecté", "ESP-NOW OK", "MQTT fallback", "Non-responsive"};
    doc["state"] = (uint8_t)_commState;
    doc["stateLabel"] = stateNames[(uint8_t)_commState];
    doc["missedPongs"] = _missedPongs;
    doc["lastPongAgoS"] = _lastPongReceived > 0 ? (millis() - _lastPongReceived) / 1000 : -1;
    doc["slaveUptime"] = _lastPong.slaveUptime;
    doc["slaveBatteryMV"] = _lastPong.batteryMV;
    doc["slaveRssi"] = _lastPong.rssi;
    doc["slaveDegraded"] = _lastPong.mode == 1;
    String out;
    serializeJson(doc, out);
    return out;
}
