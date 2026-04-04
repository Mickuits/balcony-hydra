// ============================================================
// PlantProfile — Implementation
// ============================================================

#include "PlantProfile.h"
#include <Preferences.h>
#include <math.h>

PlantProfile::PlantProfile() {
    memset(_profiles, 0, sizeof(_profiles));
    memset(_history, 0, sizeof(_history));
    memset(_configured, 0, sizeof(_configured));
}

void PlantProfile::begin() {
    load();
    uint8_t count = 0;
    for (uint8_t z = 0; z < NUM_ZONES; z++)
        for (uint8_t p = 0; p < 10; p++)
            if (_configured[z][p]) count++;
    Serial.printf("[PROFILE] %d profils chargés depuis NVS.\n", count);
}

// ---- CRUD ----

void PlantProfile::setProfile(uint8_t zone, uint8_t potIdx, const PlantProfileData& profile) {
    if (zone >= NUM_ZONES || potIdx >= 10) return;
    _profiles[zone][potIdx] = profile;
    _profiles[zone][potIdx].zone = zone;
    _profiles[zone][potIdx].potIndex = potIdx;
    _configured[zone][potIdx] = true;
    Serial.printf("[PROFILE] Profil Z%d P%d: %s (%s, pot %.1fL, goutteur %.1fL/h)\n",
                  zone, potIdx, profile.name,
                  profile.category == PlantCategory::CITRUS ? "Agrume" :
                  profile.category == PlantCategory::AROMATIC ? "Aromate" :
                  profile.category == PlantCategory::SUCCULENT ? "Succulente" :
                  profile.category == PlantCategory::TROPICAL ? "Tropicale" :
                  profile.category == PlantCategory::MEDITERRANEAN ? "Méditerranéenne" :
                  profile.category == PlantCategory::FLOWERING ? "Fleurie" : "Custom",
                  profile.potVolumeLiters, profile.dripperFlowLH);
}

const PlantProfileData& PlantProfile::getProfile(uint8_t zone, uint8_t potIdx) const {
    return _profiles[zone < NUM_ZONES ? zone : 0][potIdx < 10 ? potIdx : 0];
}

bool PlantProfile::hasProfile(uint8_t zone, uint8_t potIdx) const {
    if (zone >= NUM_ZONES || potIdx >= 10) return false;
    return _configured[zone][potIdx];
}

// ---- SAISONNALITÉ ----

float PlantProfile::seasonalCoeff(uint8_t zone, uint8_t potIdx, uint8_t month) const {
    if (zone >= NUM_ZONES || potIdx >= 10 || month > 11) return 1.0;
    if (!_configured[zone][potIdx]) return 1.0;

    const auto& p = _profiles[zone][potIdx];
    uint8_t cat = static_cast<uint8_t>(p.category);

    if (p.category == PlantCategory::CUSTOM) {
        return p.customCoeff[month];
    }

    if (cat < sizeof(SEASONAL_COEFF) / sizeof(SEASONAL_COEFF[0])) {
        return SEASONAL_COEFF[cat][month];
    }
    return 1.0;
}

float PlantProfile::currentSeasonalCoeff(uint8_t zone, uint8_t potIdx) const {
    struct tm t;
    if (getLocalTime(&t, 100)) {
        return seasonalCoeff(zone, potIdx, t.tm_mon);
    }
    return 0.7;  // Default safe: 70% du max
}

// ---- CALCUL VOLUME D'EAU ----

uint16_t PlantProfile::computeWaterVolumeML(uint8_t zone, uint8_t potIdx, uint8_t month) const {
    if (zone >= NUM_ZONES || potIdx >= 10) return 200;
    if (!_configured[zone][potIdx]) return 200;  // Default 200mL

    const auto& p = _profiles[zone][potIdx];
    uint8_t cat = static_cast<uint8_t>(p.category);

    // Base volume pour cette catégorie (référence: pot 10L, août)
    float baseML = (cat < sizeof(BASE_WATER_ML) / sizeof(BASE_WATER_ML[0]))
                   ? BASE_WATER_ML[cat] : 200.0;

    // Ajustement volume pot (proportionnel, mais pas linéaire — racine carrée)
    // Un pot 5L n'a pas besoin de 2× moins qu'un pot 10L, plutôt ~70%
    float potRatio = sqrt(p.potVolumeLiters / 10.0);
    if (potRatio < 0.3) potRatio = 0.3;
    if (potRatio > 3.0) potRatio = 3.0;

    // Coefficient saisonnier
    float coeff = seasonalCoeff(zone, potIdx, month);

    float volumeML = baseML * potRatio * coeff;

    // Plancher: jamais moins de 20mL (sinon pompe tourne pour rien)
    if (volumeML < 20.0) volumeML = 20.0;

    // Plafond: jamais plus de 2000mL par cycle (sécurité anti-inondation)
    if (volumeML > 2000.0) volumeML = 2000.0;

    return (uint16_t)volumeML;
}

// ---- CALCUL DURÉE DE CYCLE ----

uint16_t PlantProfile::computeCycleDurationS(uint8_t zone, uint8_t potIdx, uint8_t month) const {
    if (zone >= NUM_ZONES || potIdx >= 10) return 60;
    if (!_configured[zone][potIdx]) return 60;

    const auto& p = _profiles[zone][potIdx];
    uint16_t volumeML = computeWaterVolumeML(zone, potIdx, month);

    // Durée = volume / débit
    // débit en L/h → mL/s = dripperFlowLH * 1000 / 3600
    float flowMLperS = p.dripperFlowLH * 1000.0 / 3600.0;
    if (flowMLperS < 0.1) flowMLperS = 0.1;  // Protection div/0

    float durationS = (float)volumeML / flowMLperS;

    // Plancher: 5s minimum (sinon pas le temps d'amorcer)
    if (durationS < 5.0) durationS = 5.0;

    // Plafond: PUMP_MAX_RUNTIME_S (300s)
    if (durationS > PUMP_MAX_RUNTIME_S) durationS = PUMP_MAX_RUNTIME_S;

    return (uint16_t)durationS;
}

uint16_t PlantProfile::computeZoneCycleDurationS(uint8_t zone, uint8_t month) const {
    // La durée de cycle d'une zone est le MAX des durées de tous les pots
    // Car tous les goutteurs tournent en même temps, il faut que le plus
    // gourmand reçoive sa dose complète
    uint16_t maxDuration = 30;  // Minimum 30s par défaut

    for (uint8_t p = 0; p < 10; p++) {
        if (!_configured[zone][p]) continue;
        uint16_t d = computeCycleDurationS(zone, p, month);
        if (d > maxDuration) maxDuration = d;
    }

    return maxDuration;
}

// ---- APPRENTISSAGE TAUX D'ASSÈCHEMENT ----

void PlantProfile::recordHumidity(uint8_t zone, uint8_t potIdx, uint8_t humidity, uint32_t timestamp) {
    if (zone >= NUM_ZONES || potIdx >= 10) return;
    auto& h = _history[zone][potIdx];

    h.humidity[h.writeIndex] = humidity;
    h.timestamp[h.writeIndex] = timestamp;
    h.writeIndex = (h.writeIndex + 1) % DRYING_HISTORY_SIZE;
    if (h.count < DRYING_HISTORY_SIZE) h.count++;
}

void PlantProfile::updateDryingRate(uint8_t zone, uint8_t potIdx) {
    if (zone >= NUM_ZONES || potIdx >= 10) return;
    auto& h = _history[zone][potIdx];
    auto& p = _profiles[zone][potIdx];

    if (h.count < 6) return;  // Pas assez de données

    // Régression linéaire simple: humidité = a * temps + b
    // On cherche 'a' (pente = taux d'assèchement en %/ms)
    float sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    uint8_t n = h.count;

    // Trouver le timestamp de référence (le plus ancien)
    uint8_t oldest = (h.writeIndex - h.count + DRYING_HISTORY_SIZE) % DRYING_HISTORY_SIZE;
    uint32_t t0 = h.timestamp[oldest];

    for (uint8_t i = 0; i < n; i++) {
        uint8_t idx = (oldest + i) % DRYING_HISTORY_SIZE;
        float x = (float)(h.timestamp[idx] - t0) / 3600000.0;  // Heures
        float y = (float)h.humidity[idx];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
    }

    float denom = n * sumX2 - sumX * sumX;
    if (fabs(denom) < 0.001) return;  // Pas assez de variation temporelle

    float slope = (n * sumXY - sumX * sumY) / denom;

    // slope est négatif (humidité diminue avec le temps)
    // On stocke en valeur absolue: %/heure perdu
    p.dryingRatePctPerHour = -slope;

    // Sanity check: le taux doit être entre 0.1 et 20 %/h
    if (p.dryingRatePctPerHour < 0.1) p.dryingRatePctPerHour = 0.1;
    if (p.dryingRatePctPerHour > 20.0) p.dryingRatePctPerHour = 20.0;

    Serial.printf("[PROFILE] Z%d P%d %s: taux assèchement appris = %.2f %%/h (n=%d)\n",
                  zone, potIdx, p.name, p.dryingRatePctPerHour, n);
}

// ---- SEUIL EFFECTIF ----

uint8_t PlantProfile::effectiveMinThreshold(uint8_t zone, uint8_t potIdx, uint8_t globalMin) const {
    if (zone >= NUM_ZONES || potIdx >= 10) return globalMin;
    if (!_configured[zone][potIdx]) return globalMin;
    uint8_t override = _profiles[zone][potIdx].moistureMinOverride;
    return (override > 0) ? override : globalMin;
}

// ---- NVS PERSISTENCE ----

void PlantProfile::save() {
    Preferences prefs;
    prefs.begin("profiles", false);

    for (uint8_t z = 0; z < NUM_ZONES; z++) {
        for (uint8_t p = 0; p < 10; p++) {
            String key = "p" + String(z) + String(p);
            if (_configured[z][p]) {
                prefs.putBytes(key.c_str(), &_profiles[z][p], sizeof(PlantProfileData));
            } else {
                prefs.remove(key.c_str());
            }
        }
    }

    prefs.end();
    Serial.println("[PROFILE] Profils sauvegardés en NVS.");
}

void PlantProfile::load() {
    Preferences prefs;
    prefs.begin("profiles", true);

    for (uint8_t z = 0; z < NUM_ZONES; z++) {
        for (uint8_t p = 0; p < 10; p++) {
            String key = "p" + String(z) + String(p);
            if (prefs.isKey(key.c_str())) {
                prefs.getBytes(key.c_str(), &_profiles[z][p], sizeof(PlantProfileData));
                _configured[z][p] = true;
            }
        }
    }

    prefs.end();
}

void PlantProfile::factoryReset() {
    Preferences prefs;
    prefs.begin("profiles", false);
    prefs.clear();
    prefs.end();
    memset(_profiles, 0, sizeof(_profiles));
    memset(_configured, 0, sizeof(_configured));
    memset(_history, 0, sizeof(_history));
    Serial.println("[PROFILE] Profils effacés.");
}

// ---- JSON ----

String PlantProfile::profileToJson(uint8_t zone, uint8_t potIdx) const {
    if (zone >= NUM_ZONES || potIdx >= 10) return "{}";
    if (!_configured[zone][potIdx]) return "{}";

    const auto& p = _profiles[zone][potIdx];
    JsonDocument doc;

    doc["name"] = p.name;
    doc["zone"] = zone;
    doc["pot"] = potIdx;
    doc["category"] = static_cast<uint8_t>(p.category);
    const char* catNames[] = {"Custom","Agrume","Aromate","Succulente","Tropicale","Méditerranéenne","Fleurie"};
    doc["categoryName"] = catNames[static_cast<uint8_t>(p.category)];
    doc["potVolume_L"] = p.potVolumeLiters;
    doc["dripperFlow_LH"] = p.dripperFlowLH;
    doc["moistureMinOverride"] = p.moistureMinOverride;
    doc["dryingRate_pctH"] = p.dryingRatePctPerHour;

    // Current month calculation
    struct tm t;
    if (getLocalTime(&t, 100)) {
        uint8_t month = t.tm_mon;
        doc["currentCoeff"] = seasonalCoeff(zone, potIdx, month);
        doc["currentWaterML"] = computeWaterVolumeML(zone, potIdx, month);
        doc["currentCycleS"] = computeCycleDurationS(zone, potIdx, month);
    }

    // 12 months coefficients
    JsonArray coeffs = doc["monthlyCoeff"].to<JsonArray>();
    for (uint8_t m = 0; m < 12; m++) {
        coeffs.add(seasonalCoeff(zone, potIdx, m));
    }

    String out;
    serializeJson(doc, out);
    return out;
}

String PlantProfile::toJson() const {
    JsonDocument doc;
    const char* zoneNames[] = {"balcon", "interieur"};

    for (uint8_t z = 0; z < NUM_ZONES; z++) {
        JsonArray arr = doc[zoneNames[z]].to<JsonArray>();
        for (uint8_t p = 0; p < 10; p++) {
            if (!_configured[z][p]) continue;
            JsonObject obj = arr.add<JsonObject>();
            const auto& pr = _profiles[z][p];
            obj["pot"] = p;
            obj["name"] = pr.name;
            obj["category"] = static_cast<uint8_t>(pr.category);
            obj["potVolume"] = pr.potVolumeLiters;
            obj["dripper"] = pr.dripperFlowLH;
            obj["dryingRate"] = pr.dryingRatePctPerHour;
        }
    }

    String out;
    serializeJson(doc, out);
    return out;
}
