// ============================================================
// Protocol.h — Messages ESP-NOW bidirectionnels Maître ↔ Esclave
//
// Shared between firmware/master and firmware/slave
// Include via: #include "../../common/Protocol.h"
//
// ESP-NOW payload max: 250 bytes
// All structs packed, little-endian (ESP32 native)
// Message format: [MsgHeader][Payload]
// ============================================================

#pragma once

#include <Arduino.h>

// ---- PROTOCOL VERSION ----
constexpr uint8_t PROTOCOL_VERSION = 1;
constexpr uint8_t PROTOCOL_MAGIC   = 0xBA;  // "BA" for BAlcony

// ---- MESSAGE TYPES ----

// Maître → Esclave (Commands)
enum class CmdType : uint8_t {
    CMD_PING            = 0x01,  // Heartbeat, esclave répond DATA_PONG
    CMD_READ_SENSORS    = 0x02,  // Demande lecture capteurs
    CMD_PUMP_START      = 0x03,  // Démarrer pompe A
    CMD_PUMP_STOP       = 0x04,  // Arrêter pompe A
    CMD_SET_CONFIG      = 0x05,  // Envoyer config (seuils, durée, profils)
    CMD_REBOOT          = 0x06,  // Reboot esclave
    CMD_OTA_BEGIN       = 0x07,  // Préparer OTA (future use)
    // Pairing dynamique (premier boot)
    CMD_PAIRING_REQ     = 0x10,  // Broadcast: "Maître ici, quelqu'un ?"
    CMD_PAIRING_CONFIRM = 0x11,  // Unicast: "Pairing confirmé par le maître"
};

// Esclave → Maître (Data)
enum class DataType : uint8_t {
    DATA_PONG         = 0x81,  // Réponse au PING
    DATA_SENSORS      = 0x82,  // Données capteurs complètes
    DATA_PUMP_STATUS  = 0x83,  // État pompe A
    DATA_ACK          = 0x84,  // Acquittement commande
    DATA_ALERT        = 0x85,  // Alerte locale (failsafe, etc.)
    // Pairing dynamique (premier boot)
    DATA_PAIRING_ACK  = 0x90,  // Unicast: "Esclave ici, je suis à toi"
};

// Type d'appareil — utilisé dans les messages de pairing
enum class DeviceType : uint8_t {
    UNKNOWN = 0,
    MASTER  = 1,
    SLAVE   = 2,
};

// ---- MESSAGE HEADER (4 bytes) ----
struct __attribute__((packed)) MsgHeader {
    uint8_t  magic;       // PROTOCOL_MAGIC (0xBA)
    uint8_t  version;     // PROTOCOL_VERSION
    uint8_t  type;        // CmdType or DataType
    uint8_t  seqNum;      // Sequence number (for ACK matching)
};

// ---- MAÎTRE → ESCLAVE PAYLOADS ----

struct __attribute__((packed)) CmdPing {
    MsgHeader header;
    uint32_t  masterUptime;  // millis() du maître
};

struct __attribute__((packed)) CmdReadSensors {
    MsgHeader header;
    // No payload — just the command
};

struct __attribute__((packed)) CmdPumpStart {
    MsgHeader header;
    uint16_t  durationS;     // Durée en secondes (0 = use local config)
};

struct __attribute__((packed)) CmdPumpStop {
    MsgHeader header;
    uint8_t   reason;        // PumpStopReason cast to uint8
};

struct __attribute__((packed)) CmdSetConfig {
    MsgHeader header;
    uint8_t   moistureMin;   // Seuil humidité min (%)
    uint8_t   moistureMax;   // Seuil humidité max (%)
    uint16_t  pumpDurationS; // Durée pompe par défaut
    uint32_t  cooldownS;     // Cooldown entre cycles auto
    uint8_t   maxCycles;     // Max cycles/24h
    uint8_t   wateringMode;  // WateringMode cast to uint8
};

struct __attribute__((packed)) CmdReboot {
    MsgHeader header;
    uint32_t  delayMs;       // Délai avant reboot (0 = immédiat)
};

// ---- PAIRING PAYLOADS ----

struct __attribute__((packed)) CmdPairingReq {
    MsgHeader header;
    uint8_t   deviceType;      // DeviceType::MASTER (1)
    uint8_t   firmwareVersion; // PROTOCOL_VERSION — vérif compat future
};

struct __attribute__((packed)) CmdPairingConfirm {
    MsgHeader header;
    // Pas de payload — la réception de ce message scelle le pairing
};

// ---- ESCLAVE → MAÎTRE PAYLOADS ----

struct __attribute__((packed)) DataPong {
    MsgHeader header;
    uint32_t  slaveUptime;      // millis() esclave
    uint16_t  batteryMV;        // Tension batterie (mV) via ADC
    int8_t    rssi;             // Signal WiFi/ESP-NOW (dBm)
    uint8_t   mode;             // 0=normal, 1=degraded
    uint8_t   pumpState;        // PumpState cast to uint8
    uint8_t   failsafeActive;   // bool
};

struct __attribute__((packed)) SensorReading {
    uint8_t  percent;     // Humidité 0-100%
    uint8_t  valid;       // bool
};

struct __attribute__((packed)) DataSensors {
    MsgHeader      header;
    SensorReading  moisture[10];    // 10 capteurs zone A (20 bytes)
    uint8_t        avgMoisture;     // Moyenne zone A
    uint8_t        tankLevelPct;    // Niveau réservoir (%)
    float          tankCm;          // Distance US (cm)
    float          temperature;     // BME280 T° (°C)
    float          humidity;        // BME280 HR (%)
    float          pressure;        // BME280 P (hPa)
    float          pumpCurrentMA;   // INA219 (mA)
    float          pumpVoltage;     // INA219 (V)
    uint8_t        bmeValid;        // bool
    uint8_t        inaValid;        // bool
    uint8_t        tankValid;       // bool
};
// sizeof(DataSensors) = 4 + 20 + 1 + 1 + 4 + 4 + 4 + 4 + 4 + 4 + 3 = 53 bytes ✓ (<250)

struct __attribute__((packed)) DataPumpStatus {
    MsgHeader header;
    uint8_t   state;            // PumpState
    uint8_t   lastStopReason;   // PumpStopReason
    uint32_t  runningForS;      // Temps pompage en cours (s)
    uint32_t  lastRunDurationS; // Durée dernier cycle (s)
    uint32_t  totalCycles;      // Total cycles depuis boot
    float     lastCurrentMA;    // Dernier courant mesuré
    uint8_t   failsafeActive;   // bool
};

struct __attribute__((packed)) DataAck {
    MsgHeader header;
    uint8_t   cmdType;     // CmdType de la commande acquittée
    uint8_t   seqNum;      // seqNum de la commande acquittée
    uint8_t   success;     // bool
    char      message[32]; // Message optionnel
};

// Alert types
enum class AlertType : uint8_t {
    OVERCURRENT   = 1,
    DRY_RUN       = 2,
    TANK_EMPTY    = 3,
    MAX_RUNTIME   = 4,
    SENSOR_FAIL   = 5,
    BATTERY_LOW   = 6,
    THERMAL       = 7,
};

struct __attribute__((packed)) DataAlert {
    MsgHeader header;
    uint8_t   alertType;   // AlertType
    char      message[48]; // Description en français
};

struct __attribute__((packed)) DataPairingAck {
    MsgHeader header;
    uint8_t   deviceType;      // DeviceType::SLAVE (2)
    uint8_t   firmwareVersion; // PROTOCOL_VERSION — vérif compat future
};

// ---- UTILITY FUNCTIONS ----

namespace Protocol {
    // Create a header with auto-incrementing sequence number
    inline MsgHeader makeHeader(uint8_t type) {
        static uint8_t seq = 0;
        return { PROTOCOL_MAGIC, PROTOCOL_VERSION, type, seq++ };
    }

    // Validate a received header
    inline bool validateHeader(const MsgHeader& h) {
        return h.magic == PROTOCOL_MAGIC && h.version == PROTOCOL_VERSION;
    }

    // Get message type name (for logging)
    inline const char* typeName(uint8_t type) {
        switch (type) {
            case (uint8_t)CmdType::CMD_PING:             return "PING";
            case (uint8_t)CmdType::CMD_READ_SENSORS:     return "READ_SENSORS";
            case (uint8_t)CmdType::CMD_PUMP_START:       return "PUMP_START";
            case (uint8_t)CmdType::CMD_PUMP_STOP:        return "PUMP_STOP";
            case (uint8_t)CmdType::CMD_SET_CONFIG:       return "SET_CONFIG";
            case (uint8_t)CmdType::CMD_REBOOT:           return "REBOOT";
            case (uint8_t)CmdType::CMD_PAIRING_REQ:      return "PAIRING_REQ";
            case (uint8_t)CmdType::CMD_PAIRING_CONFIRM:  return "PAIRING_CONFIRM";
            case (uint8_t)DataType::DATA_PONG:           return "PONG";
            case (uint8_t)DataType::DATA_SENSORS:        return "SENSORS";
            case (uint8_t)DataType::DATA_PUMP_STATUS:    return "PUMP_STATUS";
            case (uint8_t)DataType::DATA_ACK:            return "ACK";
            case (uint8_t)DataType::DATA_ALERT:          return "ALERT";
            case (uint8_t)DataType::DATA_PAIRING_ACK:    return "PAIRING_ACK";
            default: return "UNKNOWN";
        }
    }

    // sizeof checks (compile-time)
    static_assert(sizeof(DataSensors) <= 250, "DataSensors exceeds ESP-NOW max payload");
    static_assert(sizeof(DataPumpStatus) <= 250, "DataPumpStatus exceeds ESP-NOW max payload");
    static_assert(sizeof(DataAlert) <= 250, "DataAlert exceeds ESP-NOW max payload");
    static_assert(sizeof(CmdSetConfig) <= 250, "CmdSetConfig exceeds ESP-NOW max payload");
    static_assert(sizeof(CmdPairingReq) <= 250, "CmdPairingReq exceeds ESP-NOW max payload");
    static_assert(sizeof(CmdPairingConfirm) <= 250, "CmdPairingConfirm exceeds ESP-NOW max payload");
    static_assert(sizeof(DataPairingAck) <= 250, "DataPairingAck exceeds ESP-NOW max payload");
}
