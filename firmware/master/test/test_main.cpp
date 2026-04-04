// ============================================================
// Unit Tests — Balcony Hydra v4 Master
// Run: cd firmware/master && pio test -e native
// ============================================================

#include <unity.h>
#include "../../common/Protocol.h"
#include "../../common/config_common.h"

// ============================================================
// T1: Protocol.h — Message structs
// ============================================================

void test_protocol_header_size() {
    TEST_ASSERT_EQUAL(4, sizeof(MsgHeader));
}

void test_protocol_data_sensors_fits_espnow() {
    TEST_ASSERT_LESS_OR_EQUAL(250, sizeof(DataSensors));
}

void test_protocol_data_pump_status_fits() {
    TEST_ASSERT_LESS_OR_EQUAL(250, sizeof(DataPumpStatus));
}

void test_protocol_data_alert_fits() {
    TEST_ASSERT_LESS_OR_EQUAL(250, sizeof(DataAlert));
}

void test_protocol_cmd_set_config_fits() {
    TEST_ASSERT_LESS_OR_EQUAL(250, sizeof(CmdSetConfig));
}

void test_protocol_make_header() {
    MsgHeader h = Protocol::makeHeader((uint8_t)CmdType::CMD_PING);
    TEST_ASSERT_EQUAL(PROTOCOL_MAGIC, h.magic);
    TEST_ASSERT_EQUAL(PROTOCOL_VERSION, h.version);
    TEST_ASSERT_EQUAL((uint8_t)CmdType::CMD_PING, h.type);
}

void test_protocol_validate_header_valid() {
    MsgHeader h = {PROTOCOL_MAGIC, PROTOCOL_VERSION, 0x01, 0};
    TEST_ASSERT_TRUE(Protocol::validateHeader(h));
}

void test_protocol_validate_header_bad_magic() {
    MsgHeader h = {0x00, PROTOCOL_VERSION, 0x01, 0};
    TEST_ASSERT_FALSE(Protocol::validateHeader(h));
}

void test_protocol_validate_header_bad_version() {
    MsgHeader h = {PROTOCOL_MAGIC, 99, 0x01, 0};
    TEST_ASSERT_FALSE(Protocol::validateHeader(h));
}

void test_protocol_type_name() {
    TEST_ASSERT_EQUAL_STRING("PING", Protocol::typeName((uint8_t)CmdType::CMD_PING));
    TEST_ASSERT_EQUAL_STRING("PONG", Protocol::typeName((uint8_t)DataType::DATA_PONG));
    TEST_ASSERT_EQUAL_STRING("SENSORS", Protocol::typeName((uint8_t)DataType::DATA_SENSORS));
    TEST_ASSERT_EQUAL_STRING("PUMP_START", Protocol::typeName((uint8_t)CmdType::CMD_PUMP_START));
    TEST_ASSERT_EQUAL_STRING("ALERT", Protocol::typeName((uint8_t)DataType::DATA_ALERT));
    TEST_ASSERT_EQUAL_STRING("UNKNOWN", Protocol::typeName(0xFF));
}

void test_protocol_seq_increments() {
    MsgHeader h1 = Protocol::makeHeader(0x01);
    MsgHeader h2 = Protocol::makeHeader(0x01);
    TEST_ASSERT_EQUAL(h1.seqNum + 1, h2.seqNum);
}

// ============================================================
// T2: config_common.h — Constants validation
// ============================================================

void test_config_coordinates() {
    TEST_ASSERT_FLOAT_WITHIN(0.1, 43.61, DEFAULT_LATITUDE);
    TEST_ASSERT_FLOAT_WITHIN(0.1, 6.99, DEFAULT_LONGITUDE);
}

void test_config_zones() {
    TEST_ASSERT_EQUAL(2, NUM_ZONES);
    TEST_ASSERT_EQUAL(0, ZONE_A);
    TEST_ASSERT_EQUAL(1, ZONE_B);
    TEST_ASSERT_EQUAL(10, POTS_PER_ZONE);
}

void test_config_pump_limits() {
    TEST_ASSERT_EQUAL(300, PUMP_MAX_RUNTIME_S);  // 5 min
}

void test_config_moisture_defaults() {
    TEST_ASSERT_EQUAL(30, DEFAULT_MOISTURE_MIN);
    TEST_ASSERT_EQUAL(70, DEFAULT_MOISTURE_MAX);
    TEST_ASSERT_GREATER_THAN(MOISTURE_WATER_VALUE, MOISTURE_AIR_VALUE);
}

void test_config_auto_mode() {
    TEST_ASSERT_EQUAL(7200, DEFAULT_AUTO_COOLDOWN_S);  // 2h
    TEST_ASSERT_EQUAL(4, DEFAULT_AUTO_MAX_CYCLES);
    TEST_ASSERT_EQUAL(86400, AUTO_CYCLE_RESET_INTERVAL);  // 24h
}

void test_config_tank_thresholds() {
    TEST_ASSERT_LESS_THAN(TANK_LEVEL_WARNING, 100);
    TEST_ASSERT_LESS_THAN(TANK_LEVEL_CRITICAL, TANK_LEVEL_WARNING);
}

void test_config_safety_temps() {
    TEST_ASSERT_LESS_THAN(SAFETY_TEMP_WARNING, SAFETY_TEMP_CRITICAL);
    TEST_ASSERT_LESS_THAN(SAFETY_TEMP_RESUME, SAFETY_TEMP_WARNING);
}

void test_config_espnow_timing() {
    TEST_ASSERT_EQUAL(60000, ESPNOW_PING_INTERVAL_MS);
    TEST_ASSERT_EQUAL(3, ESPNOW_MAX_MISSED_PONGS);
    // Timeout = 60s * 3 = 180s
    TEST_ASSERT_EQUAL(180000, ESPNOW_PING_INTERVAL_MS * ESPNOW_MAX_MISSED_PONGS);
}

// ============================================================
// T3: Data struct packing
// ============================================================

void test_sensor_reading_packed() {
    TEST_ASSERT_EQUAL(2, sizeof(SensorReading));
}

void test_cmd_ping_packed() {
    TEST_ASSERT_EQUAL(8, sizeof(CmdPing));  // 4 header + 4 uptime
}

void test_cmd_pump_start_packed() {
    TEST_ASSERT_EQUAL(6, sizeof(CmdPumpStart));  // 4 header + 2 duration
}

void test_data_pong_packed() {
    TEST_ASSERT_EQUAL(10, sizeof(DataPong));  // 4+4+2+1+1+1+1 = ~14, check
}

// ============================================================
// T4: Enum values
// ============================================================

void test_watering_modes() {
    // Verify enum values match Protocol expectations
    TEST_ASSERT_EQUAL(0x01, (uint8_t)CmdType::CMD_PING);
    TEST_ASSERT_EQUAL(0x03, (uint8_t)CmdType::CMD_PUMP_START);
    TEST_ASSERT_EQUAL(0x81, (uint8_t)DataType::DATA_PONG);
    TEST_ASSERT_EQUAL(0x82, (uint8_t)DataType::DATA_SENSORS);
}

void test_alert_types() {
    TEST_ASSERT_EQUAL(1, (uint8_t)AlertType::OVERCURRENT);
    TEST_ASSERT_EQUAL(2, (uint8_t)AlertType::DRY_RUN);
    TEST_ASSERT_EQUAL(3, (uint8_t)AlertType::TANK_EMPTY);
}

// ============================================================
// MAIN
// ============================================================

void setup() {
    delay(2000);
    UNITY_BEGIN();

    // Protocol
    RUN_TEST(test_protocol_header_size);
    RUN_TEST(test_protocol_data_sensors_fits_espnow);
    RUN_TEST(test_protocol_data_pump_status_fits);
    RUN_TEST(test_protocol_data_alert_fits);
    RUN_TEST(test_protocol_cmd_set_config_fits);
    RUN_TEST(test_protocol_make_header);
    RUN_TEST(test_protocol_validate_header_valid);
    RUN_TEST(test_protocol_validate_header_bad_magic);
    RUN_TEST(test_protocol_validate_header_bad_version);
    RUN_TEST(test_protocol_type_name);
    RUN_TEST(test_protocol_seq_increments);

    // Config
    RUN_TEST(test_config_coordinates);
    RUN_TEST(test_config_zones);
    RUN_TEST(test_config_pump_limits);
    RUN_TEST(test_config_moisture_defaults);
    RUN_TEST(test_config_auto_mode);
    RUN_TEST(test_config_tank_thresholds);
    RUN_TEST(test_config_safety_temps);
    RUN_TEST(test_config_espnow_timing);

    // Packing
    RUN_TEST(test_sensor_reading_packed);
    RUN_TEST(test_cmd_ping_packed);
    RUN_TEST(test_cmd_pump_start_packed);
    RUN_TEST(test_data_pong_packed);

    // Enums
    RUN_TEST(test_watering_modes);
    RUN_TEST(test_alert_types);

    UNITY_END();
}

void loop() {}
