// ============================================================
// main.cpp — ESCLAVE v4 (Balcon, USB secteur)
//
// Zone A: locale (pompe GPIO 27, 10 capteurs MUX, 2 reservoirs US)
// Communication: EspNowSlave → recoit commandes du maitre
// Mode degrade: arrose seul si maitre perdu
// ============================================================

#include <Arduino.h>
#include <esp_task_wdt.h>

#include "config_slave.h"
#include "../../common/Protocol.h"

#include "SensorManager.h"
#include "PumpController.h"
#include "StatusLED.h"
#include "EspNowSlave.h"
#include "DegradedMode.h"
#include "SafetyLocal.h"

// Minimal ConfigManager stub for SensorManager/PumpController compatibility
// (slave doesn't need full config — uses master's commands)
#include "ConfigManager.h"

// ============================================================
// CLI SÉRIE SLAVE — debug/maintenance via USB (115200 baud)
// Non bloquant : Serial.setTimeout(50) dans setup().
// Toutes les fonctions sont static (portée fichier uniquement).
// ============================================================

static void _printHelp() {
    Serial.println("--- Balcony Hydra Slave CLI ---");
    Serial.println("pairing_status  Affiche l'etat ESP-NOW pairing (MAC maitre)");
    Serial.println("pairing_reset   Efface NVS pairing slave + reboot");
    Serial.println("status          Affiche capteurs, pompe, safety, uptime");
    Serial.println("reboot          Redemarre l'ESP32");
    Serial.println("help / ?        Cette aide");
    Serial.println("-------------------------------");
}

// Instances globales déclarées plus bas — forward declarations pour le CLI.
// Les fonctions _printStatus / _printPairingStatus / _handleSerial sont
// définies APRÈS les instances (elles y accèdent par valeur globale).

// ---- Global instances ----
ConfigManager    configMgr;      // Minimal, defaults only
SensorManager    sensorMgr(configMgr);
PumpController   pumpCtrl(configMgr, sensorMgr);
StatusLED        statusLed;
EspNowSlave      espNow;
DegradedMode     degraded;
SafetyLocal      safetyLocal;

// [DEPRECATED 2026-04-08] Remplacé par le pairing dynamique au premier boot.
// Conservé pour référence et debug uniquement.
// static const uint8_t MASTER_MAC[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};

// ============================================================
// CLI SÉRIE — implémentation (accès aux instances globales)
// ============================================================

/** Affiche l'état de connexion ESP-NOW et le MAC maître persisté. */
static void _printPairingStatus() {
    if (espNow.isPaired()) {
        const uint8_t* mac = espNow.peerMac();
        Serial.printf("ESPNOW: paired=YES  MAC maitre=%02X:%02X:%02X:%02X:%02X:%02X\n",
                      mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    } else {
        Serial.println("ESPNOW: paired=NO  (mode pairing actif — en attente maitre)");
    }
    const char* stateStr = "INCONNU";
    switch (espNow.commState()) {
        case SlaveCommState::WAITING_MASTER: stateStr = "WAITING_MASTER"; break;
        case SlaveCommState::CONNECTED:      stateStr = "CONNECTED";      break;
        case SlaveCommState::MASTER_LOST:    stateStr = "MASTER_LOST";    break;
    }
    Serial.printf("ESPNOW: commState=%s\n", stateStr);
}

/** Affiche un snapshot complet de l'état esclave (capteurs, pompe, safety, uptime). */
static void _printStatus() {
    Serial.println("--- Status Esclave ---");
    Serial.printf("Uptime        : %lu s\n", millis() / 1000);

    // Capteurs
    const auto& d = sensorMgr.data();
    Serial.printf("Humidite moy  : %u%%\n", d.avgMoisture);
    Serial.printf("Reservoir     : %u%% (%s)\n",
                  d.tank[0].levelPct,
                  d.tank[0].valid ? "valide" : "INVALIDE");
    if (d.environment.valid) {
        Serial.printf("BME280        : T=%.1f°C  H=%.1f%%  P=%.1f hPa\n",
                      d.environment.temperature,
                      d.environment.humidity,
                      d.environment.pressure);
    } else {
        Serial.println("BME280        : INVALIDE");
    }
    if (d.pump.valid) {
        Serial.printf("INA219        : %.0f mA  %.2f V\n",
                      d.pump.current_mA, d.pump.voltage);
    } else {
        Serial.println("INA219        : INVALIDE");
    }

    // Pompe
    const auto& zs = pumpCtrl.zoneStatus(0);
    const char* pumpStateStr = "INCONNU";
    switch (zs.state) {
        case PumpState::IDLE:    pumpStateStr = "IDLE";    break;
        case PumpState::RUNNING: pumpStateStr = "RUNNING"; break;
        case PumpState::BLOCKED: pumpStateStr = "BLOCKED"; break;
        case PumpState::ERROR:   pumpStateStr = "ERROR";   break;
    }
    Serial.printf("Pompe A       : %s  failsafe=%s  cycles=%lu\n",
                  pumpStateStr,
                  zs.failsafeActive ? "OUI" : "non",
                  (unsigned long)zs.totalCycleCount);

    // Safety
    Serial.printf("SafetyLocal   : safeMode=%s  etat=%u  raison=%s\n",
                  safetyLocal.isSafeMode() ? "OUI" : "non",
                  (uint8_t)safetyLocal.state(),
                  safetyLocal.blockReason());

    // ESP-NOW
    _printPairingStatus();
    Serial.println("---------------------");
}

/** Traitement non bloquant du CLI série. Appelé en tête de loop(). */
static void _handleSerial() {
    if (!Serial.available()) return;

    // readStringUntil('\n') respecte Serial.setTimeout(50) → max 50ms de blocage.
    String line = Serial.readStringUntil('\n');
    line.trim();
    line.toLowerCase();
    if (line.length() == 0) return;

    if (line == "help" || line == "?") {
        _printHelp();
    } else if (line == "status") {
        _printStatus();
    } else if (line == "pairing_status") {
        _printPairingStatus();
    } else if (line == "pairing_reset") {
        Serial.println("Reset pairing NVS slave + reboot dans 200ms...");
        espNow.resetPairing();
        delay(200);
        ESP.restart();
    } else if (line == "reboot") {
        Serial.println("Rebooting...");
        delay(100);
        ESP.restart();
    } else {
        Serial.printf("[CLI] Commande inconnue : '%s'  (tape 'help')\n", line.c_str());
    }
}

// ---- Sensor data buffer for sending to master ----
DataSensors buildSensorData() {
    DataSensors ds;
    ds.header = Protocol::makeHeader((uint8_t)DataType::DATA_SENSORS);

    const auto& data = sensorMgr.data();
    for (uint8_t i = 0; i < 10; i++) {
        ds.moisture[i].percent = data.moisture[i].percent;
        ds.moisture[i].valid = data.moisture[i].valid ? 1 : 0;
    }
    ds.avgMoisture = data.avgMoisture;
    ds.tankLevelPct = data.tank[0].valid ? data.tank[0].levelPct : 0;
    ds.tankCm = data.tank[0].distanceCm;
    ds.temperature = data.environment.valid ? data.environment.temperature : 0;
    ds.humidity = data.environment.valid ? data.environment.humidity : 0;
    ds.pressure = data.environment.valid ? data.environment.pressure : 0;
    ds.pumpCurrentMA = data.pump.valid ? data.pump.current_mA : 0;
    ds.pumpVoltage = data.pump.valid ? data.pump.voltage : 0;
    ds.bmeValid = data.environment.valid ? 1 : 0;
    ds.inaValid = data.pump.valid ? 1 : 0;
    ds.tankValid = data.tank[0].valid ? 1 : 0;

    return ds;
}

DataPumpStatus buildPumpStatus() {
    DataPumpStatus ps;
    ps.header = Protocol::makeHeader((uint8_t)DataType::DATA_PUMP_STATUS);

    const auto& zs = pumpCtrl.zoneStatus(0);
    ps.state = (uint8_t)zs.state;
    ps.lastStopReason = (uint8_t)zs.lastStopReason;
    ps.runningForS = pumpCtrl.runningForS(0);
    ps.lastRunDurationS = zs.lastRunDurationS;
    ps.totalCycles = zs.totalCycleCount;
    ps.lastCurrentMA = zs.lastCurrent_mA;
    ps.failsafeActive = zs.failsafeActive ? 1 : 0;

    return ps;
}

// ---- ESP-NOW command callbacks ----
void onPumpStart(uint16_t durationS) {
    if (safetyLocal.isSafeMode()) {
        espNow.sendAlert(AlertType::SENSOR_FAIL, "SAFE MODE — pompe OFF");
        return;
    }
    if (!safetyLocal.canPumpRun(sensorMgr.tankLevel(), sensorMgr.pumpCurrent())) {
        espNow.sendAlert(AlertType::TANK_EMPTY, "Pompe refusee — failsafe");
        return;
    }
    pumpCtrl.start(0, durationS);
    statusLed.setState(LedState::WATERING);
    Serial.printf("[SLAVE] Pompe A ON %ds (commande maitre)\n", durationS);
}

void onPumpStop(uint8_t reason) {
    pumpCtrl.stop(0, (PumpStopReason)reason);
    statusLed.setState(LedState::OK);
    Serial.println("[SLAVE] Pompe A OFF (commande maitre)");
}

void onReadSensors() {
    sensorMgr.readAll();
    DataSensors ds = buildSensorData();
    espNow.sendSensors(ds);
}

void onSetConfig(const CmdSetConfig& cfg) {
    // Save config for degraded mode
    degraded.saveConfig(cfg.moistureMin, cfg.moistureMax,
                        cfg.pumpDurationS, cfg.cooldownS, cfg.maxCycles);
    Serial.println("[SLAVE] Config recue et sauvee en NVS");
}

void onReboot(uint32_t delayMs) {
    Serial.printf("[SLAVE] Reboot dans %dms...\n", delayMs);
    delay(delayMs > 0 ? delayMs : 500);
    ESP.restart();
}

// ============================================================
// MAIN LOOP — single-threaded (slave is simpler)
// ============================================================
uint32_t lastSensorRead = 0;
uint32_t lastPongSent = 0;

void setup() {
    Serial.begin(115200);
    // Timeout 50ms pour readStringUntil() dans le CLI — évite de bloquer le watchdog 30s.
    Serial.setTimeout(50);
    delay(1000);

    Serial.println();
    Serial.println("========================================");
    Serial.printf( "  BALCONY HYDRA v%s — ESCLAVE\n", HYDRA_VERSION);
    Serial.println("  Zone A balcon, USB secteur");
    Serial.println("========================================");

    // 1 — LED
    statusLed.begin();
    statusLed.setState(LedState::BOOT);

    // 2 — Config (minimal defaults)
    configMgr.begin();

    // 3 — Sensors
    sensorMgr.begin();

    // 4 — SafetyLocal
    safetyLocal.begin();
    if (safetyLocal.isSafeMode()) {
        Serial.println("[SLAVE] SAFE MODE — pompe desactivee");
        pinMode(PIN_PUMP_A, OUTPUT);
        digitalWrite(PIN_PUMP_A, LOW);
        statusLed.setState(LedState::CRITICAL);
    }

    // 5 — PumpController
    if (!safetyLocal.isSafeMode()) {
        pumpCtrl.begin();
    }

    // 6 — DegradedMode (load last config from NVS)
    degraded.begin();

    // 7 — ESP-NOW
    // Pairing dynamique : le MAC maître est chargé depuis NVS (namespace "espnow").
    // Si absent (premier boot), l'esclave écoute en broadcast et attend CMD_PAIRING_REQ
    // du maître, répond DATA_PAIRING_ACK, puis persiste le MAC maître en NVS.
    // [DEPRECATED 2026-04-08] MASTER_MAC conservé pour référence uniquement.
    // static const uint8_t MASTER_MAC[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
    espNow.begin();
    SlaveCallbacks cb;
    cb.onPumpStart = onPumpStart;
    cb.onPumpStop = onPumpStop;
    cb.onReadSensors = onReadSensors;
    cb.onSetConfig = onSetConfig;
    cb.onReboot = onReboot;
    espNow.setCallbacks(cb);

    statusLed.setState(LedState::AP_MODE);  // Yellow: waiting for master
    Serial.println("[SLAVE] En attente du maitre...");

    // Mark boot stable after 60s
    delay(100);

    // Watchdog 30s
    esp_task_wdt_init(30, true);
    esp_task_wdt_add(NULL);

    // Initial read
    sensorMgr.readAll();
    lastSensorRead = millis();
}

void loop() {
    esp_task_wdt_reset();

    // ---- CLI série (non bloquant, timeout 50ms) ----
    _handleSerial();

    // ---- ESP-NOW update (check master timeout) ----
    espNow.update();

    // ---- Pump update (check runtime, failsafes) ----
    pumpCtrl.update();

    // ---- Runtime safety checks while pump running ----
    if (pumpCtrl.isRunning(0)) {
        float currentMA = sensorMgr.pumpCurrent();
        if (!safetyLocal.checkCurrent(currentMA)) {
            pumpCtrl.stop(0, PumpStopReason::OVERCURRENT);
            espNow.sendAlert(AlertType::OVERCURRENT, "Surintensite pompe A!");
            statusLed.setState(LedState::CRITICAL);
        }
        if (!safetyLocal.checkRuntime(pumpCtrl.runningForS(0))) {
            pumpCtrl.stop(0, PumpStopReason::MAX_RUNTIME);
            espNow.sendAlert(AlertType::MAX_RUNTIME, "Max runtime pompe A!");
        }
    }

    // ---- Sensor read every 30s ----
    if (millis() - lastSensorRead >= ESPNOW_SENSOR_INTERVAL_MS) {
        sensorMgr.readAll();
        lastSensorRead = millis();

        // Tank check
        if (!safetyLocal.checkTank(sensorMgr.tankLevel())) {
            if (pumpCtrl.isRunning(0)) {
                pumpCtrl.stop(0, PumpStopReason::TANK_EMPTY);
                espNow.sendAlert(AlertType::TANK_EMPTY, "Reservoir balcon vide!");
            }
        }
    }

    // ---- Send PONG when master PINGs (handled in callback, but also periodic) ----
    if (espNow.isMasterConnected() && millis() - lastPongSent >= ESPNOW_PING_INTERVAL_MS) {
        uint8_t mode = espNow.isMasterLost() ? 1 : 0;
        espNow.sendPong(millis(), 0, WiFi.RSSI(), mode,
                        (uint8_t)pumpCtrl.zoneStatus(0).state,
                        pumpCtrl.zoneStatus(0).failsafeActive ? 1 : 0);
        lastPongSent = millis();
    }

    // ---- LED state ----
    if (safetyLocal.isSafeMode()) {
        statusLed.setState(LedState::CRITICAL);
    } else if (espNow.isMasterLost()) {
        // Degraded mode: yellow blink
        static uint32_t lastBlink = 0;
        if (millis() - lastBlink > 500) {
            static bool on = false;
            statusLed.setState(on ? LedState::WARNING : LedState::OFF);
            on = !on;
            lastBlink = millis();
        }
    } else if (pumpCtrl.isRunning(0)) {
        statusLed.setState(LedState::WATERING);
    } else if (pumpCtrl.isBlocked(0)) {
        statusLed.setState(LedState::FAILSAFE);
    } else if (espNow.isMasterConnected()) {
        statusLed.setState(LedState::OK);
    }

    // ---- MODE DEGRADE: local watering if master lost ----
    if (espNow.isMasterLost() && !safetyLocal.isSafeMode()) {
        if (millis() - lastSensorRead < 5000) {  // Just read sensors
            uint8_t avg = sensorMgr.avgMoisture();
            if (degraded.shouldWater(avg)) {
                if (safetyLocal.canPumpRun(sensorMgr.tankLevel(), sensorMgr.pumpCurrent())) {
                    uint16_t dur = degraded.config().pumpDurationS;
                    pumpCtrl.start(0, dur);
                    degraded.recordCycle();
                    Serial.printf("[SLAVE] MODE DEGRADE: arrosage local %ds\n", dur);
                    statusLed.setState(LedState::WATERING);
                }
            }
        }
    }

    // Mark boot stable after 60s
    static bool bootStable = false;
    if (!bootStable && millis() > 60000) {
        safetyLocal.markBootStable();
        bootStable = true;
    }

    delay(100);  // 10 Hz main loop
}
