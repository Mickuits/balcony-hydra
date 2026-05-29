// ============================================================
// Unit Tests — Balcony Hydra v4 Slave
// Run: cd firmware/slave && pio test -e native
// ============================================================

#include <unity.h>
#include "../../common/Protocol.h"
#include "../../common/config_common.h"
#include "DegradedMode.h"   // lib/DegradedMode (via lib_extra_dirs)
#include "SafetyLocal.h"    // lib/SafetyLocal  (via lib_extra_dirs)

// ============================================================
// T1: Protocol compatibility with master
// ============================================================

void test_protocol_magic() {
    TEST_ASSERT_EQUAL(0xBA, PROTOCOL_MAGIC);
}

void test_protocol_cmd_types() {
    TEST_ASSERT_EQUAL(0x01, (uint8_t)CmdType::CMD_PING);
    TEST_ASSERT_EQUAL(0x02, (uint8_t)CmdType::CMD_READ_SENSORS);
    TEST_ASSERT_EQUAL(0x03, (uint8_t)CmdType::CMD_PUMP_START);
    TEST_ASSERT_EQUAL(0x04, (uint8_t)CmdType::CMD_PUMP_STOP);
    TEST_ASSERT_EQUAL(0x05, (uint8_t)CmdType::CMD_SET_CONFIG);
    TEST_ASSERT_EQUAL(0x06, (uint8_t)CmdType::CMD_REBOOT);
}

void test_protocol_data_types() {
    TEST_ASSERT_EQUAL(0x81, (uint8_t)DataType::DATA_PONG);
    TEST_ASSERT_EQUAL(0x82, (uint8_t)DataType::DATA_SENSORS);
    TEST_ASSERT_EQUAL(0x83, (uint8_t)DataType::DATA_PUMP_STATUS);
    TEST_ASSERT_EQUAL(0x84, (uint8_t)DataType::DATA_ACK);
    TEST_ASSERT_EQUAL(0x85, (uint8_t)DataType::DATA_ALERT);
}

void test_protocol_sensor_data_under_250() {
    TEST_ASSERT_LESS_OR_EQUAL(250, sizeof(DataSensors));
}

void test_protocol_alert_data_under_250() {
    TEST_ASSERT_LESS_OR_EQUAL(250, sizeof(DataAlert));
}

// ============================================================
// T2: Safety thresholds consistency
// ============================================================

void test_safety_boot_crash_limit() {
    TEST_ASSERT_EQUAL(3, SAFETY_MAX_BOOT_CRASHES);
}

void test_safety_stable_boot_time() {
    TEST_ASSERT_EQUAL(60000, SAFETY_STABLE_BOOT_MS);
}

void test_pump_max_runtime() {
    TEST_ASSERT_EQUAL(300, PUMP_MAX_RUNTIME_S);
}

void test_tank_critical_below_warning() {
    // Unity: TEST_ASSERT_LESS_THAN(threshold, actual) checks actual < threshold
    TEST_ASSERT_LESS_THAN(100, TANK_LEVEL_WARNING);              // warning < 100
    TEST_ASSERT_LESS_THAN(TANK_LEVEL_WARNING, TANK_LEVEL_CRITICAL); // critical < warning
}

// ============================================================
// T3: DegradedMode config defaults
// ============================================================

void test_degraded_cooldown() {
    TEST_ASSERT_EQUAL(7200, DEFAULT_AUTO_COOLDOWN_S);
}

void test_degraded_max_cycles() {
    TEST_ASSERT_EQUAL(4, DEFAULT_AUTO_MAX_CYCLES);
}

void test_degraded_cycle_reset() {
    TEST_ASSERT_EQUAL(86400, AUTO_CYCLE_RESET_INTERVAL);
}

// ============================================================
// T4: Communication timing
// ============================================================

void test_ping_interval() {
    TEST_ASSERT_EQUAL(60000, ESPNOW_PING_INTERVAL_MS);
}

void test_max_missed_pongs() {
    TEST_ASSERT_EQUAL(3, ESPNOW_MAX_MISSED_PONGS);
}

void test_master_timeout() {
    uint32_t timeout = ESPNOW_PING_INTERVAL_MS * ESPNOW_MAX_MISSED_PONGS;
    TEST_ASSERT_EQUAL(180000, timeout);  // 3 min
}

void test_sensor_interval() {
    TEST_ASSERT_EQUAL(30000, ESPNOW_SENSOR_INTERVAL_MS);
}

// ============================================================
// T5: DegradedMode E2E — arrosage autonome quand maître perdu
//
// Exerce les VRAIES classes DegradedMode + SafetyLocal (pas juste
// des constantes) avec NVS en mémoire + horloge contrôlable.
// Couvre le dernier trou SIL : "mode dégradé slave bout-en-bout".
// ============================================================

// Helpers : config dégradée typique reçue du maître avant la perte de lien.
// min=30% max=70% durée=60s cooldown=7200s max=4 cycles/24h
static void seedDegradedConfig(DegradedMode& dm) {
    dm.saveConfig(30, 70, 60, 7200, 4);
}

void test_degraded_no_config_no_watering() {
    // Aucune config jamais reçue → begin() charge des defaults invalides →
    // refus d'arroser même si le sol est sec (comportement fail-safe).
    DegradedMode dm;
    dm.begin();
    TEST_ASSERT_FALSE(dm.hasValidConfig());
    TEST_ASSERT_FALSE(dm.shouldWater(5));  // sol très sec, mais pas de config
}

void test_degraded_config_persists_across_reboot() {
    // Le maître pousse une config (CMD_SET_CONFIG) → sauvée NVS.
    // Un reboot (nouvelle instance + begin()) doit recharger la config.
    {
        DegradedMode dm;
        seedDegradedConfig(dm);
        TEST_ASSERT_TRUE(dm.hasValidConfig());
    }
    DegradedMode rebooted;          // simule un reboot : RAM perdue, NVS conservée
    rebooted.begin();
    TEST_ASSERT_TRUE(rebooted.hasValidConfig());
    TEST_ASSERT_EQUAL(30, rebooted.config().moistureMin);
    TEST_ASSERT_EQUAL(70, rebooted.config().moistureMax);
    TEST_ASSERT_EQUAL(60, rebooted.config().pumpDurationS);
    TEST_ASSERT_EQUAL(7200, rebooted.config().cooldownS);
    TEST_ASSERT_EQUAL(4, rebooted.config().maxCyclesPerDay);
}

void test_degraded_waters_when_dry() {
    DegradedMode dm;
    seedDegradedConfig(dm);
    TEST_ASSERT_TRUE(dm.shouldWater(20));   // 20% < seuil 30% → arroser
}

void test_degraded_skips_when_wet() {
    DegradedMode dm;
    seedDegradedConfig(dm);
    TEST_ASSERT_FALSE(dm.shouldWater(50));  // 50% >= seuil 30% → ne pas arroser
    TEST_ASSERT_FALSE(dm.shouldWater(30));  // pile au seuil → ne pas arroser
}

void test_degraded_cooldown_blocks_then_allows() {
    DegradedMode dm;
    seedDegradedConfig(dm);
    MockHW::setMillis(1000UL);
    TEST_ASSERT_TRUE(dm.shouldWater(20));   // sec → OK
    dm.recordCycle();                        // arrosage effectué

    // Pendant le cooldown (7200s) : refus même si toujours sec.
    MockHW::advanceMillis(3600UL * 1000UL);  // +1h < 2h
    TEST_ASSERT_FALSE(dm.shouldWater(20));

    // Après le cooldown : autorisé de nouveau.
    MockHW::advanceMillis(3601UL * 1000UL);  // total > 7200s
    TEST_ASSERT_TRUE(dm.shouldWater(20));
}

void test_degraded_max_cycles_blocks() {
    DegradedMode dm;
    seedDegradedConfig(dm);
    MockHW::setMillis(1000UL);
    // Épuise les 4 cycles autorisés (en sautant le cooldown à chaque fois).
    for (int i = 0; i < 4; i++) {
        TEST_ASSERT_TRUE(dm.shouldWater(20));
        dm.recordCycle();
        MockHW::advanceMillis(7201UL * 1000UL);  // dépasse le cooldown
    }
    // 5e tentative dans la même fenêtre 24h → bloquée par max cycles.
    TEST_ASSERT_FALSE(dm.shouldWater(20));
}

void test_degraded_cycle_counter_resets_after_24h() {
    DegradedMode dm;
    seedDegradedConfig(dm);
    MockHW::setMillis(1000UL);
    for (int i = 0; i < 4; i++) {
        dm.shouldWater(20);
        dm.recordCycle();
        MockHW::advanceMillis(7201UL * 1000UL);
    }
    TEST_ASSERT_FALSE(dm.shouldWater(20));   // quota épuisé

    // Après 24h → le compteur se remet à zéro → arrosage de nouveau possible.
    MockHW::advanceMillis((AUTO_CYCLE_RESET_INTERVAL + 1UL) * 1000UL);
    TEST_ASSERT_TRUE(dm.shouldWater(20));
}

// ============================================================
// T6: SafetyLocal E2E — failsafes locaux (sans relay, sans maître)
// ============================================================

void test_safety_fresh_boot_allows_pump() {
    SafetyLocal sl;
    sl.begin();
    TEST_ASSERT_FALSE(sl.isSafeMode());
    TEST_ASSERT_EQUAL((int)LocalSafetyState::OK, (int)sl.state());
    TEST_ASSERT_TRUE(sl.canPumpRun(80, 150.0f));  // tank OK + courant nominal
}

void test_safety_blocks_pump_on_low_tank() {
    SafetyLocal sl;
    sl.begin();
    TEST_ASSERT_FALSE(sl.canPumpRun(TANK_LEVEL_CRITICAL - 1, 150.0f));
    TEST_ASSERT_TRUE(sl.canPumpRun(TANK_LEVEL_CRITICAL, 150.0f));  // pile au seuil
}

void test_safety_current_failsafes() {
    SafetyLocal sl;
    sl.begin();
    TEST_ASSERT_TRUE(sl.checkCurrent(150.0f));    // nominal
    TEST_ASSERT_FALSE(sl.checkCurrent(3500.0f));  // surintensité > 3A
    TEST_ASSERT_FALSE(sl.checkCurrent(10.0f));    // marche à sec < 50mA
}

void test_safety_runtime_failsafe() {
    SafetyLocal sl;
    sl.begin();
    TEST_ASSERT_TRUE(sl.checkRuntime(PUMP_MAX_RUNTIME_S - 1));
    TEST_ASSERT_FALSE(sl.checkRuntime(PUMP_MAX_RUNTIME_S));  // max runtime atteint
}

void test_safety_boot_loop_triggers_safe_mode() {
    // begin() lit le compteur PUIS l'incrémente. Sans markBootStable(),
    // 3 crashes accumulés déclenchent le safe mode au boot suivant.
    { SafetyLocal s; s.begin(); TEST_ASSERT_FALSE(s.isSafeMode()); } // boot1: 0→1
    { SafetyLocal s; s.begin(); TEST_ASSERT_FALSE(s.isSafeMode()); } // boot2: 1→2
    { SafetyLocal s; s.begin(); TEST_ASSERT_FALSE(s.isSafeMode()); } // boot3: 2→3
    SafetyLocal s4; s4.begin();                                      // boot4: lit 3 → safe
    TEST_ASSERT_TRUE(s4.isSafeMode());
    TEST_ASSERT_EQUAL((int)LocalSafetyState::SAFE_MODE, (int)s4.state());
    TEST_ASSERT_FALSE(s4.canPumpRun(80, 150.0f));  // pompe désactivée en safe mode
}

void test_safety_mark_boot_stable_prevents_safe_mode() {
    // Un boot stable (>60s) remet le compteur à 0 → pas de safe mode ensuite.
    { SafetyLocal s; s.begin(); }  // boot1: 0→1
    { SafetyLocal s; s.begin(); }  // boot2: 1→2
    SafetyLocal s3; s3.begin();    // boot3: 2→3
    s3.markBootStable();           // run stable → compteur 0
    SafetyLocal s4; s4.begin();    // boot4: lit 0 → pas de safe mode
    TEST_ASSERT_FALSE(s4.isSafeMode());
}

void test_safety_reset_safe_mode_recovers() {
    { SafetyLocal s; s.begin(); }
    { SafetyLocal s; s.begin(); }
    { SafetyLocal s; s.begin(); }
    SafetyLocal s4; s4.begin();
    TEST_ASSERT_TRUE(s4.isSafeMode());
    s4.resetSafeMode();                            // équivalent /unlock distant
    TEST_ASSERT_FALSE(s4.isSafeMode());
    TEST_ASSERT_TRUE(s4.canPumpRun(80, 150.0f));   // pompe ré-autorisée
}

// ============================================================
// T7: Scénario intégré — maître perdu, l'esclave décide seul
// ============================================================

void test_e2e_master_lost_autonomous_watering() {
    // Le maître a poussé une config avant de disparaître. L'esclave doit
    // arroser seul UNIQUEMENT si DegradedMode ET SafetyLocal sont d'accord.
    DegradedMode dm;
    seedDegradedConfig(dm);
    SafetyLocal sl;
    sl.begin();
    MockHW::setMillis(1000UL);

    const uint8_t avgMoisture = 20;   // sol sec
    const uint8_t tankLevel   = 80;   // réservoir OK
    const float   pumpCurrent = 150.0f;

    // Double gate : la pompe ne tourne que si les deux disent oui.
    bool canWater = dm.shouldWater(avgMoisture) && sl.canPumpRun(tankLevel, pumpCurrent);
    TEST_ASSERT_TRUE(canWater);
    dm.recordCycle();

    // Réservoir vide → SafetyLocal bloque même si le sol reste sec.
    bool canWaterEmptyTank = dm.shouldWater(avgMoisture) && sl.canPumpRun(5, pumpCurrent);
    TEST_ASSERT_FALSE(canWaterEmptyTank);
}

void test_e2e_master_lost_no_config_stays_safe() {
    // Pire cas : lien maître perdu AVANT toute config. L'esclave ne doit
    // jamais arroser à l'aveugle (fail-safe), même réservoir plein + sol sec.
    DegradedMode dm;
    dm.begin();             // aucune config NVS
    SafetyLocal sl;
    sl.begin();
    bool canWater = dm.shouldWater(10) && sl.canPumpRun(90, 150.0f);
    TEST_ASSERT_FALSE(canWater);
}

// ============================================================
// MAIN
// ============================================================

// setUp/tearDown requis par le mock unity.h natif (RUN_TEST).
// On repart d'une NVS vierge + horloge à zéro avant chaque test pour
// isoler les scénarios DegradedMode/SafetyLocal (qui persistent en NVS).
void setUp(void) {
    Preferences::resetAll();
    MockHW::reset();
}
void tearDown(void) {}

int setup() {
    UNITY_BEGIN();

    RUN_TEST(test_protocol_magic);
    RUN_TEST(test_protocol_cmd_types);
    RUN_TEST(test_protocol_data_types);
    RUN_TEST(test_protocol_sensor_data_under_250);
    RUN_TEST(test_protocol_alert_data_under_250);

    RUN_TEST(test_safety_boot_crash_limit);
    RUN_TEST(test_safety_stable_boot_time);
    RUN_TEST(test_pump_max_runtime);
    RUN_TEST(test_tank_critical_below_warning);

    RUN_TEST(test_degraded_cooldown);
    RUN_TEST(test_degraded_max_cycles);
    RUN_TEST(test_degraded_cycle_reset);

    RUN_TEST(test_ping_interval);
    RUN_TEST(test_max_missed_pongs);
    RUN_TEST(test_master_timeout);
    RUN_TEST(test_sensor_interval);

    // T5 — DegradedMode E2E (arrosage autonome)
    RUN_TEST(test_degraded_no_config_no_watering);
    RUN_TEST(test_degraded_config_persists_across_reboot);
    RUN_TEST(test_degraded_waters_when_dry);
    RUN_TEST(test_degraded_skips_when_wet);
    RUN_TEST(test_degraded_cooldown_blocks_then_allows);
    RUN_TEST(test_degraded_max_cycles_blocks);
    RUN_TEST(test_degraded_cycle_counter_resets_after_24h);

    // T6 — SafetyLocal E2E (failsafes locaux)
    RUN_TEST(test_safety_fresh_boot_allows_pump);
    RUN_TEST(test_safety_blocks_pump_on_low_tank);
    RUN_TEST(test_safety_current_failsafes);
    RUN_TEST(test_safety_runtime_failsafe);
    RUN_TEST(test_safety_boot_loop_triggers_safe_mode);
    RUN_TEST(test_safety_mark_boot_stable_prevents_safe_mode);
    RUN_TEST(test_safety_reset_safe_mode_recovers);

    // T7 — Scénario intégré maître perdu
    RUN_TEST(test_e2e_master_lost_autonomous_watering);
    RUN_TEST(test_e2e_master_lost_no_config_stays_safe);

    return UNITY_END();
}

// Nécessaire pour pio test -e native (platform = native ne génère
// pas de main() automatiquement avec un test_filter custom)
int main(int /*argc*/, char** /*argv*/) {
    return setup();
}

void loop() {}
