// ============================================================
// protocol_twin_test.cpp — digital-twin ESP-NOW maître ↔ esclave
// ============================================================
// Comble le plus gros trou SIL : « ESP-NOW jamais testé bout-en-bout ».
// On simule le FIL ESP-NOW par un buffer d'octets et un memcpy des structs
// packed — c'est exactement ce que font esp_now_send()/recv() (copie brute).
// On valide ainsi la sérialisation/désérialisation RÉELLE du protocole,
// indépendamment du hardware radio :
//   - handshake de pairing 3-way
//   - PING/PONG, PUMP_START/ACK
//   - round-trip complet DataSensors (dont floats bit-exacts)
//   - signalement de pannes (DataAlert pour chaque AlertType)
//   - rejet d'un en-tête corrompu (magic/version)
//
// Build (cf. job system-sim) :
//   g++ -std=c++17 -I firmware/common -I firmware/master/test/mocks \
//       tools/protocol_twin_test.cpp -o /tmp/twin && /tmp/twin
// Sortie : exit 0 si tout passe, !=0 sinon (gate CI).
// ============================================================

#include <cstdio>
#include <cstring>
#include <cstdint>
#include "Protocol.h"   // tire <Arduino.h> (mock natif)

static int g_fail = 0;
#define CHECK(cond, msg) do { \
    if (!(cond)) { printf("  ❌ FAIL: %s\n", msg); ++g_fail; } \
    else        { printf("  ✅ %s\n", msg); } \
} while (0)

// --- Le « fil » ESP-NOW : MTU 250 o, copie brute (comme esp_now_send/recv) ---
static constexpr size_t ESPNOW_MTU = 250;

template <typename T>
static void wireSend(const T& src, uint8_t* wire, size_t& len) {
    static_assert(sizeof(T) <= ESPNOW_MTU, "message > MTU ESP-NOW");
    len = sizeof(T);
    memcpy(wire, &src, len);
}
template <typename T>
static T wireRecv(const uint8_t* wire) {
    T dst;
    memcpy(&dst, wire, sizeof(T));
    return dst;
}

int main() {
    uint8_t wire[ESPNOW_MTU];
    size_t  len = 0;

    printf("== Twin 1/6 : handshake pairing 3-way ==\n");
    {
        // Maître → broadcast CmdPairingReq
        CmdPairingReq req{};
        req.header = Protocol::makeHeader((uint8_t)CmdType::CMD_PAIRING_REQ);
        req.deviceType = (uint8_t)DeviceType::MASTER;
        req.firmwareVersion = PROTOCOL_VERSION;
        wireSend(req, wire, len);

        auto rxReq = wireRecv<CmdPairingReq>(wire);
        CHECK(Protocol::validateHeader(rxReq.header), "esclave valide l'en-tête du REQ");
        CHECK(rxReq.header.type == (uint8_t)CmdType::CMD_PAIRING_REQ, "type = CMD_PAIRING_REQ");
        CHECK(rxReq.deviceType == (uint8_t)DeviceType::MASTER, "deviceType = MASTER");

        // Esclave → unicast DataPairingAck
        DataPairingAck ack{};
        ack.header = Protocol::makeHeader((uint8_t)DataType::DATA_PAIRING_ACK);
        ack.deviceType = (uint8_t)DeviceType::SLAVE;
        ack.firmwareVersion = PROTOCOL_VERSION;
        wireSend(ack, wire, len);

        auto rxAck = wireRecv<DataPairingAck>(wire);
        CHECK(Protocol::validateHeader(rxAck.header), "maître valide l'en-tête de l'ACK");
        CHECK(rxAck.deviceType == (uint8_t)DeviceType::SLAVE, "deviceType ACK = SLAVE");

        // Maître → unicast CmdPairingConfirm
        CmdPairingConfirm cfm{};
        cfm.header = Protocol::makeHeader((uint8_t)CmdType::CMD_PAIRING_CONFIRM);
        wireSend(cfm, wire, len);
        auto rxCfm = wireRecv<CmdPairingConfirm>(wire);
        CHECK(rxCfm.header.type == (uint8_t)CmdType::CMD_PAIRING_CONFIRM, "esclave reçoit CONFIRM");
    }

    printf("== Twin 2/6 : PING -> PONG ==\n");
    {
        CmdPing ping{};
        ping.header = Protocol::makeHeader((uint8_t)CmdType::CMD_PING);
        ping.masterUptime = 123456;
        wireSend(ping, wire, len);
        auto rxPing = wireRecv<CmdPing>(wire);
        CHECK(rxPing.masterUptime == 123456u, "masterUptime round-trip");

        DataPong pong{};
        pong.header = Protocol::makeHeader((uint8_t)DataType::DATA_PONG);
        pong.slaveUptime = 7890; pong.mode = 1; pong.pumpState = 2; pong.failsafeActive = 0;
        wireSend(pong, wire, len);
        auto rxPong = wireRecv<DataPong>(wire);
        CHECK(rxPong.slaveUptime == 7890u && rxPong.mode == 1 && rxPong.pumpState == 2,
              "PONG uptime/mode/pumpState round-trip");
    }

    printf("== Twin 3/6 : PUMP_START -> ACK ==\n");
    {
        CmdPumpStart ps{};
        ps.header = Protocol::makeHeader((uint8_t)CmdType::CMD_PUMP_START);
        ps.durationS = 120;
        wireSend(ps, wire, len);
        auto rxPs = wireRecv<CmdPumpStart>(wire);
        CHECK(rxPs.durationS == 120, "durationS round-trip");

        DataAck ack{};
        ack.header = Protocol::makeHeader((uint8_t)DataType::DATA_ACK);
        ack.cmdType = (uint8_t)CmdType::CMD_PUMP_START;
        ack.success = 1;
        strncpy(ack.message, "pump A started", sizeof(ack.message) - 1);
        wireSend(ack, wire, len);
        auto rxAck = wireRecv<DataAck>(wire);
        CHECK(rxAck.success == 1 && rxAck.cmdType == (uint8_t)CmdType::CMD_PUMP_START,
              "ACK success + cmdType");
        CHECK(strcmp(rxAck.message, "pump A started") == 0, "message ACK intact");
    }

    printf("== Twin 4/6 : DataSensors round-trip complet ==\n");
    {
        DataSensors s{};
        s.header = Protocol::makeHeader((uint8_t)DataType::DATA_SENSORS);
        for (int i = 0; i < 10; ++i) { s.moisture[i].percent = (uint8_t)(i * 10); s.moisture[i].valid = 1; }
        s.avgMoisture = 45; s.tankLevelPct = 80;
        s.tankCm = 12.5f; s.temperature = 23.5f; s.humidity = 61.0f; s.pressure = 1013.25f;
        s.pumpCurrentMA = 850.0f; s.pumpVoltage = 12.1f;
        s.bmeValid = 1; s.inaValid = 1; s.tankValid = 1;
        wireSend(s, wire, len);
        CHECK(len == sizeof(DataSensors) && len == 53, "taille DataSensors = 53 o sur le fil");

        auto r = wireRecv<DataSensors>(wire);
        bool moistOk = true;
        for (int i = 0; i < 10; ++i)
            if (r.moisture[i].percent != (uint8_t)(i * 10) || !r.moisture[i].valid) moistOk = false;
        CHECK(moistOk, "10 capteurs humidité round-trip");
        CHECK(r.avgMoisture == 45 && r.tankLevelPct == 80, "avg + tank %% round-trip");
        // floats bit-exacts (memcpy préserve la représentation)
        CHECK(r.temperature == 23.5f && r.pressure == 1013.25f && r.pumpCurrentMA == 850.0f,
              "floats (T°, P, courant) bit-exacts");
        CHECK(r.bmeValid && r.inaValid && r.tankValid, "flags validité round-trip");
    }

    printf("== Twin 5/6 : signalement de pannes (DataAlert) ==\n");
    {
        const AlertType faults[] = {
            AlertType::OVERCURRENT, AlertType::DRY_RUN, AlertType::TANK_EMPTY,
            AlertType::MAX_RUNTIME, AlertType::THERMAL
        };
        const char* labels[] = {
            "surintensite pompe A", "marche a sec", "reservoir vide",
            "runtime max depasse", "temperature critique"
        };
        bool allOk = true;
        for (size_t i = 0; i < sizeof(faults) / sizeof(faults[0]); ++i) {
            DataAlert a{};
            a.header = Protocol::makeHeader((uint8_t)DataType::DATA_ALERT);
            a.alertType = (uint8_t)faults[i];
            strncpy(a.message, labels[i], sizeof(a.message) - 1);
            wireSend(a, wire, len);
            auto r = wireRecv<DataAlert>(wire);
            if (r.alertType != (uint8_t)faults[i] || strcmp(r.message, labels[i]) != 0) allOk = false;
        }
        CHECK(allOk, "5 types de panne (overcurrent/dry-run/tank/runtime/thermal) round-trip");
    }

    printf("== Twin 6/6 : rejet d'en-tête corrompu ==\n");
    {
        CmdPing ping{};
        ping.header = Protocol::makeHeader((uint8_t)CmdType::CMD_PING);
        wireSend(ping, wire, len);

        auto ok = wireRecv<CmdPing>(wire);
        CHECK(Protocol::validateHeader(ok.header), "en-tête valide accepté");

        uint8_t bad[ESPNOW_MTU]; memcpy(bad, wire, len);
        bad[0] = 0xFF;  // magic corrompu
        auto corruptMagic = wireRecv<CmdPing>(bad);
        CHECK(!Protocol::validateHeader(corruptMagic.header), "magic corrompu REJETÉ");

        memcpy(bad, wire, len);
        bad[1] = 99;    // version incompatible
        auto badVer = wireRecv<CmdPing>(bad);
        CHECK(!Protocol::validateHeader(badVer.header), "version incompatible REJETÉE");
    }

    printf("\n%s (%d échec(s))\n", g_fail ? "❌ TWIN ÉCHEC" : "✅ TWIN OK", g_fail);
    return g_fail ? 1 : 0;
}
