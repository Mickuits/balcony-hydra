// ============================================================
// EspNowSlave — Réception commandes maître + envoi données
// ============================================================

#pragma once

#include <Arduino.h>
#include <esp_now.h>
#include <WiFi.h>
#include "Protocol.h"        // path injecté via -I$PROJECT_DIR/../common
#include "config_common.h"   // ESPNOW_PING_INTERVAL_MS, ESPNOW_MAX_MISSED_PONGS

enum class SlaveCommState : uint8_t {
    WAITING_MASTER  = 0,
    CONNECTED       = 1,
    MASTER_LOST     = 2   // → DegradedMode prend le relais
};

// Callbacks pour actions à exécuter par le main esclave
struct SlaveCallbacks {
    void (*onPumpStart)(uint16_t durationS);
    void (*onPumpStop)(uint8_t reason);
    void (*onReadSensors)();
    void (*onSetConfig)(const CmdSetConfig& cfg);
    void (*onReboot)(uint32_t delayMs);
};

class EspNowSlave {
public:
    EspNowSlave();
    // Charge le MAC maître depuis NVS (namespace "espnow", clé "peerMac").
    // Si absent → mode pairing actif (écoute en broadcast).
    void begin();
    void update();

    // Send data to master
    bool sendPong(uint32_t uptime, uint16_t battMV, int8_t rssi, uint8_t mode, uint8_t pumpState, uint8_t failsafe);
    bool sendSensors(const DataSensors& data);
    bool sendPumpStatus(const DataPumpStatus& status);
    bool sendAck(uint8_t cmdType, uint8_t seqNum, bool success, const char* msg = "");
    bool sendAlert(AlertType type, const char* message);

    // État pairing
    bool isPaired() const { return _paired; }
    // Efface le MAC persisté (NVS) et redémarre le mode pairing (debug/reset)
    void resetPairing();

    // State
    SlaveCommState commState() const { return _commState; }
    bool           isMasterConnected() const { return _commState == SlaveCommState::CONNECTED; }
    bool           isMasterLost() const { return _commState == SlaveCommState::MASTER_LOST; }
    uint32_t       lastMasterContactMs() const { return _lastMasterMsg; }

    // Register callbacks
    void setCallbacks(SlaveCallbacks cb) { _callbacks = cb; }

private:
    uint8_t         _masterMac[6];
    bool            _peerAdded;
    SlaveCommState  _commState;
    uint32_t        _lastMasterMsg;
    uint8_t         _missedPings;
    SlaveCallbacks  _callbacks;

    // Pairing dynamique
    bool            _paired;

    bool _send(const void* data, size_t len);
    void _checkMasterTimeout();

    // Pairing
    bool _addPeer(const uint8_t* mac);
    void _handlePairingReq(const uint8_t* senderMac, const uint8_t* data, int len);

    static EspNowSlave* _instance;
    static void _onDataRecv(const uint8_t* mac, const uint8_t* data, int len);
    void _handleReceived(const uint8_t* mac, const uint8_t* data, int len);
};
