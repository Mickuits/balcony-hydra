// ============================================================
// EspNowMaster — Implementation
// ============================================================

#include "EspNowMaster.h"
#include <ArduinoJson.h>
#include <Preferences.h>

EspNowMaster* EspNowMaster::_instance = nullptr;

EspNowMaster::EspNowMaster()
    : _peerAdded(false), _commState(CommState::DISCONNECTED),
      _missedPongs(0), _lastPingSent(0), _lastPongReceived(0),
      _newSensorData(false), _paired(false), _lastPairingReq(0) {
    memset(_slaveMac, 0, 6);
    memset(&_lastSensors, 0, sizeof(DataSensors));
    memset(&_lastPumpStatus, 0, sizeof(DataPumpStatus));
    memset(&_lastPong, 0, sizeof(DataPong));
    _instance = this;
}

void EspNowMaster::begin() {
    // Lecture du MAC esclave persisté en NVS (namespace "espnow", clé "peerMac")
    Preferences prefs;
    prefs.begin("espnow", true);  // read-only
    size_t loaded = prefs.getBytes("peerMac", _slaveMac, 6);
    prefs.end();

    if (esp_now_init() != ESP_OK) {
        Serial.println("[ESPNOW] Init FAILED");
        return;
    }

    // Set PMK (Primary Master Key) — partagée avec le slave via config_common.h.
    // Doit être appelé AVANT esp_now_add_peer pour les peers chiffrés.
    if (esp_now_set_pmk(ESPNOW_PMK) != ESP_OK) {
        Serial.println("[ESPNOW] set_pmk FAILED — chiffrement indisponible");
    } else {
        Serial.println("[ESPNOW] PMK set · AES-128-CCM activé sur unicast post-pairing");
    }

    // Enregistrement des callbacks
    esp_now_register_recv_cb(_onDataRecv);
    esp_now_register_send_cb(_onDataSent);

    if (loaded == 6) {
        // MAC esclave connu — ajout du peer en unicast, mode normal
        _paired = true;
        if (_addPeer(_slaveMac)) {
            Serial.printf("[ESPNOW] Peer esclave restauré depuis NVS: %02X:%02X:%02X:%02X:%02X:%02X\n",
                          _slaveMac[0], _slaveMac[1], _slaveMac[2],
                          _slaveMac[3], _slaveMac[4], _slaveMac[5]);
        }
        _commState = CommState::DISCONNECTED;
        sendPing();  // Ping initial
    } else {
        // Premier boot ou NVS effacé — mode pairing actif
        _paired = false;
        static const uint8_t broadcast[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
        memcpy(_slaveMac, broadcast, 6);
        // channel=1 obligatoire pour le peer broadcast sur ESP-NOW
        esp_now_peer_info_t peer;
        memset(&peer, 0, sizeof(peer));
        memcpy(peer.peer_addr, broadcast, 6);
        peer.channel = 1;
        peer.encrypt = false;
        if (esp_now_add_peer(&peer) == ESP_OK) {
            _peerAdded = true;
        }
        Serial.println("[ESPNOW] Mode pairing actif, recherche de l'esclave...");
    }
}

void EspNowMaster::resetPairing() {
    // Supprime le MAC persisté et redémarre en mode pairing (debug/re-pairing)
    Preferences prefs;
    prefs.begin("espnow", false);
    prefs.remove("peerMac");
    prefs.end();
    _paired = false;
    _peerAdded = false;
    esp_now_del_peer(_slaveMac);  // Retire le peer unicast éventuel
    static const uint8_t broadcast[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
    memcpy(_slaveMac, broadcast, 6);
    esp_now_peer_info_t peer;
    memset(&peer, 0, sizeof(peer));
    memcpy(peer.peer_addr, broadcast, 6);
    peer.channel = 1;
    peer.encrypt = false;
    if (esp_now_add_peer(&peer) == ESP_OK) {
        _peerAdded = true;
    }
    Serial.println("[ESPNOW] Pairing réinitialisé — mode broadcast actif");
}

void EspNowMaster::update() {
    if (!_paired) {
        // Mode pairing : broadcast CMD_PAIRING_REQ toutes les 2s
        if (millis() - _lastPairingReq >= 2000) {
            _sendPairingReq();
        }
    } else {
        _checkHeartbeat();
    }
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

// ---- PAIRING ----

bool EspNowMaster::_addPeer(const uint8_t* mac) {
    // Peer unicast post-pairing : chiffrement AES-128-CCM avec LMK.
    // Cette méthode N'est appelée QUE pour le peer unicast (slave connu).
    // Le peer broadcast (mode pairing) reste en clair, géré inline dans
    // begin() et resetPairing() avec encrypt=false.
    esp_now_peer_info_t peer;
    memset(&peer, 0, sizeof(peer));
    memcpy(peer.peer_addr, mac, 6);
    peer.channel = 0;
    peer.encrypt = true;
    memcpy(peer.lmk, ESPNOW_LMK, 16);
    if (esp_now_add_peer(&peer) == ESP_OK) {
        _peerAdded = true;
        Serial.println("[ESPNOW] Peer unicast ajouté · chiffrement AES-128-CCM actif");
        return true;
    }
    Serial.println("[ESPNOW] Ajout peer ÉCHOUÉ");
    return false;
}

void EspNowMaster::_sendPairingReq() {
    if (!_peerAdded) return;
    CmdPairingReq req;
    req.header = Protocol::makeHeader((uint8_t)CmdType::CMD_PAIRING_REQ);
    req.deviceType = (uint8_t)DeviceType::MASTER;
    req.firmwareVersion = PROTOCOL_VERSION;
    _lastPairingReq = millis();
    static const uint8_t broadcast[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
    esp_now_send(broadcast, (const uint8_t*)&req, sizeof(req));
    Serial.println("[ESPNOW] → PAIRING_REQ (broadcast)");
}

void EspNowMaster::_handlePairingAck(const uint8_t* senderMac, const uint8_t* data, int len) {
    if (len < (int)sizeof(DataPairingAck)) {
        Serial.println("[ESPNOW] PAIRING_ACK trop court — ignoré");
        return;
    }

    const DataPairingAck* ack = (const DataPairingAck*)data;
    if (ack->deviceType != (uint8_t)DeviceType::SLAVE) {
        Serial.println("[ESPNOW] PAIRING_ACK: deviceType inattendu — ignoré");
        return;
    }

    // Sauvegarde du MAC esclave en NVS
    Preferences prefs;
    prefs.begin("espnow", false);
    prefs.putBytes("peerMac", senderMac, 6);
    prefs.end();

    // Passage du broadcast peer au peer unicast
    static const uint8_t broadcast[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
    esp_now_del_peer(broadcast);
    _peerAdded = false;

    memcpy(_slaveMac, senderMac, 6);
    _addPeer(_slaveMac);

    _paired = true;
    _commState = CommState::DISCONNECTED;

    Serial.printf("[ESPNOW] Pairing OK avec esclave %02X:%02X:%02X:%02X:%02X:%02X\n",
                  _slaveMac[0], _slaveMac[1], _slaveMac[2],
                  _slaveMac[3], _slaveMac[4], _slaveMac[5]);

    // Confirmation unicast vers l'esclave
    CmdPairingConfirm confirm;
    confirm.header = Protocol::makeHeader((uint8_t)CmdType::CMD_PAIRING_CONFIRM);
    _sendEspNow(&confirm, sizeof(confirm));
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
    if (_instance) _instance->_handleReceived(mac, data, len);
}

void EspNowMaster::_onDataSent(const uint8_t* mac, esp_now_send_status_t status) {
    if (status != ESP_NOW_SEND_SUCCESS) {
        Serial.println("[ESPNOW] Envoi non confirmé");
    }
}

void EspNowMaster::_handleReceived(const uint8_t* mac, const uint8_t* data, int len) {
    if (len < (int)sizeof(MsgHeader)) return;

    const MsgHeader* header = (const MsgHeader*)data;
    if (!Protocol::validateHeader(*header)) return;

    Serial.printf("[ESPNOW] ← %s (%d bytes)\n", Protocol::typeName(header->type), len);

    // Traitement du PAIRING_ACK en mode pairing (avant les autres messages)
    if (header->type == (uint8_t)DataType::DATA_PAIRING_ACK && !_paired) {
        _handlePairingAck(mac, data, len);
        return;
    }

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
