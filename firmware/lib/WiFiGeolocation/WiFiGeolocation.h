// ============================================================
// WiFiGeolocation — Géolocalisation automatique par WiFi
//
// Au premier boot ou sur demande:
//   1. Scan des réseaux WiFi (BSSID + RSSI)
//   2. Envoi à l'API Mozilla Location Service (gratuit, pas de clé)
//      ou Google Geolocation API (nécessite clé)
//   3. Réception lat/lon (~50-100m précision urbaine)
//   4. Stockage NVS (une seule fois)
//
// Suffisant pour le calcul solaire (1km erreur < 1min sur lever/coucher)
// Fallback: DEFAULT_LATITUDE/LONGITUDE de config.h (Mougins le Haut)
// ============================================================

#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <Preferences.h>
#include "config.h"

struct GeoLocation {
    float    latitude;
    float    longitude;
    float    accuracy;     // Précision estimée (mètres)
    bool     valid;        // true si géoloc réussie
    bool     fromNVS;      // true si chargé depuis NVS (pas frais)
    uint32_t timestamp;    // millis() de la dernière géoloc
};

class WiFiGeolocation {
public:
    WiFiGeolocation();

    // Tenter la géolocalisation (scan WiFi + API)
    // Bloquant (~5-10s). Appeler après WiFi.mode(WIFI_STA) mais avant WiFi.begin()
    // ou en mode WIFI_AP_STA
    bool locate();

    // Charger depuis NVS (instantané, pas de réseau requis)
    bool loadFromNVS();

    // Sauvegarder en NVS
    void saveToNVS();

    // Effacer NVS (force re-géolocalisation au prochain boot)
    void clearNVS();

    // Résultat
    const GeoLocation& location() const { return _loc; }
    float latitude() const { return _loc.valid ? _loc.latitude : DEFAULT_LATITUDE; }
    float longitude() const { return _loc.valid ? _loc.longitude : DEFAULT_LONGITUDE; }
    bool isValid() const { return _loc.valid; }

    // JSON
    String toJson() const;

private:
    GeoLocation _loc;

    // Scan WiFi et construire le JSON pour l'API
    String _buildScanPayload();

    // Appeler l'API Mozilla Location Service
    bool _queryMozillaAPI(const String& payload);

    // Parser la réponse JSON
    bool _parseResponse(const String& response);
};
