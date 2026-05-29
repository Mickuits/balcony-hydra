// ============================================================
// protocol_abi_check.cpp — garde-fou ABI / format-sur-le-fil ESP-NOW
// ============================================================
// Toute modification de firmware/common/Protocol.h qui change la TAILLE ou le
// LAYOUT d'un message (donc le format binaire échangé maître↔esclave) casse la
// compilation de ce fichier → la CI échoue AVANT qu'un mismatch de protocole
// n'atteigne le hardware (le maître et l'esclave compilent le même header, mais
// rien ne garantissait jusqu'ici que le format reste stable entre deux commits).
//
// Valeurs « golden » mesurées le 2026-05-29 (g++, structs packed).
// En cas d'évolution VOLONTAIRE du protocole : mettre à jour ces valeurs ET
// bumper PROTOCOL_VERSION (compat ascendante).
//
// Compilation (cf. job protocol-check) :
//   g++ -std=c++17 -I firmware/common -I firmware/master/test/mocks \
//       tools/protocol_abi_check.cpp -o /tmp/abi && /tmp/abi
// ============================================================

#include <cstddef>
#include "Protocol.h"   // tire <Arduino.h> (mock en natif)

// ---- Constantes de protocole ----
static_assert(PROTOCOL_VERSION == 1,   "PROTOCOL_VERSION a changé — bump intentionnel ? MAJ golden + compat.");
static_assert(PROTOCOL_MAGIC   == 0xBA, "PROTOCOL_MAGIC a changé.");

// ---- En-tête + brique élémentaire ----
static_assert(sizeof(MsgHeader)     == 4, "MsgHeader ABI cassé (padding inattendu ?).");
static_assert(sizeof(SensorReading) == 2, "SensorReading ABI cassé.");

// ---- Tailles golden des messages (packed, telles qu'envoyées) ----
static_assert(sizeof(CmdPing)           ==  8, "CmdPing ABI cassé.");
static_assert(sizeof(CmdReadSensors)    ==  4, "CmdReadSensors ABI cassé.");
static_assert(sizeof(CmdPumpStart)      ==  6, "CmdPumpStart ABI cassé.");
static_assert(sizeof(CmdPumpStop)       ==  5, "CmdPumpStop ABI cassé.");
static_assert(sizeof(CmdSetConfig)      == 14, "CmdSetConfig ABI cassé.");
static_assert(sizeof(CmdReboot)         ==  8, "CmdReboot ABI cassé.");
static_assert(sizeof(CmdPairingReq)     ==  6, "CmdPairingReq ABI cassé.");
static_assert(sizeof(CmdPairingConfirm) ==  4, "CmdPairingConfirm ABI cassé.");
static_assert(sizeof(DataPong)          == 14, "DataPong ABI cassé.");
static_assert(sizeof(DataSensors)       == 53, "DataSensors ABI cassé.");
static_assert(sizeof(DataPumpStatus)    == 23, "DataPumpStatus ABI cassé.");
static_assert(sizeof(DataAck)           == 39, "DataAck ABI cassé.");
static_assert(sizeof(DataAlert)         == 53, "DataAlert ABI cassé.");
static_assert(sizeof(DataPairingAck)    ==  6, "DataPairingAck ABI cassé.");

// ---- Header en tête de chaque message (offset 0) — requis pour le dispatch ----
static_assert(offsetof(CmdPing,           header) == 0, "header doit être en tête.");
static_assert(offsetof(CmdSetConfig,      header) == 0, "header doit être en tête.");
static_assert(offsetof(DataPong,          header) == 0, "header doit être en tête.");
static_assert(offsetof(DataSensors,       header) == 0, "header doit être en tête.");
static_assert(offsetof(DataPumpStatus,    header) == 0, "header doit être en tête.");
static_assert(offsetof(DataAck,           header) == 0, "header doit être en tête.");
static_assert(offsetof(DataAlert,         header) == 0, "header doit être en tête.");
static_assert(offsetof(DataPairingAck,    header) == 0, "header doit être en tête.");

// ---- Tout message doit tenir dans la MTU ESP-NOW (250 octets) ----
static_assert(sizeof(DataSensors) <= 250, "Message > MTU ESP-NOW (250 o).");
static_assert(sizeof(DataAck)     <= 250, "Message > MTU ESP-NOW (250 o).");
static_assert(sizeof(DataAlert)   <= 250, "Message > MTU ESP-NOW (250 o).");

int main() { return 0; }
