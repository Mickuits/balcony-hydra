// ============================================================
// PlantProfile — Profil hydrique par plante
//
// Chaque pot a un profil:
//   - Espèce / catégorie (citronnier, succulente, aromate...)
//   - Volume pot (litres)
//   - Débit goutteur installé (L/h)
//   - Coefficient de besoin hydrique mensuel (12 mois)
//   - Seuil humidité spécifique (override du seuil global)
//   - Taux d'assèchement appris (% perdu par heure)
//
// Le système APPREND le taux d'assèchement réel en mesurant
// la dérive d'humidité entre deux arrosages (régression linéaire
// sur les N dernières mesures). Ce taux varie avec la saison,
// la T°, et l'exposition — d'où l'apprentissage continu.
// ============================================================

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include "config.h"

// Catégories prédéfinies avec coefficients saisonniers mensuels
// Coefficient = multiplicateur du besoin en eau vs référence été (août = 1.0)
// Mois: Jan  Fév  Mar  Avr  Mai  Jun  Jul  Aoû  Sep  Oct  Nov  Déc
enum class PlantCategory : uint8_t {
    CUSTOM       = 0,  // Profil personnalisé
    CITRUS       = 1,  // Citronnier, oranger, mandarinier
    AROMATIC     = 2,  // Basilic, thym, romarin, menthe
    SUCCULENT    = 3,  // Grasses, cactus, aloe
    TROPICAL     = 4,  // Ficus, monstera, pothos
    MEDITERRANEAN= 5,  // Lavande, olivier, laurier
    FLOWERING    = 6   // Géranium, pétunias, bougainvillier
};

// Coefficients saisonniers prédéfinis (Mougins le Haut, 43.61°N)
// Index 0=Jan, 11=Déc. Valeur 1.0 = besoin max (août)
static const float SEASONAL_COEFF[][12] = {
    // CUSTOM: flat 1.0 (user override)
    {1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0},
    // CITRUS: gros buveur été, quasi rien hiver
    {0.10, 0.12, 0.25, 0.40, 0.65, 0.85, 0.95, 1.00, 0.75, 0.45, 0.20, 0.10},
    // AROMATIC: modéré, été actif
    {0.15, 0.15, 0.30, 0.50, 0.70, 0.90, 1.00, 1.00, 0.70, 0.40, 0.20, 0.15},
    // SUCCULENT: très peu, même en été
    {0.05, 0.05, 0.10, 0.15, 0.25, 0.35, 0.40, 0.40, 0.30, 0.15, 0.08, 0.05},
    // TROPICAL (intérieur, T° stable): relativement constant
    {0.50, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00, 1.00, 0.85, 0.70, 0.55, 0.50},
    // MEDITERRANEAN: résistant sécheresse, modéré
    {0.10, 0.10, 0.20, 0.35, 0.55, 0.75, 0.90, 1.00, 0.65, 0.35, 0.15, 0.10},
    // FLOWERING: gourmand en pleine floraison été
    {0.10, 0.12, 0.30, 0.50, 0.75, 0.95, 1.00, 1.00, 0.70, 0.35, 0.15, 0.10},
};

// Volume d'eau de référence par catégorie (mL par cycle, en août, pot 10L)
// Sert de base × coefficient saisonnier × ratio volume pot
static const uint16_t BASE_WATER_ML[] = {
    200,   // CUSTOM (default)
    500,   // CITRUS (gros buveur)
    200,   // AROMATIC
    50,    // SUCCULENT
    250,   // TROPICAL
    150,   // MEDITERRANEAN
    300,   // FLOWERING
};

// Historique d'humidité pour apprentissage du taux d'assèchement
constexpr uint8_t DRYING_HISTORY_SIZE = 24;  // 24 échantillons (12h à 30min/échantillon)

struct DryingHistory {
    uint8_t  humidity[DRYING_HISTORY_SIZE];
    uint32_t timestamp[DRYING_HISTORY_SIZE];
    uint8_t  writeIndex;
    uint8_t  count;
};

struct PlantProfileData {
    // Identité
    char           name[24];          // "Citronnier", "Basilic", etc.
    PlantCategory  category;
    uint8_t        zone;              // 0=Balcon, 1=Intérieur
    uint8_t        potIndex;          // 0-9 dans la zone

    // Physique
    float          potVolumeLiters;   // Volume du pot (substrat)
    float          dripperFlowLH;     // Débit goutteur installé (L/h)

    // Seuils spécifiques (0 = utiliser seuil global)
    uint8_t        moistureMinOverride;  // 0 = global
    uint8_t        moistureMaxOverride;  // 0 = global

    // Coefficients saisonniers custom (si category == CUSTOM)
    float          customCoeff[12];

    // Appris par le système
    float          dryingRatePctPerHour;  // Taux assèchement moyen (%/h)
    float          lastWaterVolumeML;     // Dernier volume calculé
    uint32_t       lastWateringTimestamp;
};

class PlantProfile {
public:
    PlantProfile();

    void begin();  // Load from NVS

    // CRUD
    void setProfile(uint8_t zone, uint8_t potIdx, const PlantProfileData& profile);
    const PlantProfileData& getProfile(uint8_t zone, uint8_t potIdx) const;
    bool hasProfile(uint8_t zone, uint8_t potIdx) const;

    // Saisonnalité
    float seasonalCoeff(uint8_t zone, uint8_t potIdx, uint8_t month) const;
    float currentSeasonalCoeff(uint8_t zone, uint8_t potIdx) const;

    // Calcul volume d'eau nécessaire (mL) pour un cycle
    uint16_t computeWaterVolumeML(uint8_t zone, uint8_t potIdx, uint8_t month) const;

    // Calcul durée de cycle (secondes) à partir du volume et du débit goutteur
    uint16_t computeCycleDurationS(uint8_t zone, uint8_t potIdx, uint8_t month) const;

    // Durée de cycle pour toute une zone (max des pots de la zone)
    uint16_t computeZoneCycleDurationS(uint8_t zone, uint8_t month) const;

    // Apprentissage du taux d'assèchement
    void recordHumidity(uint8_t zone, uint8_t potIdx, uint8_t humidity, uint32_t timestamp);
    void updateDryingRate(uint8_t zone, uint8_t potIdx);

    // Seuil effectif (override ou global)
    uint8_t effectiveMinThreshold(uint8_t zone, uint8_t potIdx, uint8_t globalMin) const;

    // Persistence NVS
    void save();
    void load();
    void factoryReset();

    // JSON export
    String toJson() const;
    String profileToJson(uint8_t zone, uint8_t potIdx) const;

private:
    PlantProfileData _profiles[NUM_ZONES][10];  // [zone][pot]
    DryingHistory    _history[NUM_ZONES][10];
    bool             _configured[NUM_ZONES][10];

    float _lerp(float a, float b, float t) const { return a + t * (b - a); }
};
