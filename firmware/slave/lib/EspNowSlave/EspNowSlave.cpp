// ============================================================
// EspNowSlave — Implementation
// ============================================================

#include "EspNowSlave.h"

EspNowSlave* EspNowSlave::_instance = nullptr;

EspNowSlave::EspNowSlave()
    : _peerAdded(false), _commState(SlaveCommState::WAITING_MASTER),
      _lastMasterMsg(0), _missedPings(0) {
    memset(_masterMac, 0, 6);
    memset(&_callbacks, 0, sizeof(SlaveCallbacks));
    _instance = this;
}

void EspNowSlave::begin(const uint8_t* masterMac) {
    memcpy(_masterMac, masterMac, 6);

    WiFi.mode(WIFI_STA);

    if (esp_now_init() != ESP_OK) {
        Serial.println("[SLAVE-NOW] Init FAILED");
        return;
    }

    esp_now_register_recv_cb(_onDataRecv);

    esp_now_peer_info_t peer;
    memset(&peer, 0, sizeof(peer));
    memcpy(peer.peer_addr, _masterMac, 6);
    peer.channel = 0;
    peer.encrypt = false;

    if (esp_now_add_peer(&peer) == ESP_OK) {
        _peerAdded = true;
        Serial.printf("[SLAVE-NOW] Peer maître ajouté: %02X:%02X:%02X:%02X:%02X:%02X\n",
                      _masterMac[0], _masterMac[1], _masterMac[2],
                      _masterMac[3], _masterMac[4], _masterMac[5]);
    }
}

void EspNowSlave::update() {
    _checkMasterTimeout();
}

// ---- SEND DATA ----

bool EspNowSlave::sendPong(uint32_t uptime, uint16_t battMV, int8_t rssi,
                            uint8_t mode, uint8_t pumpState, uint8_t failsafe) {
    DataPong pong;
    pong.header = Protocol::makeHeader((uint8_t)DataType::DATA_PONG);
    pong.slaveUptime = uptime;
    pong.batteryMV = battMV;
    pong.rssi = rssi;
    pong.mode = mode;
    pong.pumpState = pumpState;
    pong.failsafeActive = failsafe;
    return _send(&pong, sizeof(pong));
}

bool EspNowSlave::sendSensors(const DataSensors& data) {
    return _send(&data, sizeof(data));
}

bool EspNowSlave::sendPumpStatus(const DataPumpStatus& status) {
    return _send(&status, sizeof(status));
}

bool EspNowSlave::sendAck(uint8_t cmdType, uint8_t seqNum, bool success, const char* msg) {
    DataAck ack;
    ack.header = Protocol::makeHeader((uint8_t)DataType::DATA_ACK);
    ack.cmdType = cmdType;
    ack.seqNum = seqNum;
    ack.success = success ? 1 : 0;
    strncpy(ack.message, msg, sizeof(ack.message));
    return _send(&ack, sizeof(ack));
}

bool EspNowSlave::sendAlert(AlertType type, const char* message) {
    DataAlert alert;
    alert.header = Protocol::makeHeader((uint8_t)DataType::DATA_ALERT);
    alert.alertType = (uint8_t)type;
    strncpy(alert.message, message, sizeof(alert.message));
    Serial.printf("[SLAVE-NOW] → ALERT: %s\n", message);
    return _send(&alert, sizeof(alert));
}

// ---- INTERNAL ----

bool EspNowSlave::_send(const void* data, size_t len) {
    if (!_peerAdded) return false;
    return esp_now_send(_masterMac, (const uint8_t*)data, len) == ESP_OK;
}

void EspNowSlave::_checkMasterTimeout() {
    if (_lastMasterMsg == 0) return;  // Never received anything yet

    uint32_t elapsed = millis() - _lastMasterMsg;

    // Master sends PING every 60s. If no message for 3× that → lost
    if (elapsed > ESPNOW_PING_INTERVAL_MS * ESPNOW_MAX_MISSED_PONGS) {
        if (_commState != SlaveCommState::MASTER_LOST) {
            _commState = SlaveCommState::MASTER_LOST;
            Serial.println("[SLAVE-NOW] ⚠ MAÎTRE PERDU — passage mode dégradé");
        }
    }
}

// ---- CALLBACK ----

void EspNowSlave::_onDataRecv(const uint8_t* mac, const uint8_t* data, int len) {
    if (_instance) _instance->_handleReceived(data, len);
}

void EspNowSlave::_handleReceived(const uint8_t* data, int len) {
    if (len < (int)sizeof(MsgHeader)) return;

    const MsgHeader* header = (const MsgHeader*)data;
    if (!Protocol::validateHeader(*header)) return;

    _lastMasterMsg = millis();
    _missedPings = 0;

    // If we were lost, we're back
    if (_commState == SlaveCommState::MASTER_LOST) {
        _commState = SlaveCommState::CONNECTED;
        Serial.println("[SLAVE-NOW] ✅ Maître reconnecté — sortie mode dégradé");
    } else if (_commState == SlaveCommState::WAITING_MASTER) {
        _commState = SlaveCommState::CONNECTED;
        Serial.println("[SLAVE-NOW] ✅ Premier contact maître établi");
    }

    Serial.printf("[SLAVE-NOW] ← %s\n", Protocol::typeName(header->type));

    switch (header->type) {
        case (uint8_t)CmdType::CMD_PING: {
            // Respond immediately with PONG — caller fills in data via sendPong()
            if (_callbacks.onReadSensors) _callbacks.onReadSensors();  // Refresh data
            break;
        }

        case (uint8_t)CmdType::CMD_READ_SENSORS:
            if (_callbacks.onReadSensors) _callbacks.onReadSensors();
            sendAck(header->type, header->seqNum, true);
            break;

        case (uint8_t)CmdType::CMD_PUMP_START: {
            const CmdPumpStart* cmd = (const CmdPumpStart*)data;
            if (_callbacks.onPumpStart) _callbacks.onPumpStart(cmd->durationS);
            sendAck(header->type, header->seqNum, true);
            break;
        }

        case (uint8_t)CmdType::CMD_PUMP_STOP: {
            const CmdPumpStop* cmd = (const CmdPumpStop*)data;
            if (_callbacks.onPumpStop) _callbacks.onPumpStop(cmd->reason);
            sendAck(header->type, header->seqNum, true);
            break;
        }

        case (uint8_t)CmdType::CMD_SET_CONFIG: {
            const CmdSetConfig* cmd = (const CmdSetConfig*)data;
            if (_callbacks.onSetConfig) _callbacks.onSetConfig(*cmd);
            sendAck(header->type, header->seqNum, true, "Config reçue");
            break;
        }

        case (uint8_t)CmdType::CMD_REBOOT: {
            const CmdReboot* cmd = (const CmdReboot*)data;
            sendAck(header->type, header->seqNum, true, "Reboot...");
            if (_callbacks.onReboot) _callbacks.onReboot(cmd->delayMs);
            break;
        }
    }
}
