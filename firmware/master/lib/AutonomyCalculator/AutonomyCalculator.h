// ============================================================
// AutonomyCalculator — Calculateur d'autonomie et besoin eau
//
// "Je pars 21 jours en août" →
//   Zone A (balcon): 47.2L estimés, stockage 50L → ✅ OK (marge 6%)
//   Zone B (intérieur): 18.8L estimés, stockage 25L → ✅ OK (marge 33%)
//
// Utilise les profils hydriques de chaque plante + saisonnalité
// pour estimer la consommation totale par zone sur une période
// ============================================================

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include "config_master.h"
#include "PlantProfile.h"

struct ZoneAutonomy {
    float estimatedConsumptionML;   // Consommation estimée (mL)
    float storageCapacityML;       // Capacité stockage (mL)
    float marginPct;               // Marge restante (%)
    float dailyConsumptionML;      // Consommation journalière moyenne (mL)
    uint16_t maxAutonomyDays;      // Autonomie max avec stockage actuel (jours)
    bool  sufficient;              // Stockage suffisant ?
    float deficitML;               // Déficit si insuffisant (mL)
    uint8_t cyclesPerDay;          // Nombre de cycles estimés par jour
    uint16_t cycleDurationS;       // Durée de cycle calculée (s)
};

struct AutonomyReport {
    ZoneAutonomy zones[NUM_ZONES];
    uint16_t absenceDays;
    uint8_t  startMonth;           // Mois de début d'absence (0-11)
    bool     overallSufficient;
    float    totalDeficitML;
    String   summary;              // Texte résumé en français
};

class AutonomyCalculator {
public:
    AutonomyCalculator(const PlantProfile& profiles);

    // Calcul principal: estimer consommation pour N jours à partir du mois M
    AutonomyReport compute(uint16_t absenceDays, uint8_t startMonth,
                           float zoneAStorageML = 50000.0,  // 2×25L = 50L
                           float zoneBStorageML = 25000.0   // 1×25L = 25L
                          ) const;

    // Autonomie max avec stockage actuel (combien de jours avant de tomber à sec)
    uint16_t maxAutonomyDays(uint8_t zone, uint8_t startMonth, float storageML) const;

    // Consommation journalière estimée pour une zone et un mois
    float dailyConsumptionML(uint8_t zone, uint8_t month) const;

    // JSON
    String reportToJson(const AutonomyReport& report) const;

private:
    const PlantProfile& _profiles;

    // Calcul pour une zone sur une période multi-mois
    ZoneAutonomy _computeZone(uint8_t zone, uint16_t absenceDays,
                               uint8_t startMonth, float storageML) const;
};
