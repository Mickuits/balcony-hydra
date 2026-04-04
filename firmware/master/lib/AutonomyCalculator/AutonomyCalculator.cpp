// ============================================================
// AutonomyCalculator — Implementation
// ============================================================

#include "AutonomyCalculator.h"

AutonomyCalculator::AutonomyCalculator(const PlantProfile& profiles)
    : _profiles(profiles) {}

AutonomyReport AutonomyCalculator::compute(uint16_t absenceDays, uint8_t startMonth,
                                            float zoneAStorageML, float zoneBStorageML) const {
    AutonomyReport report;
    report.absenceDays = absenceDays;
    report.startMonth = startMonth;

    float storages[] = { zoneAStorageML, zoneBStorageML };

    for (uint8_t z = 0; z < NUM_ZONES; z++) {
        report.zones[z] = _computeZone(z, absenceDays, startMonth, storages[z]);
    }

    report.overallSufficient = report.zones[0].sufficient && report.zones[1].sufficient;
    report.totalDeficitML = 0;
    for (uint8_t z = 0; z < NUM_ZONES; z++) {
        if (!report.zones[z].sufficient) {
            report.totalDeficitML += report.zones[z].deficitML;
        }
    }

    // Build summary
    const char* zoneNames[] = {"Balcon", "Intérieur"};
    const char* monthNames[] = {"Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"};

    String s = "📊 Autonomie " + String(absenceDays) + "j depuis " + String(monthNames[startMonth]) + ":\n";

    for (uint8_t z = 0; z < NUM_ZONES; z++) {
        const auto& za = report.zones[z];
        s += "\n" + String(zoneNames[z]) + ":\n";
        s += "  Conso estimée: " + String(za.estimatedConsumptionML / 1000.0, 1) + "L\n";
        s += "  Stockage: " + String(za.storageCapacityML / 1000.0, 1) + "L\n";
        s += "  Conso/jour: " + String(za.dailyConsumptionML / 1000.0, 2) + "L\n";
        s += "  ~" + String(za.cyclesPerDay) + " cycles/jour de " + String(za.cycleDurationS) + "s\n";
        s += "  Autonomie max: " + String(za.maxAutonomyDays) + " jours\n";

        if (za.sufficient) {
            s += "  ✅ OK (marge " + String(za.marginPct, 0) + "%)\n";
        } else {
            s += "  ❌ INSUFFISANT — manque " + String(za.deficitML / 1000.0, 1) + "L\n";
        }
    }

    if (!report.overallSufficient) {
        s += "\n⚠ DÉFICIT TOTAL: " + String(report.totalDeficitML / 1000.0, 1) + "L";
        s += "\n→ Prévoir un réservoir supplémentaire ou réduire l'absence.";
    }

    report.summary = s;
    return report;
}

ZoneAutonomy AutonomyCalculator::_computeZone(uint8_t zone, uint16_t absenceDays,
                                                uint8_t startMonth, float storageML) const {
    ZoneAutonomy za;
    za.storageCapacityML = storageML;
    za.estimatedConsumptionML = 0;

    // Calculer jour par jour pour gérer le changement de mois
    uint8_t currentMonth = startMonth;
    uint8_t dayInMonth = 1;  // Approximation: on démarre au 1er du mois
    uint8_t daysInMonths[] = {31,28,31,30,31,30,31,31,30,31,30,31};

    float totalDailyConsumption = 0;
    uint16_t daysProcessed = 0;

    for (uint16_t d = 0; d < absenceDays; d++) {
        float dayConsumption = dailyConsumptionML(zone, currentMonth);
        za.estimatedConsumptionML += dayConsumption;
        totalDailyConsumption += dayConsumption;
        daysProcessed++;

        // Avancer d'un jour
        dayInMonth++;
        if (dayInMonth > daysInMonths[currentMonth]) {
            dayInMonth = 1;
            currentMonth = (currentMonth + 1) % 12;
        }
    }

    za.dailyConsumptionML = (daysProcessed > 0) ? totalDailyConsumption / daysProcessed : 0;
    za.marginPct = (storageML > 0) ? ((storageML - za.estimatedConsumptionML) / storageML) * 100.0 : 0;
    za.sufficient = (za.estimatedConsumptionML <= storageML);
    za.deficitML = za.sufficient ? 0 : (za.estimatedConsumptionML - storageML);
    za.maxAutonomyDays = maxAutonomyDays(zone, startMonth, storageML);

    // Estimate cycles per day for the start month
    if (za.dailyConsumptionML > 0) {
        // Average water per cycle for this zone
        float avgCycleML = 0;
        uint8_t configured = 0;
        for (uint8_t p = 0; p < 10; p++) {
            if (_profiles.hasProfile(zone, p)) {
                avgCycleML += _profiles.computeWaterVolumeML(zone, p, startMonth);
                configured++;
            }
        }
        if (configured > 0 && avgCycleML > 0) {
            // Total zone water per cycle = sum of all pots (they all run simultaneously)
            za.cyclesPerDay = (uint8_t)ceil(za.dailyConsumptionML / avgCycleML);
            if (za.cyclesPerDay > 10) za.cyclesPerDay = 10;
        } else {
            za.cyclesPerDay = 2;  // Default
        }
    } else {
        za.cyclesPerDay = 1;
    }

    za.cycleDurationS = _profiles.computeZoneCycleDurationS(zone, startMonth);

    return za;
}

float AutonomyCalculator::dailyConsumptionML(uint8_t zone, uint8_t month) const {
    float total = 0;

    for (uint8_t p = 0; p < 10; p++) {
        if (!_profiles.hasProfile(zone, p)) continue;
        const auto& profile = _profiles.getProfile(zone, p);

        // If we have a learned drying rate, use it for more accurate estimation
        if (profile.dryingRatePctPerHour > 0.1) {
            // Drying rate tells us how fast humidity drops → how often we need to water
            // Hours to go from max threshold to min threshold:
            uint8_t moistureRange = 70 - 30;  // Default thresholds
            if (profile.moistureMinOverride > 0) {
                moistureRange = 70 - profile.moistureMinOverride;
            }
            float hoursToThreshold = moistureRange / profile.dryingRatePctPerHour;
            if (hoursToThreshold < 1.0) hoursToThreshold = 1.0;

            // Cycles per day based on drying rate
            float cyclesPerDay = 24.0 / hoursToThreshold;
            if (cyclesPerDay < 0.5) cyclesPerDay = 0.5;
            if (cyclesPerDay > 6.0) cyclesPerDay = 6.0;

            // Volume per cycle × seasonal adjustment × cycles per day
            float coeff = _profiles.seasonalCoeff(zone, p, month);
            uint16_t volumeML = _profiles.computeWaterVolumeML(zone, p, month);
            total += volumeML * cyclesPerDay * coeff;
        } else {
            // No learned rate — use seasonal estimation
            // Assume 2 cycles/day in summer (août), scale by seasonal coeff
            float coeff = _profiles.seasonalCoeff(zone, p, month);
            uint16_t volumeML = _profiles.computeWaterVolumeML(zone, p, month);
            float baseCycles = 2.0 * coeff;  // 2 cycles/day in peak, scaled down
            if (baseCycles < 0.2) baseCycles = 0.2;
            total += volumeML * baseCycles;
        }
    }

    return total;
}

uint16_t AutonomyCalculator::maxAutonomyDays(uint8_t zone, uint8_t startMonth, float storageML) const {
    float remaining = storageML;
    uint8_t month = startMonth;
    uint16_t days = 0;
    uint8_t daysInMonths[] = {31,28,31,30,31,30,31,31,30,31,30,31};
    uint8_t dayInMonth = 1;

    while (remaining > 0 && days < 365) {
        float consumption = dailyConsumptionML(zone, month);
        remaining -= consumption;
        days++;

        dayInMonth++;
        if (dayInMonth > daysInMonths[month]) {
            dayInMonth = 1;
            month = (month + 1) % 12;
        }
    }

    return (remaining > 0) ? days : (days > 0 ? days - 1 : 0);
}

String AutonomyCalculator::reportToJson(const AutonomyReport& report) const {
    JsonDocument doc;
    doc["absenceDays"] = report.absenceDays;
    doc["startMonth"] = report.startMonth;
    doc["overallSufficient"] = report.overallSufficient;
    doc["totalDeficitML"] = report.totalDeficitML;

    const char* zoneNames[] = {"balcon", "interieur"};
    for (uint8_t z = 0; z < NUM_ZONES; z++) {
        JsonObject zo = doc[zoneNames[z]].to<JsonObject>();
        const auto& za = report.zones[z];
        zo["estimatedML"] = za.estimatedConsumptionML;
        zo["storageML"] = za.storageCapacityML;
        zo["dailyML"] = za.dailyConsumptionML;
        zo["marginPct"] = za.marginPct;
        zo["maxDays"] = za.maxAutonomyDays;
        zo["sufficient"] = za.sufficient;
        zo["deficitML"] = za.deficitML;
        zo["cyclesPerDay"] = za.cyclesPerDay;
        zo["cycleDurationS"] = za.cycleDurationS;
    }

    String out;
    serializeJson(doc, out);
    return out;
}
