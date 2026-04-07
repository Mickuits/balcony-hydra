// ============================================================
// Unit Tests — Balcony Hydra v4 Slave
// Run: cd firmware/slave && pio test -e native
// ============================================================

#include <unity.h>
#include "../../common/Protocol.h"
#include "../../common/config_common.h"

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
// MAIN
// ============================================================

// setUp/tearDown requis par le mock unity.h natif (RUN_TEST)
void setUp(void) {}
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

    UNITY_END();
}

// Nécessaire pour pio test -e native (platform = native ne génère
// pas de main() automatiquement avec un test_filter custom)
int main(int /*argc*/, char** /*argv*/) {
    return setup();
}

void loop() {}
