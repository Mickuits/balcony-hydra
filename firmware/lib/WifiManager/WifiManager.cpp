// ============================================================
// WifiManager — Implementation
// ============================================================

#include "WifiManager.h"

WifiManager::WifiManager(ConfigManager& configMgr)
    : _configMgr(configMgr), _state(WifiState::DISCONNECTED),
      _lastConnectAttempt(0), _connectRetries(0) {}

void WifiManager::begin() {
    WiFi.mode(WIFI_OFF);
    delay(100);
    
    if (_hasCredentials()) {
        Serial.println("[WIFI] Credentials trouvés, tentative connexion STA...");
        startSTA();
    } else {
        Serial.println("[WIFI] Pas de credentials WiFi, démarrage AP...");
        startAP();
    }
}

void WifiManager::update() {
    switch (_state) {
        case WifiState::AP_MODE:
            _dns.processNextRequest();
            break;
            
        case WifiState::CONNECTING:
            if (WiFi.status() == WL_CONNECTED) {
                _onConnected();
            } else if (millis() - _lastConnectAttempt > RETRY_INTERVAL_MS) {
                _connectRetries++;
                if (_connectRetries >= MAX_RETRIES) {
                    Serial.println("[WIFI] Échec connexion après 3 tentatives → mode AP");
                    startAP();
                } else {
                    Serial.printf("[WIFI] Tentative %d/%d...\n", _connectRetries + 1, MAX_RETRIES);
                    _lastConnectAttempt = millis();
                }
            }
            break;
            
        case WifiState::CONNECTED:
            if (WiFi.status() != WL_CONNECTED) {
                _onDisconnected();
            }
            break;
            
        case WifiState::DISCONNECTED:
            // Auto-reconnect after delay
            if (_hasCredentials() && millis() - _lastConnectAttempt > 30000) {
                startSTA();
            }
            break;
    }
}

void WifiManager::startAP() {
    WiFi.disconnect(true);
    delay(100);
    WiFi.mode(WIFI_AP);
    
    const auto& net = _configMgr.config().network;
    WiFi.softAP(net.apSsid, net.apPass);
    
    // DNS captive portal — redirect all domains to AP IP
    _dns.start(53, "*", WiFi.softAPIP());
    
    _state = WifiState::AP_MODE;
    Serial.printf("[WIFI] Mode AP démarré: %s (IP: %s)\n",
                  net.apSsid, WiFi.softAPIP().toString().c_str());
}

void WifiManager::startSTA() {
    if (!_hasCredentials()) {
        Serial.println("[WIFI] Pas de SSID configuré, impossible de connecter.");
        return;
    }
    
    WiFi.disconnect(true);
    delay(100);
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    
    const auto& net = _configMgr.config().network;
    WiFi.begin(net.wifiSsid, net.wifiPass);
    
    _state = WifiState::CONNECTING;
    _connectRetries = 0;
    _lastConnectAttempt = millis();
    
    Serial.printf("[WIFI] Connexion à '%s'...\n", net.wifiSsid);
    
    // Blocking wait (max 10s) for initial connection
    uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
        delay(250);
        Serial.print(".");
    }
    Serial.println();
    
    if (WiFi.status() == WL_CONNECTED) {
        _onConnected();
    }
}

void WifiManager::disconnect() {
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
    _state = WifiState::DISCONNECTED;
    Serial.println("[WIFI] Déconnecté.");
}

void WifiManager::forceAPMode() {
    Serial.println("[WIFI] Passage forcé en mode AP...");
    _dns.stop();
    WiFi.disconnect(true);
    delay(200);
    startAP();
}

String WifiManager::localIP() const {
    if (_state == WifiState::CONNECTED) return WiFi.localIP().toString();
    if (_state == WifiState::AP_MODE) return WiFi.softAPIP().toString();
    return "0.0.0.0";
}

String WifiManager::apIP() const {
    return WiFi.softAPIP().toString();
}

int8_t WifiManager::rssi() const {
    return (_state == WifiState::CONNECTED) ? WiFi.RSSI() : 0;
}

bool WifiManager::_hasCredentials() const {
    return strlen(_configMgr.config().network.wifiSsid) > 0;
}

void WifiManager::_onConnected() {
    _state = WifiState::CONNECTED;
    _connectRetries = 0;
    
    // Sync NTP
    configTime(3600, 3600, "pool.ntp.org", "time.nist.gov");
    
    Serial.printf("[WIFI] Connecté! IP: %s, RSSI: %ddBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
}

void WifiManager::_onDisconnected() {
    _state = WifiState::DISCONNECTED;
    _lastConnectAttempt = millis();
    Serial.println("[WIFI] Connexion perdue. Reconnexion dans 30s...");
}
