// ============================================================
// EspNowSlave — Implementation
// ============================================================

#include "EspNowSlave.h"
#include <Preferences.h>

EspNowSlave* EspNowSlave::_instance = nullptr;

EspNowSlave::EspNowSlave()
    : _peerAdded(false), _commState(SlaveCommState::WAITING_MASTER),
      _lastMasterMsg(0), _missedPings(0), _paired(false) {
    memset(_masterMac, 0, 6);
    memset(&_callbacks, 0, sizeof(SlaveCallbacks));
    _instance = this;
}

void EspNowSlave::begin() {
    WiFi.mode(WIFI_STA);

    // Lecture du MAC maître persisté en NVS (namespace "espnow", clé "peerMac")
    Preferences prefs;
    prefs.begin("espnow", true);  // read-only
    size_t loaded = prefs.getBytes("peerMac", _masterMac, 6);
    prefs.end();

    if (esp_now_init() != ESP_OK) {
        Serial.println("[SLAVE-NOW] Init FAILED");
        return;
    }

    // Set PMK (Primary Master Key) — identique côté master via config_common.h.
    // Doit être appelé AVANT esp_now_add_peer pour les peers chiffrés.
    if (esp_now_set_pmk(ESPNOW_PMK) != ESP_OK) {
        Serial.println("[SLAVE-NOW] set_pmk FAILED — chiffrement indisponible");
    } else {
        Serial.println("[SLAVE-NOW] PMK set · AES-128-CCM activé sur unicast post-pairing");
    }

    esp_now_register_recv_cb(_onDataRecv);

    if (loaded == 6) {
        // MAC maître connu — ajout du peer en unicast, mode normal
        _paired = true;
        if (_addPeer(_masterMac)) {
            Serial.printf("[SLAVE-NOW] Peer maître restauré depuis NVS: %02X:%02X:%02X:%02X:%02X:%02X\n",
                          _masterMac[0], _masterMac[1], _masterMac[2],
                          _masterMac[3], _masterMac[4], _masterMac[5]);
        }
    } else {
        // Premier boot ou NVS effacé — mode pairing actif (écoute en broadcast)
        // Pas besoin d'ajouter un peer broadcast pour recevoir : ESP-NOW reçoit
        // les broadcasts sans peer ajouté. On ajoute le broadcast uniquement
        // pour pouvoir envoyer le DATA_PAIRING_ACK en retour.
        _paired = false;
        static const uint8_t broadcast[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
        memcpy(_masterMac, broadcast, 6);
        esp_now_peer_info_t peer;
        memset(&peer, 0, sizeof(peer));
        memcpy(peer.peer_addr, broadcast, 6);
        peer.channel = 1;
        peer.encrypt = false;
        if (esp_now_add_peer(&peer) == ESP_OK) {
            _peerAdded = true;
        }
        Serial.println("[SLAVE-NOW] Mode pairing actif, attente du maître...");
    }
}

void EspNowSlave::resetPairing() {
    // Supprime le MAC persisté et redémarre en mode pairing (debug/re-pairing)
    Preferences prefs;
    prefs.begin("espnow", false);
    prefs.remove("peerMac");
    prefs.end();
    _paired = false;
    _peerAdded = false;
    esp_now_del_peer(_masterMac);
    static const uint8_t broadcast[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
    memcpy(_masterMac, broadcast, 6);
    esp_now_peer_info_t peer;
    memset(&peer, 0, sizeof(peer));
    memcpy(peer.peer_addr, broadcast, 6);
    peer.channel = 1;
    peer.encrypt = false;
    if (esp_now_add_peer(&peer) == ESP_OK) {
        _peerAdded = true;
    }
    Serial.println("[SLAVE-NOW] Pairing réinitialisé — mode broadcast actif");
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

// ---- PAIRING ----

bool EspNowSlave::_addPeer(const uint8_t* mac) {
    // Peer unicast post-pairing : chiffrement AES-128-CCM avec LMK.
    // Cette méthode N'est appelée QUE pour le peer unicast (master connu).
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
        Serial.println("[SLAVE-NOW] Peer unicast ajouté · chiffrement AES-128-CCM actif");
        return true;
    }
    Serial.println("[SLAVE-NOW] Ajout peer ÉCHOUÉ");
    return false;
}

void EspNowSlave::_handlePairingReq(const uint8_t* senderMac, const uint8_t* data, int len) {
    if (len < (int)sizeof(CmdPairingReq)) {
        Serial.println("[SLAVE-NOW] PAIRING_REQ trop court — ignoré");
        return;
    }

    const CmdPairingReq* req = (const CmdPairingReq*)data;
    if (req->deviceType != (uint8_t)DeviceType::MASTER) {
        Serial.println("[SLAVE-NOW] PAIRING_REQ: deviceType inattendu — ignoré");
        return;
    }

    // Sauvegarde du MAC maître en NVS
    Preferences prefs;
    prefs.begin("espnow", false);
    prefs.putBytes("peerMac", senderMac, 6);
    prefs.end();

    // Passage du broadcast peer au peer unicast maître
    static const uint8_t broadcast[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
    esp_now_del_peer(broadcast);
    _peerAdded = false;

    memcpy(_masterMac, senderMac, 6);
    _addPeer(_masterMac);

    _paired = true;

    Serial.printf("[SLAVE-NOW] Pairing OK avec maître %02X:%02X:%02X:%02X:%02X:%02X\n",
                  _masterMac[0], _masterMac[1], _masterMac[2],
                  _masterMac[3], _masterMac[4], _masterMac[5]);

    // Réponse DATA_PAIRING_ACK en unicast vers le maître
    DataPairingAck ack;
    ack.header = Protocol::makeHeader((uint8_t)DataType::DATA_PAIRING_ACK);
    ack.deviceType = (uint8_t)DeviceType::SLAVE;
    ack.firmwareVersion = PROTOCOL_VERSION;
    _send(&ack, sizeof(ack));
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
    if (_instance) _instance->_handleReceived(mac, data, len);
}

void EspNowSlave::_handleReceived(const uint8_t* mac, const uint8_t* data, int len) {
    if (len < (int)sizeof(MsgHeader)) return;

    const MsgHeader* header = (const MsgHeader*)data;
    if (!Protocol::validateHeader(*header)) return;

    // Traitement du PAIRING_REQ en mode pairing (avant les autres messages)
    if (header->type == (uint8_t)CmdType::CMD_PAIRING_REQ && !_paired) {
        _handlePairingReq(mac, data, len);
        return;
    }

    // CMD_PAIRING_CONFIRM : le maître confirme le pairing — rien à faire, déjà paired
    if (header->type == (uint8_t)CmdType::CMD_PAIRING_CONFIRM) {
        Serial.println("[SLAVE-NOW] Pairing confirmé par le maître");
        return;
    }

    _lastMasterMsg = millis();
    _missedPings = 0;

    // If we were lost, we're back
    if (_commState == SlaveCommState::MASTER_LOST) {
        _commState = SlaveCommState::CONNECTED;
        Serial.println("[SLAVE-NOW] Maitre reconnecte — sortie mode degrade");
    } else if (_commState == SlaveCommState::WAITING_MASTER) {
        _commState = SlaveCommState::CONNECTED;
        Serial.println("[SLAVE-NOW] Premier contact maitre etabli");
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
