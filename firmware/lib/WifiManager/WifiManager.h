// ============================================================
// WifiManager — WiFi AP (config) + STA (normal operation)
// ============================================================

#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <DNSServer.h>
#include "ConfigManager.h"

enum class WifiState : uint8_t {
    DISCONNECTED = 0,
    CONNECTING   = 1,
    CONNECTED    = 2,
    AP_MODE      = 3
};

class WifiManager {
public:
    WifiManager(ConfigManager& configMgr);
    
    void begin();
    void update();  // Handle DNS in AP mode, reconnection
    
    WifiState state() const { return _state; }
    bool isConnected() const { return _state == WifiState::CONNECTED; }
    bool isAPMode() const { return _state == WifiState::AP_MODE; }
    
    String localIP() const;
    String apIP() const;
    int8_t rssi() const;
    
    void startAP();
    void startSTA();
    void disconnect();
    
    // Force AP mode (e.g., from button press or web command)
    void forceAPMode();

private:
    ConfigManager& _configMgr;
    WifiState _state;
    DNSServer _dns;
    
    uint32_t _lastConnectAttempt;
    uint8_t  _connectRetries;
    static const uint8_t MAX_RETRIES = 3;
    static const uint32_t RETRY_INTERVAL_MS = 10000;
    
    bool _hasCredentials() const;
    void _onConnected();
    void _onDisconnected();
};
