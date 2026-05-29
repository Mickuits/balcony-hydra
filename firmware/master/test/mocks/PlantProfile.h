// ============================================================
// PlantProfile — SIL mock stub
// Minimal interface pour les tests natifs (pas de NVS, pas d'accès matériel).
// Implémentation réelle : firmware/master/lib/PlantProfile/
//
// Couverture : uniquement les symboles utilisés par PumpController.cpp
// et AutonomyCalculator (via #include "PlantProfile.h" dans leur header).
// ============================================================
#pragma once

#include <Arduino.h>

// ---- Enums et structs publics (repris de PlantProfile.h réel) ----

enum class PlantCategory : uint8_t {
    CUSTOM        = 0,
    CITRUS        = 1,
    AROMATIC      = 2,
    SUCCULENT     = 3,
    TROPICAL      = 4,
    MEDITERRANEAN = 5,
    FLOWERING     = 6
};

struct PlantProfileData {
    char          name[24];
    PlantCategory category;
    uint8_t       zone;
    uint8_t       potIndex;
    float         potVolumeLiters;
    float         dripperFlowLH;
    uint8_t       moistureMinOverride;
    uint8_t       moistureMaxOverride;
    float         customCoeff[12];
    float         dryingRatePctPerHour;
    float         lastWaterVolumeML;
    uint32_t      lastWateringTimestamp;
};

constexpr uint8_t DRYING_HISTORY_SIZE = 24;

struct DryingHistory {
    uint8_t  humidity[DRYING_HISTORY_SIZE];
    uint32_t timestamp[DRYING_HISTORY_SIZE];
    uint8_t  writeIndex;
    uint8_t  count;
};

// ---- Classe mock (inline, header-only) ----

class PlantProfile {
public:
    PlantProfile() : _profiles{} {
        for (uint8_t z = 0; z < 2; z++)
            for (uint8_t p = 0; p < 10; p++)
                _configured[z][p] = false;
    }

    void begin() {}

    // CRUD
    void setProfile(uint8_t zone, uint8_t potIdx, const PlantProfileData& profile) {
        if (zone >= 2 || potIdx >= 10) return;
        _profiles[zone][potIdx] = profile;
        _configured[zone][potIdx] = true;
    }

    const PlantProfileData& getProfile(uint8_t zone, uint8_t potIdx) const {
        return _profiles[zone < 2 ? zone : 0][potIdx < 10 ? potIdx : 0];
    }

    bool hasProfile(uint8_t zone, uint8_t potIdx) const {
        if (zone >= 2 || potIdx >= 10) return false;
        return _configured[zone][potIdx];
    }

    // Saisonnalité — valeurs mock plates (coefficient 1.0)
    float seasonalCoeff(uint8_t /*zone*/, uint8_t /*potIdx*/, uint8_t /*month*/) const {
        return 1.0f;
    }

    float currentSeasonalCoeff(uint8_t /*zone*/, uint8_t /*potIdx*/) const {
        return 1.0f;
    }

    // Volume eau (mL) pour un cycle — mock : 300 mL
    uint16_t computeWaterVolumeML(uint8_t /*zone*/, uint8_t /*potIdx*/, uint8_t /*month*/) const {
        return 300;
    }

    // Durée de cycle (s) pour un pot — mock : 60 secondes
    uint16_t computeCycleDurationS(uint8_t /*zone*/, uint8_t /*potIdx*/, uint8_t /*month*/) const {
        return 60;
    }

    // Durée de cycle pour toute une zone (max des pots) — mock : 60 secondes
    // Utilisé par PumpController::start() ligne 88.
    uint16_t computeZoneCycleDurationS(uint8_t /*zone*/, uint8_t /*month*/) const {
        return 60;
    }

    // Apprentissage du taux d'assèchement — no-op en mock
    void recordHumidity(uint8_t /*zone*/, uint8_t /*potIdx*/,
                        uint8_t /*humidity*/, uint32_t /*timestamp*/) {}
    void updateDryingRate(uint8_t /*zone*/, uint8_t /*potIdx*/) {}

    // Seuil effectif
    uint8_t effectiveMinThreshold(uint8_t /*zone*/, uint8_t /*potIdx*/, uint8_t globalMin) const {
        return globalMin;
    }

    // Persistence NVS — no-op en mock
    void save() {}
    void load() {}
    void factoryReset() {}

    // JSON export — stub minimal
    String toJson() const { return String("{\"mock\":true}"); }
    String profileToJson(uint8_t /*zone*/, uint8_t /*potIdx*/) const {
        return String("{\"mock\":true}");
    }

    // Helpers de test : configurer un profil mock standard
    void setMockProfile(uint8_t zone, uint8_t potIdx,
                        const char* name = "MockPlant",
                        PlantCategory cat = PlantCategory::TROPICAL,
                        float volumeL = 5.0f, float flowLH = 2.0f) {
        PlantProfileData p = {};
        strncpy(p.name, name, sizeof(p.name) - 1);
        p.category = cat;
        p.zone = zone;
        p.potIndex = potIdx;
        p.potVolumeLiters = volumeL;
        p.dripperFlowLH = flowLH;
        setProfile(zone, potIdx, p);
    }

private:
    PlantProfileData _profiles[2][10];
    bool             _configured[2][10];
};
