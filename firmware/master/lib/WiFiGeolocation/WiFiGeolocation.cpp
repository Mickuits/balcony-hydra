// ============================================================
// WiFiGeolocation — Implementation
// ============================================================

#include "WiFiGeolocation.h"
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// Mozilla Location Service — gratuit, pas de clé API requise
// Endpoint: https://location.services.mozilla.com/v1/geolocate?key=test
static const char* MLS_HOST = "location.services.mozilla.com";
static const char* MLS_PATH = "/v1/geolocate?key=test";
static const uint16_t MLS_PORT = 443;

// Minimum réseaux WiFi pour une géoloc fiable
static const uint8_t MIN_NETWORKS = 3;

// Max réseaux à inclure dans la requête (API limite ~50)
static const uint8_t MAX_NETWORKS = 20;

WiFiGeolocation::WiFiGeolocation() {
    memset(&_loc, 0, sizeof(GeoLocation));
    _loc.latitude = DEFAULT_LATITUDE;
    _loc.longitude = DEFAULT_LONGITUDE;
}

bool WiFiGeolocation::locate() {
    Serial.println("[GEO] Scan WiFi pour géolocalisation...");

    // Sauvegarder le mode WiFi actuel
    wifi_mode_t prevMode = WiFi.getMode();

    // Passer en mode STA pour le scan (si pas déjà)
    if (prevMode == WIFI_OFF) {
        WiFi.mode(WIFI_STA);
    }

    // Scanner les réseaux
    int n = WiFi.scanNetworks(false, true);  // sync, include hidden

    if (n < MIN_NETWORKS) {
        Serial.printf("[GEO] Seulement %d réseaux — insuffisant (min %d)\n", n, MIN_NETWORKS);
        WiFi.scanDelete();
        return false;
    }

    Serial.printf("[GEO] %d réseaux détectés, construction requête...\n", n);

    // Construire le payload JSON
    String payload = _buildScanPayload();
    WiFi.scanDelete();

    if (payload.isEmpty()) {
        Serial.println("[GEO] Payload vide — abandon");
        return false;
    }

    // Interroger l'API
    bool ok = _queryMozillaAPI(payload);

    if (ok) {
        _loc.timestamp = millis();
        Serial.printf("[GEO] ✅ Position: %.6f, %.6f (±%.0fm)\n",
                      _loc.latitude, _loc.longitude, _loc.accuracy);
        saveToNVS();
    } else {
        Serial.println("[GEO] ❌ Géolocalisation échouée — fallback defaults");
    }

    return ok;
}

String WiFiGeolocation::_buildScanPayload() {
    JsonDocument doc;
    JsonArray wifiArray = doc["wifiAccessPoints"].to<JsonArray>();

    int n = WiFi.scanComplete();
    if (n < 0) n = 0;

    uint8_t count = 0;
    for (int i = 0; i < n && count < MAX_NETWORKS; i++) {
        // Ignorer les réseaux avec BSSID invalide
        String bssid = WiFi.BSSIDstr(i);
        if (bssid.length() < 17) continue;

        JsonObject ap = wifiArray.add<JsonObject>();
        ap["macAddress"] = bssid;
        ap["signalStrength"] = WiFi.RSSI(i);
        ap["channel"] = WiFi.channel(i);
        count++;
    }

    if (count < MIN_NETWORKS) return "";

    String output;
    serializeJson(doc, output);
    return output;
}

bool WiFiGeolocation::_queryMozillaAPI(const String& payload) {
    WiFiClientSecure client;
    client.setInsecure();  // Skip cert verification (MLS is well-known)
    client.setTimeout(10000);

    Serial.printf("[GEO] Connexion à %s...\n", MLS_HOST);

    if (!client.connect(MLS_HOST, MLS_PORT)) {
        Serial.println("[GEO] Connexion HTTPS échouée");
        return false;
    }

    // Envoyer la requête POST
    client.printf("POST %s HTTP/1.1\r\n", MLS_PATH);
    client.printf("Host: %s\r\n", MLS_HOST);
    client.println("Content-Type: application/json");
    client.printf("Content-Length: %d\r\n", payload.length());
    client.println("Connection: close");
    client.println();
    client.print(payload);

    // Lire la réponse
    uint32_t timeout = millis() + 10000;
    while (client.connected() && !client.available()) {
        if (millis() > timeout) {
            Serial.println("[GEO] Timeout réponse API");
            client.stop();
            return false;
        }
        delay(10);
    }

    // Skip headers
    String line;
    while (client.available()) {
        line = client.readStringUntil('\n');
        if (line == "\r") break;
    }

    // Read body
    String body;
    while (client.available()) {
        body += client.readStringUntil('\n');
    }
    client.stop();

    if (body.isEmpty()) {
        Serial.println("[GEO] Réponse vide");
        return false;
    }

    return _parseResponse(body);
}

bool WiFiGeolocation::_parseResponse(const String& response) {
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, response);

    if (err) {
        Serial.printf("[GEO] Erreur parsing JSON: %s\n", err.c_str());
        return false;
    }

    // Mozilla API response: {"location": {"lat": 43.61, "lng": 6.99}, "accuracy": 50.0}
    if (!doc.containsKey("location")) {
        Serial.println("[GEO] Pas de champ 'location' dans la réponse");
        // Check for error
        if (doc.containsKey("error")) {
            Serial.printf("[GEO] Erreur API: %s\n",
                          doc["error"]["message"].as<const char*>());
        }
        return false;
    }

    _loc.latitude  = doc["location"]["lat"].as<float>();
    _loc.longitude = doc["location"]["lng"].as<float>();
    _loc.accuracy  = doc["accuracy"].as<float>();
    _loc.valid     = true;
    _loc.fromNVS   = false;

    // Sanity check
    if (_loc.latitude < -90 || _loc.latitude > 90 ||
        _loc.longitude < -180 || _loc.longitude > 180) {
        Serial.println("[GEO] Coordonnées hors limites");
        _loc.valid = false;
        return false;
    }

    return true;
}

// ---- NVS PERSISTENCE ----

void WiFiGeolocation::saveToNVS() {
    Preferences prefs;
    prefs.begin("geoloc", false);
    prefs.putFloat("lat", _loc.latitude);
    prefs.putFloat("lon", _loc.longitude);
    prefs.putFloat("acc", _loc.accuracy);
    prefs.putBool("valid", true);
    prefs.end();
    Serial.printf("[GEO] Position sauvée en NVS: %.6f, %.6f\n", _loc.latitude, _loc.longitude);
}

bool WiFiGeolocation::loadFromNVS() {
    Preferences prefs;
    prefs.begin("geoloc", true);

    if (!prefs.getBool("valid", false)) {
        prefs.end();
        return false;
    }

    _loc.latitude  = prefs.getFloat("lat", DEFAULT_LATITUDE);
    _loc.longitude = prefs.getFloat("lon", DEFAULT_LONGITUDE);
    _loc.accuracy  = prefs.getFloat("acc", 0);
    _loc.valid     = true;
    _loc.fromNVS   = true;
    prefs.end();

    Serial.printf("[GEO] Position chargée depuis NVS: %.6f, %.6f (±%.0fm)\n",
                  _loc.latitude, _loc.longitude, _loc.accuracy);
    return true;
}

void WiFiGeolocation::clearNVS() {
    Preferences prefs;
    prefs.begin("geoloc", false);
    prefs.clear();
    prefs.end();
    _loc.valid = false;
    Serial.println("[GEO] Position NVS effacée — re-géolocalisation au prochain boot");
}

String WiFiGeolocation::toJson() const {
    JsonDocument doc;
    doc["latitude"] = _loc.latitude;
    doc["longitude"] = _loc.longitude;
    doc["accuracy"] = _loc.accuracy;
    doc["valid"] = _loc.valid;
    doc["fromNVS"] = _loc.fromNVS;
    doc["source"] = _loc.valid ? (_loc.fromNVS ? "NVS (cached)" : "WiFi geoloc") : "default (Mougins)";
    String out;
    serializeJson(doc, out);
    return out;
}
