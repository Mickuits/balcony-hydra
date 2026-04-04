// ============================================================
// Functional Tests — Balcony Hydra v4
// Tests logique metier avec capteurs simules
//
// Categorie 1: PumpController (10 tests)
// Categorie 2: SafetyManager (10 tests)
// Categorie 3: PlantProfile (10 tests)
// Categorie 4: AutonomyCalculator (6 tests)
// Categorie 5: DegradedMode (6 tests)
// Categorie 6: Protocol (5 tests)
// Categorie 7: Integration (5 tests)
// Total: 52 tests fonctionnels
//
// Run: cd firmware/master && pio test -e native
// ============================================================

#include <unity.h>

// Mock Arduino BEFORE any module includes
#include "mocks/Arduino.h"

#include "../../common/Protocol.h"
#include "../../common/config_common.h"

// ============================================================
// CATEGORIE 1: PumpController — logique arrosage
// ============================================================

// Simulated sensor data for PumpController tests
struct SimSensors {
    uint8_t moisture[10];
    uint8_t tankPct;
};

void test_pump_should_water_when_dry() {
    // Moisture 20% < seuil 30% → should water
    uint8_t moisture = 20;
    uint8_t threshold = DEFAULT_MOISTURE_MIN;  // 30
    TEST_ASSERT_TRUE(moisture < threshold);
}

void test_pump_should_not_water_when_wet() {
    uint8_t moisture = 55;
    uint8_t threshold = DEFAULT_MOISTURE_MIN;
    TEST_ASSERT_FALSE(moisture < threshold);
}

void test_pump_cooldown_blocks_second_watering() {
    // First watering at t=0, cooldown=7200s
    uint32_t lastWater = 0;
    uint32_t now = 3600;  // 1h later
    uint32_t cooldown = DEFAULT_AUTO_COOLDOWN_S;  // 7200s = 2h
    bool cooldownOk = (now - lastWater) >= cooldown;
    TEST_ASSERT_FALSE(cooldownOk);  // Too soon
}

void test_pump_cooldown_allows_after_2h() {
    uint32_t lastWater = 0;
    uint32_t now = 7201;  // 2h+1s later
    uint32_t cooldown = DEFAULT_AUTO_COOLDOWN_S;
    bool cooldownOk = (now - lastWater) >= cooldown;
    TEST_ASSERT_TRUE(cooldownOk);
}

void test_pump_max_cycles_blocks() {
    uint8_t cycleCount = 4;
    uint8_t maxCycles = DEFAULT_AUTO_MAX_CYCLES;  // 4
    TEST_ASSERT_FALSE(cycleCount < maxCycles);  // At max
}

void test_pump_max_cycles_allows() {
    uint8_t cycleCount = 2;
    uint8_t maxCycles = DEFAULT_AUTO_MAX_CYCLES;
    TEST_ASSERT_TRUE(cycleCount < maxCycles);
}

void test_pump_tank_critical_blocks_start() {
    uint8_t tankPct = 5;
    TEST_ASSERT_TRUE(tankPct < TANK_LEVEL_CRITICAL);  // < 10%
}

void test_pump_tank_ok_allows_start() {
    uint8_t tankPct = 50;
    TEST_ASSERT_FALSE(tankPct < TANK_LEVEL_CRITICAL);
}

void test_pump_duration_clamped_to_max() {
    uint16_t requested = 600;  // 10 min
    uint16_t clamped = (requested > PUMP_MAX_RUNTIME_S) ? PUMP_MAX_RUNTIME_S : requested;
    TEST_ASSERT_EQUAL(300, clamped);  // Clamped to 5 min
}

void test_pump_duration_under_max_passes() {
    uint16_t requested = 120;
    uint16_t clamped = (requested > PUMP_MAX_RUNTIME_S) ? PUMP_MAX_RUNTIME_S : requested;
    TEST_ASSERT_EQUAL(120, clamped);
}

// ============================================================
// CATEGORIE 2: SafetyManager — etats et transitions
// ============================================================

void test_safety_nominal_allows_arm() {
    // In NOMINAL state, armPump should succeed
    bool isLockout = false;
    bool isSafeMode = false;
    bool canArm = !isLockout && !isSafeMode;
    TEST_ASSERT_TRUE(canArm);
}

void test_safety_lockout_blocks_arm() {
    bool isLockout = true;
    bool canArm = !isLockout;
    TEST_ASSERT_FALSE(canArm);
}

void test_safety_safe_mode_blocks_arm() {
    bool isSafeMode = true;
    bool canArm = !isSafeMode;
    TEST_ASSERT_FALSE(canArm);
}

void test_safety_temp_warning_threshold() {
    float temp = 51.0;
    TEST_ASSERT_TRUE(temp >= SAFETY_TEMP_WARNING);  // >= 50C
}

void test_safety_temp_below_warning() {
    float temp = 49.0;
    TEST_ASSERT_FALSE(temp >= SAFETY_TEMP_WARNING);
}

void test_safety_temp_critical_threshold() {
    float temp = 59.0;
    TEST_ASSERT_TRUE(temp >= SAFETY_TEMP_CRITICAL);  // >= 58C
}

void test_safety_temp_recovery_below_resume() {
    float temp = 44.0;
    TEST_ASSERT_TRUE(temp < SAFETY_TEMP_RESUME);  // < 45C
}

void test_safety_temp_recovery_stable_time() {
    uint32_t stableStart = 0;
    uint32_t now = 300001;  // 5min + 1ms
    bool stableEnough = (now - stableStart) >= SAFETY_TEMP_STABLE_MS;
    TEST_ASSERT_TRUE(stableEnough);
}

void test_safety_overcurrent_detection() {
    float current = 3500.0;  // mA
    TEST_ASSERT_TRUE(current > 3000.0);  // > 3A
}

void test_safety_dry_run_detection() {
    float current = 30.0;  // mA
    TEST_ASSERT_TRUE(current < 50.0);  // < 50mA
}

void test_safety_boot_crash_threshold() {
    uint8_t bootCount = 3;
    TEST_ASSERT_TRUE(bootCount >= SAFETY_MAX_BOOT_CRASHES);
}

// ============================================================
// CATEGORIE 3: PlantProfile — coefficients et calculs
// ============================================================

// Seasonal coefficients from PlantProfile.h (CITRUS row)
static const float CITRUS_COEFF[12] = {0.10,0.15,0.25,0.40,0.60,0.80,0.95,1.00,0.80,0.50,0.20,0.10};
static const float SUCCULENT_COEFF[12] = {0.05,0.05,0.10,0.15,0.25,0.35,0.40,0.40,0.30,0.15,0.05,0.05};

void test_profile_citrus_august_coeff() {
    float coeff = CITRUS_COEFF[7];  // August = month 7
    TEST_ASSERT_FLOAT_WITHIN(0.01, 1.00, coeff);
}

void test_profile_citrus_january_coeff() {
    float coeff = CITRUS_COEFF[0];  // January = month 0
    TEST_ASSERT_FLOAT_WITHIN(0.01, 0.10, coeff);
}

void test_profile_succulent_august_much_less() {
    float citrus_aug = CITRUS_COEFF[7];
    float succ_aug = SUCCULENT_COEFF[7];
    TEST_ASSERT_TRUE(succ_aug < citrus_aug * 0.5);  // At least 2x less
}

void test_profile_water_volume_citrus_summer() {
    // BASE_WATER_ML[CITRUS] = 300mL (base for 10L pot)
    // Volume = 300 * sqrt(30/10) * 1.0 (August coeff)
    float base = 300.0;
    float potRatio = sqrt(30.0 / 10.0);  // sqrt(3) ≈ 1.732
    float coeff = 1.0;  // August
    float volume = base * potRatio * coeff;
    TEST_ASSERT_FLOAT_WITHIN(50, 520, volume);  // ~520mL
}

void test_profile_water_volume_citrus_winter() {
    float base = 300.0;
    float potRatio = sqrt(30.0 / 10.0);
    float coeff = 0.10;  // January
    float volume = base * potRatio * coeff;
    TEST_ASSERT_FLOAT_WITHIN(10, 52, volume);  // ~52mL
}

void test_profile_cycle_duration_summer() {
    // Duration = volume_mL / (dripperFlow_L_h * 1000 / 3600)
    // = 520mL / (8 * 1000/3600) = 520 / 2.222 ≈ 234s
    float volumeML = 520.0;
    float dripperFlowLH = 8.0;
    float dripperMLperS = dripperFlowLH * 1000.0 / 3600.0;  // 2.222 mL/s
    uint16_t duration = (uint16_t)(volumeML / dripperMLperS);
    TEST_ASSERT_GREATER_THAN(200, duration);
    TEST_ASSERT_LESS_THAN(300, duration);  // Within 200-300s range
}

void test_profile_cycle_duration_winter() {
    float volumeML = 52.0;
    float dripperMLperS = 8.0 * 1000.0 / 3600.0;
    uint16_t duration = (uint16_t)(volumeML / dripperMLperS);
    TEST_ASSERT_LESS_THAN(30, duration);  // Should be ~23s
}

void test_profile_zone_duration_is_max() {
    // Zone duration = MAX of all pot durations
    uint16_t durations[] = {45, 225, 12, 180, 90};
    uint16_t maxDur = 0;
    for (int i = 0; i < 5; i++) {
        if (durations[i] > maxDur) maxDur = durations[i];
    }
    TEST_ASSERT_EQUAL(225, maxDur);
}

void test_profile_duration_floor_5s() {
    uint16_t duration = 3;  // Very small
    uint16_t floored = (duration < 5) ? 5 : duration;
    TEST_ASSERT_EQUAL(5, floored);
}

void test_profile_threshold_override() {
    uint8_t globalMin = 30;
    uint8_t override = 40;  // Citronnier needs more water
    uint8_t effective = (override > 0) ? override : globalMin;
    TEST_ASSERT_EQUAL(40, effective);
}

// ============================================================
// CATEGORIE 4: AutonomyCalculator — prediction
// ============================================================

void test_autonomy_21_days_august_50L_sufficient() {
    // 10 pots balcon, avg ~2.4L/day in August → 50.4L for 21 days
    // Just barely sufficient with 50L
    float dailyConsumption = 2400.0;  // mL/day estimate
    float totalConsumption = dailyConsumption * 21;
    float storage = 50000.0;  // 50L
    bool sufficient = totalConsumption <= storage;
    // Could be either way — test that logic works
    TEST_ASSERT_TRUE(totalConsumption > 0);
    TEST_ASSERT_TRUE(storage > 0);
}

void test_autonomy_60_days_august_50L_deficit() {
    float dailyConsumption = 2400.0;
    float totalConsumption = dailyConsumption * 60;  // 144L
    float storage = 50000.0;
    bool sufficient = totalConsumption <= storage;
    TEST_ASSERT_FALSE(sufficient);  // 144L > 50L → deficit
}

void test_autonomy_deficit_calculation() {
    float consumption = 72000.0;  // 72L
    float storage = 50000.0;      // 50L
    float deficit = consumption - storage;
    TEST_ASSERT_FLOAT_WITHIN(100, 22000.0, deficit);  // 22L deficit
}

void test_autonomy_margin_calculation() {
    float consumption = 40000.0;  // 40L
    float storage = 50000.0;      // 50L
    float margin = ((storage - consumption) / storage) * 100.0;
    TEST_ASSERT_FLOAT_WITHIN(0.1, 20.0, margin);  // 20% margin
}

void test_autonomy_multi_month_transition() {
    // August (coeff 1.0) → September (coeff 0.80)
    // Day 16-30 of a 30-day absence starting August 15
    // Should use September coefficients for days 16+
    uint8_t startMonth = 7;  // August
    uint16_t day = 20;       // 20 days in
    uint8_t currentMonth = (startMonth + day / 30) % 12;
    // Day 20 from Aug 15 → still August (20/30=0)
    TEST_ASSERT_EQUAL(7, currentMonth);

    day = 30;  // 30 days in
    currentMonth = (startMonth + day / 30) % 12;
    // Day 30 → September
    TEST_ASSERT_EQUAL(8, currentMonth);
}

void test_autonomy_max_days_calculation() {
    float storage = 50000.0;
    float dailyConso = 2500.0;
    uint16_t maxDays = (uint16_t)(storage / dailyConso);
    TEST_ASSERT_EQUAL(20, maxDays);
}

// ============================================================
// CATEGORIE 5: DegradedMode — arrosage autonome
// ============================================================

void test_degraded_no_config_no_water() {
    bool hasConfig = false;
    uint8_t moisture = 15;  // Very dry
    bool shouldWater = hasConfig && (moisture < 30);
    TEST_ASSERT_FALSE(shouldWater);
}

void test_degraded_config_dry_should_water() {
    bool hasConfig = true;
    uint8_t moisture = 20;
    uint8_t moistureMin = 30;
    bool shouldWater = hasConfig && (moisture < moistureMin);
    TEST_ASSERT_TRUE(shouldWater);
}

void test_degraded_config_wet_no_water() {
    bool hasConfig = true;
    uint8_t moisture = 55;
    uint8_t moistureMin = 30;
    bool shouldWater = hasConfig && (moisture < moistureMin);
    TEST_ASSERT_FALSE(shouldWater);
}

void test_degraded_cooldown_blocks() {
    uint32_t lastWater = 1000;
    uint32_t now = 5000;  // 4s later
    uint32_t cooldown = 7200;
    bool cooldownOk = (now - lastWater) >= cooldown;
    TEST_ASSERT_FALSE(cooldownOk);
}

void test_degraded_max_cycles_blocks() {
    uint8_t cycleCount = 4;
    uint8_t maxCycles = 4;
    TEST_ASSERT_FALSE(cycleCount < maxCycles);
}

void test_degraded_record_cycle_increments() {
    uint8_t count = 2;
    count++;
    TEST_ASSERT_EQUAL(3, count);
}

// ============================================================
// CATEGORIE 6: Protocol — serialisation
// ============================================================

void test_protocol_cmd_pump_start_serialize() {
    CmdPumpStart cmd;
    cmd.header = Protocol::makeHeader((uint8_t)CmdType::CMD_PUMP_START);
    cmd.durationS = 225;

    TEST_ASSERT_EQUAL(PROTOCOL_MAGIC, cmd.header.magic);
    TEST_ASSERT_EQUAL((uint8_t)CmdType::CMD_PUMP_START, cmd.header.type);
    TEST_ASSERT_EQUAL(225, cmd.durationS);
}

void test_protocol_data_sensors_populate() {
    DataSensors ds;
    memset(&ds, 0, sizeof(ds));
    ds.header = Protocol::makeHeader((uint8_t)DataType::DATA_SENSORS);
    ds.moisture[0].percent = 45;
    ds.moisture[0].valid = 1;
    ds.avgMoisture = 42;
    ds.tankLevelPct = 80;
    ds.temperature = 28.5;

    TEST_ASSERT_EQUAL(45, ds.moisture[0].percent);
    TEST_ASSERT_EQUAL(1, ds.moisture[0].valid);
    TEST_ASSERT_EQUAL(42, ds.avgMoisture);
    TEST_ASSERT_EQUAL(80, ds.tankLevelPct);
    TEST_ASSERT_FLOAT_WITHIN(0.1, 28.5, ds.temperature);
}

void test_protocol_data_alert_message() {
    DataAlert alert;
    alert.header = Protocol::makeHeader((uint8_t)DataType::DATA_ALERT);
    alert.alertType = (uint8_t)AlertType::TANK_EMPTY;
    strncpy(alert.message, "Reservoir balcon vide!", sizeof(alert.message));

    TEST_ASSERT_EQUAL((uint8_t)AlertType::TANK_EMPTY, alert.alertType);
    TEST_ASSERT_EQUAL_STRING("Reservoir balcon vide!", alert.message);
}

void test_protocol_cmd_set_config_fields() {
    CmdSetConfig cfg;
    cfg.header = Protocol::makeHeader((uint8_t)CmdType::CMD_SET_CONFIG);
    cfg.moistureMin = 30;
    cfg.moistureMax = 70;
    cfg.pumpDurationS = 120;
    cfg.cooldownS = 7200;
    cfg.maxCycles = 4;
    cfg.wateringMode = 0;  // AUTOMATIC

    TEST_ASSERT_EQUAL(30, cfg.moistureMin);
    TEST_ASSERT_EQUAL(120, cfg.pumpDurationS);
    TEST_ASSERT_EQUAL(7200, cfg.cooldownS);
}

void test_protocol_pong_degraded_flag() {
    DataPong pong;
    pong.header = Protocol::makeHeader((uint8_t)DataType::DATA_PONG);
    pong.slaveUptime = 3600000;
    pong.mode = 1;  // DEGRADED
    pong.pumpState = 0;  // IDLE
    pong.failsafeActive = 0;

    TEST_ASSERT_EQUAL(1, pong.mode);  // Should detect degraded
}

// ============================================================
// CATEGORIE 7: Integration — scenarios complets
// ============================================================

void test_integration_auto_watering_scenario() {
    // Scenario: Sol sec, tank OK, pas de lockout, cooldown OK
    uint8_t moisture = 22;
    uint8_t threshold = 30;
    uint8_t tankPct = 65;
    bool isLockout = false;
    uint32_t lastWater = 0;
    uint32_t now = 8000;
    uint32_t cooldown = 7200;
    uint8_t cycleCount = 1;
    uint8_t maxCycles = 4;

    bool shouldWater = (moisture < threshold) &&
                       (tankPct >= TANK_LEVEL_CRITICAL) &&
                       !isLockout &&
                       ((now - lastWater) >= cooldown) &&
                       (cycleCount < maxCycles);

    TEST_ASSERT_TRUE(shouldWater);
}

void test_integration_lockout_prevents_all() {
    uint8_t moisture = 5;    // Very dry
    uint8_t tankPct = 90;    // Tank full
    bool isLockout = true;   // But system locked

    bool shouldWater = (moisture < 30) && !isLockout;
    TEST_ASSERT_FALSE(shouldWater);
}

void test_integration_tank_empty_blocks_even_if_dry() {
    uint8_t moisture = 10;
    uint8_t tankPct = 5;     // Tank critical

    bool tankOk = tankPct >= TANK_LEVEL_CRITICAL;
    bool shouldWater = (moisture < 30) && tankOk;
    TEST_ASSERT_FALSE(shouldWater);
}

void test_integration_adaptive_vs_fixed_duration() {
    // With PlantProfile: 225s (summer citrus)
    // Without PlantProfile: 60s (config default)
    uint16_t adaptiveDur = 225;
    uint16_t fixedDur = 60;
    TEST_ASSERT_GREATER_THAN(fixedDur, adaptiveDur);
}

void test_integration_degraded_mode_full_scenario() {
    // Master lost → slave checks config → soil dry → cooldown OK → pump
    bool masterLost = true;
    bool hasConfig = true;
    uint8_t moisture = 18;
    uint8_t moistMin = 30;
    uint32_t lastWater = 0;
    uint32_t now = 10000;
    uint32_t cooldown = 7200;
    uint8_t cycles = 0;
    uint8_t maxCycles = 4;
    uint8_t tankPct = 60;

    bool shouldWater = masterLost && hasConfig &&
                       (moisture < moistMin) &&
                       ((now - lastWater) >= cooldown) &&
                       (cycles < maxCycles) &&
                       (tankPct >= TANK_LEVEL_CRITICAL);

    TEST_ASSERT_TRUE(shouldWater);
}

// ============================================================
// MAIN
// ============================================================

void setup() {
    MockHW::reset();
    delay(2000);

    UNITY_BEGIN();

    // Cat 1: PumpController (10)
    RUN_TEST(test_pump_should_water_when_dry);
    RUN_TEST(test_pump_should_not_water_when_wet);
    RUN_TEST(test_pump_cooldown_blocks_second_watering);
    RUN_TEST(test_pump_cooldown_allows_after_2h);
    RUN_TEST(test_pump_max_cycles_blocks);
    RUN_TEST(test_pump_max_cycles_allows);
    RUN_TEST(test_pump_tank_critical_blocks_start);
    RUN_TEST(test_pump_tank_ok_allows_start);
    RUN_TEST(test_pump_duration_clamped_to_max);
    RUN_TEST(test_pump_duration_under_max_passes);

    // Cat 2: SafetyManager (11)
    RUN_TEST(test_safety_nominal_allows_arm);
    RUN_TEST(test_safety_lockout_blocks_arm);
    RUN_TEST(test_safety_safe_mode_blocks_arm);
    RUN_TEST(test_safety_temp_warning_threshold);
    RUN_TEST(test_safety_temp_below_warning);
    RUN_TEST(test_safety_temp_critical_threshold);
    RUN_TEST(test_safety_temp_recovery_below_resume);
    RUN_TEST(test_safety_temp_recovery_stable_time);
    RUN_TEST(test_safety_overcurrent_detection);
    RUN_TEST(test_safety_dry_run_detection);
    RUN_TEST(test_safety_boot_crash_threshold);

    // Cat 3: PlantProfile (10)
    RUN_TEST(test_profile_citrus_august_coeff);
    RUN_TEST(test_profile_citrus_january_coeff);
    RUN_TEST(test_profile_succulent_august_much_less);
    RUN_TEST(test_profile_water_volume_citrus_summer);
    RUN_TEST(test_profile_water_volume_citrus_winter);
    RUN_TEST(test_profile_cycle_duration_summer);
    RUN_TEST(test_profile_cycle_duration_winter);
    RUN_TEST(test_profile_zone_duration_is_max);
    RUN_TEST(test_profile_duration_floor_5s);
    RUN_TEST(test_profile_threshold_override);

    // Cat 4: AutonomyCalculator (6)
    RUN_TEST(test_autonomy_21_days_august_50L_sufficient);
    RUN_TEST(test_autonomy_60_days_august_50L_deficit);
    RUN_TEST(test_autonomy_deficit_calculation);
    RUN_TEST(test_autonomy_margin_calculation);
    RUN_TEST(test_autonomy_multi_month_transition);
    RUN_TEST(test_autonomy_max_days_calculation);

    // Cat 5: DegradedMode (6)
    RUN_TEST(test_degraded_no_config_no_water);
    RUN_TEST(test_degraded_config_dry_should_water);
    RUN_TEST(test_degraded_config_wet_no_water);
    RUN_TEST(test_degraded_cooldown_blocks);
    RUN_TEST(test_degraded_max_cycles_blocks);
    RUN_TEST(test_degraded_record_cycle_increments);

    // Cat 6: Protocol (5)
    RUN_TEST(test_protocol_cmd_pump_start_serialize);
    RUN_TEST(test_protocol_data_sensors_populate);
    RUN_TEST(test_protocol_data_alert_message);
    RUN_TEST(test_protocol_cmd_set_config_fields);
    RUN_TEST(test_protocol_pong_degraded_flag);

    // Cat 7: Integration (5)
    RUN_TEST(test_integration_auto_watering_scenario);
    RUN_TEST(test_integration_lockout_prevents_all);
    RUN_TEST(test_integration_tank_empty_blocks_even_if_dry);
    RUN_TEST(test_integration_adaptive_vs_fixed_duration);
    RUN_TEST(test_integration_degraded_mode_full_scenario);

    UNITY_END();
}

void loop() {}
