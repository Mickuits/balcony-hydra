// ============================================================
// EspNowMaster — Communication maître vers esclave
// ESP-NOW primaire + MQTT fallback
// ============================================================

#pragma once

#include <Arduino.h>
#include <esp_now.h>
#include <WiFi.h>
#include "../../common/Protocol.h"
#include "../../common/config_common.h"

enum class CommState : uint8_t {
    DISCONNECTED = 0,
    ESPNOW_OK    = 1,
    MQTT_FALLBACK = 2,
    DEGRADED     = 3   // Both failed
};

class EspNowMaster {
public:
    EspNowMaster();
    void begin(const uint8_t* slaveMac);
    void update();

    // Send commands to slave
    bool sendPing();
    bool sendReadSensors();
    bool sendPumpStart(uint16_t durationS);
    bool sendPumpStop(uint8_t reason = 0);
    bool sendSetConfig(const CmdSetConfig& cfg);
    bool sendReboot(uint32_t delayMs = 0);

    // Latest data from slave
    const DataSensors&    lastSensors() const { return _lastSensors; }
    const DataPumpStatus& lastPumpStatus() const { return _lastPumpStatus; }
    const DataPong&       lastPong() const { return _lastPong; }
    bool                  hasNewSensorData() const { return _newSensorData; }
    void                  clearNewSensorData() { _newSensorData = false; }

    // Connection state
    CommState  commState() const { return _commState; }
    bool       isConnected() const { return _commState == CommState::ESPNOW_OK || _commState == CommState::MQTT_FALLBACK; }
    uint8_t    missedPongs() const { return _missedPongs; }
    int8_t     lastRssi() const { return _lastPong.rssi; }
    bool       isSlaveInDegradedMode() const { return _lastPong.mode == 1; }

    // Alert callback
    typedef void (*AlertCallback)(const DataAlert& alert);
    void onSlaveAlert(AlertCallback cb) { _alertCb = cb; }

    // JSON
    String toJson() const;

private:
    uint8_t   _slaveMac[6];
    bool      _peerAdded;
    CommState _commState;
    uint8_t   _missedPongs;
    uint32_t  _lastPingSent;
    uint32_t  _lastPongReceived;
    bool      _newSensorData;

    DataSensors    _lastSensors;
    DataPumpStatus _lastPumpStatus;
    DataPong       _lastPong;

    AlertCallback _alertCb = nullptr;

    bool _sendEspNow(const void* data, size_t len);
    void _checkHeartbeat();

    // ESP-NOW callbacks (static, routed to instance)
    static EspNowMaster* _instance;
    static void _onDataRecv(const uint8_t* mac, const uint8_t* data, int len);
    static void _onDataSent(const uint8_t* mac, esp_now_send_status_t status);
    void _handleReceived(const uint8_t* data, int len);
};
