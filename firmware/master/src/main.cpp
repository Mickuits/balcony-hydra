// ============================================================
// main.cpp — MAITRE v4 (Interieur, USB secteur)
//
// Zone B: locale (pompe GPIO 27, 10 capteurs MUX, 1 reservoir US)
// Zone A: distante via EspNowMaster (esclave balcon)
// TFT Dashboard ILI9341 + tactile XPT2046
// ============================================================

#include <Arduino.h>
#include <ArduinoOTA.h>
#include <esp_task_wdt.h>

#include "config_master.h"
#include "../../common/Protocol.h"

#include "ConfigManager.h"
#include "SensorManager.h"
#include "PumpController.h"
#include "SafetyManager.h"
#include "StatusLED.h"
#include "WifiManager.h"
#include "WebPortal.h"
#include "MqttClient.h"
#include "TelegramBot.h"
#include "SleepManager.h"
#include "TimeManager.h"
#include "PlantProfile.h"
#include "AutonomyCalculator.h"
#include "WiFiGeolocation.h"
#include "EspNowMaster.h"
#include "TftDashboard.h"

// ---- Global instances ----
ConfigManager     configMgr;
SensorManager     sensorMgr(configMgr);       // Zone B local sensors
PumpController    pumpCtrl(configMgr, sensorMgr);
WifiManager       wifiMgr(configMgr);
WebPortal         webPortal(configMgr, sensorMgr, pumpCtrl, wifiMgr);
MqttClient        mqttClient(configMgr, sensorMgr, pumpCtrl);
TelegramBot       telegramBot(configMgr, sensorMgr, pumpCtrl);
SleepManager      sleepMgr(configMgr);
StatusLED         statusLed;
SafetyManager     safetyMgr(sensorMgr, statusLed);
TimeManager       timeMgr;
PlantProfile      plantProfile;
AutonomyCalculator autonomyCalc(plantProfile);
WiFiGeolocation   geoLoc;
EspNowMaster      espNow;
TftDashboard      tftDash;

// ---- Button ISR ----
volatile bool buttonPressed = false;
void IRAM_ATTR buttonISR() { buttonPressed = true; }

// ---- FreeRTOS task handles ----
TaskHandle_t taskSensorHandle = NULL;
TaskHandle_t taskPumpHandle   = NULL;
TaskHandle_t taskWifiHandle   = NULL;
TaskHandle_t taskCommsHandle  = NULL;

// ============================================================
// TASK: Sensor loop (30s, Core 1)
// Reads Zone B local sensors + Zone A data from EspNowMaster
// ============================================================
void taskSensorLoop(void* param) {
    const TickType_t interval = pdMS_TO_TICKS(30000);

    // Mark boot stable after 60s
    static bool bootStable = false;
    if (!safetyMgr.isSafeMode()) {
        vTaskDelay(pdMS_TO_TICKS(60000));
        safetyMgr.markBootStable();
        bootStable = true;
    }

    for (;;) {
        // ---- Zone B: read local sensors ----
        sensorMgr.readAll();

        // ---- Zone A: request remote sensors from slave ----
        if (espNow.isConnected()) {
            espNow.sendReadSensors();
        }

        // ---- Safety checks ----
        safetyMgr.update();  // _checkTemperature, _checkThermalAutoRecovery

        // ---- Update zone moisture ----
        pumpCtrl.updateZoneMoisture();

        // ---- Record humidity for PlantProfile learning ----
        // Zone B (local)
        for (uint8_t p = 0; p < 10; p++) {
            if (sensorMgr.data().moisture[p].valid) {
                plantProfile.recordHumidity(ZONE_B, p,
                    sensorMgr.data().moisture[p].percent, millis());
            }
        }
        // Zone A (remote, from last DataSensors)
        if (espNow.hasNewSensorData()) {
            const DataSensors& remote = espNow.lastSensors();
            for (uint8_t p = 0; p < 10; p++) {
                if (remote.moisture[p].valid) {
                    plantProfile.recordHumidity(ZONE_A, p,
                        remote.moisture[p].percent, millis());
                }
            }
            espNow.clearNewSensorData();
        }

        // ---- Periodic drying rate learning (every 6h) ----
        static uint32_t lastDryingUpdate = 0;
        if (millis() - lastDryingUpdate > 21600000) {  // 6h
            for (uint8_t z = 0; z < NUM_ZONES; z++) {
                for (uint8_t p = 0; p < 10; p++) {
                    if (plantProfile.hasProfile(z, p)) {
                        plantProfile.updateDryingRate(z, p);
                    }
                }
            }
            lastDryingUpdate = millis();
        }

        // ---- LED state ----
        if (safetyMgr.isLockout()) {
            statusLed.setState(LedState::CRITICAL);
        } else if (safetyMgr.state() == SafetyState::WARNING) {
            statusLed.setState(LedState::WARNING);
        } else if (pumpCtrl.isBlocked()) {
            statusLed.setState(LedState::FAILSAFE);
        } else if (pumpCtrl.isRunning()) {
            statusLed.setState(LedState::WATERING);
        } else if (wifiMgr.isAPMode()) {
            statusLed.setState(LedState::AP_MODE);
        } else if (configMgr.isTankWarning(sensorMgr.tankLevel())) {
            statusLed.setState(LedState::WARNING);
        } else {
            statusLed.setState(LedState::OK);
        }

        // ---- Tank alerts ----
        if (configMgr.isTankCritical(sensorMgr.tankLevel())) {
            telegramBot.sendAlert("Reservoir interieur CRITIQUE!");
            mqttClient.publishAlert("TANK_B_CRITICAL");
        }

        // ---- Slave comm status ----
        if (espNow.commState() == CommState::DEGRADED) {
            static bool slaveLostAlertSent = false;
            if (!slaveLostAlertSent) {
                telegramBot.sendAlert("Esclave balcon NON-RESPONSIVE — mode degrade");
                slaveLostAlertSent = true;
            }
        }

        // ---- AUTO watering (Zone B local) ----
        if (configMgr.mode() == WateringMode::AUTOMATIC && !safetyMgr.isLockout()) {
            if (pumpCtrl.shouldAutoWater(ZONE_B)) {
                if (safetyMgr.armPump()) {
                    pumpCtrl.start(ZONE_B);
                    telegramBot.sendAlert("AUTO Interieur: hum " +
                        String(pumpCtrl.zoneMoisture(ZONE_B)) + "% → arrosage");
                }
            }
        }

        // ---- AUTO watering (Zone A remote via ESP-NOW) ----
        if (configMgr.mode() == WateringMode::AUTOMATIC && espNow.isConnected()) {
            uint8_t remoteAvg = espNow.lastSensors().avgMoisture;
            uint8_t minThresh = configMgr.config().moisture.minThreshold;
            if (remoteAvg < minThresh && !safetyMgr.isLockout()) {
                uint16_t dur = plantProfile.computeZoneCycleDurationS(ZONE_A, timeMgr.month());
                espNow.sendPumpStart(dur);
                telegramBot.sendAlert("AUTO Balcon: hum " +
                    String(remoteAvg) + "% → arrosage " + String(dur) + "s");
            }
        }

        // ---- Pot alerts ----
        sensorMgr.updatePotAlerts(configMgr.config().moisture.minThreshold);
        if (sensorMgr.hasPotAlerts()) {
            telegramBot.sendAlert(sensorMgr.getPotAlertMessage());
        }

        // ---- TFT refresh ----
        tftDash.refresh();

        vTaskDelay(interval);
    }
}

// ============================================================
// TASK: Pump loop (1s, Core 1)
// Checks pump runtime, button, scheduled/solar watering
// ============================================================
void taskPumpLoop(void* param) {
    const TickType_t interval = pdMS_TO_TICKS(1000);
    struct tm timeinfo;

    for (;;) {
        pumpCtrl.update();  // Check _targetDuration, _checkFailsafes

        // ---- Physical button ----
        if (buttonPressed) {
            buttonPressed = false;
            statusLed.flashButtonAck();

            if (pumpCtrl.isRunning()) {
                pumpCtrl.stopAll(PumpStopReason::MANUAL_STOP);
                safetyMgr.disarmPump();
                // Also stop remote pump
                espNow.sendPumpStop(0);
            } else if (safetyMgr.isLockout()) {
                statusLed.flashError();
            } else if (!pumpCtrl.isBlocked()) {
                if (safetyMgr.armPump()) {
                    pumpCtrl.start(ZONE_B);  // Button = local zone only
                    telegramBot.sendAlert("Arrosage manuel (bouton)");
                    statusLed.setState(LedState::WATERING);
                } else {
                    statusLed.flashError();
                }
            } else {
                statusLed.flashError();
            }
        }

        // ---- SCHEDULED / SOLAR mode check (every minute) ----
        static uint32_t lastMinuteCheck = 0;
        if (millis() - lastMinuteCheck > 60000) {
            lastMinuteCheck = millis();

            bool shouldWaterZ[NUM_ZONES] = {false, false};

            if (timeMgr.getTime(timeinfo)) {
                for (uint8_t z = 0; z < NUM_ZONES; z++) {
                    shouldWaterZ[z] = pumpCtrl.shouldWater(
                        timeinfo.tm_hour, timeinfo.tm_min, z);
                }
            }

            for (uint8_t z = 0; z < NUM_ZONES; z++) {
                if (shouldWaterZ[z] && !pumpCtrl.isRunning(z) &&
                    !pumpCtrl.isBlocked(z) && !safetyMgr.isLockout()) {

                    if (z == ZONE_B) {
                        // Local pump
                        if (safetyMgr.armPump()) {
                            pumpCtrl.start(z);
                            statusLed.setState(LedState::WATERING);
                        }
                    } else if (z == ZONE_A && espNow.isConnected()) {
                        // Remote pump via ESP-NOW
                        uint16_t dur = plantProfile.computeZoneCycleDurationS(z, timeinfo.tm_mon);
                        espNow.sendPumpStart(dur);
                    }
                }
            }

            // ---- Disarm relay when all pumps stop ----
            if (!pumpCtrl.isRunning() && safetyMgr.isPumpArmed()) {
                safetyMgr.disarmPump();
                statusLed.setState(LedState::OK);
            }

            // ---- Tank auto-recovery ----
            for (uint8_t z = 0; z < NUM_ZONES; z++) {
                if (pumpCtrl.isBlocked(z) &&
                    pumpCtrl.zoneStatus(z).lastStopReason == PumpStopReason::TANK_EMPTY) {
                    // Check if tank level recovered
                    bool tankOk = false;
                    if (z == ZONE_B) {
                        tankOk = sensorMgr.data().tank[0].valid &&
                                 !configMgr.isTankCritical(sensorMgr.data().tank[0].levelPct);
                    } else if (z == ZONE_A && espNow.hasNewSensorData()) {
                        tankOk = espNow.lastSensors().tankValid &&
                                 espNow.lastSensors().tankLevelPct > TANK_LEVEL_CRITICAL;
                    }
                    if (tankOk) {
                        pumpCtrl.resetFailsafe(z);
                        safetyMgr.notifyTankRecovered();
                    }
                }
            }
        }

        // ---- TFT touch handling ----
        tftDash.update();

        vTaskDelay(interval);
    }
}

// ============================================================
// TASK: WiFi loop (500ms, Core 0)
// WiFi reconnection, OTA, geolocation first boot
// ============================================================
void taskWifiLoop(void* param) {
    const TickType_t interval = pdMS_TO_TICKS(500);
    bool geolocDone = geoLoc.isValid();

    for (;;) {
        wifiMgr.update();
        if (wifiMgr.isConnected()) {
            ArduinoOTA.handle();

            // One-time geolocation after WiFi connects
            if (!geolocDone) {
                if (geoLoc.locate()) {
                    timeMgr.setLocation(geoLoc.latitude(), geoLoc.longitude());
                    configMgr.config().solar.latitude = geoLoc.latitude();
                    configMgr.config().solar.longitude = geoLoc.longitude();
                }
                geolocDone = true;
            }
        }
        vTaskDelay(interval);
    }
}

// ============================================================
// TASK: Comms loop (1s, Core 0)
// MQTT publish, Telegram polling, ESP-NOW heartbeat
// ============================================================
void taskCommsLoop(void* param) {
    const TickType_t interval = pdMS_TO_TICKS(1000);

    for (;;) {
        mqttClient.update();
        telegramBot.update();
        espNow.update();  // _checkHeartbeat, auto PING every 60s

        vTaskDelay(interval);
    }
}

// ============================================================
// SETUP
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println();
    Serial.println("========================================");
    Serial.printf( "  BALCONY HYDRA v%s — MAITRE\n", HYDRA_VERSION);
    Serial.println("  Distribue maitre/esclave, USB secteur");
    Serial.println("  Zone B locale + Zone A via ESP-NOW");
    Serial.println("========================================");

    // 1/12 — LED
    Serial.println("[BOOT] 1/12 — StatusLED...");
    statusLed.begin();
    statusLed.setState(LedState::BOOT);

    // 2/12 — Config NVS
    Serial.println("[BOOT] 2/12 — ConfigManager...");
    configMgr.begin();

    // Lazy-create + display API token (1er boot = nouveau token, sinon
    // existing). Affiché 1 fois ici pour que le user puisse le copier
    // dans l'app mobile. Pas de re-log dans WebPortal pour ne pas spammer.
    String apiTok = configMgr.getOrCreateApiToken();
    Serial.println("============================================");
    Serial.print  ("[BOOT] API TOKEN (X-Hydra-Token) : ");
    Serial.println(apiTok);
    Serial.println("[BOOT] À copier dans l'app mobile · Card REST API · MASTER");
    Serial.println("============================================");

    // 3/12 — Geolocation
    Serial.println("[BOOT] 3/12 — WiFiGeolocation...");
    if (geoLoc.loadFromNVS()) {
        Serial.println("[BOOT]       Position NVS cached");
    } else {
        Serial.println("[BOOT]       Premiere fois — retry apres WiFi");
    }

    // 4/12 — Time
    Serial.println("[BOOT] 4/12 — TimeManager (DS3231 + NTP + NOAA)...");
    timeMgr.setLocation(geoLoc.latitude(), geoLoc.longitude());
    timeMgr.begin();

    // 5/12 — Sensors
    Serial.println("[BOOT] 5/12 — SensorManager (Zone B local)...");
    sensorMgr.begin();

    // 6/12 — PlantProfile
    Serial.println("[BOOT] 6/12 — PlantProfile (NVS 20 profils)...");
    plantProfile.begin();

    // 7/12 — Safety
    Serial.println("[BOOT] 7/12 — SafetyManager...");
    safetyMgr.begin();
    safetyMgr.onAlert([](const char* msg) {
        telegramBot.sendAlert(String(msg));
        mqttClient.publishAlert(msg);
    });

    // 8/12 — Pump
    Serial.println("[BOOT] 8/12 — PumpController...");
    if (!safetyMgr.isSafeMode()) {
        pumpCtrl.begin();
        pumpCtrl.setTimeManager(&timeMgr);
        pumpCtrl.setPlantProfile(&plantProfile);
        pumpCtrl.onSafetyEvent([](PumpStopReason reason) {
            if (reason == PumpStopReason::OVERCURRENT) safetyMgr.notifyPumpOvercurrent();
            else if (reason == PumpStopReason::DRY_RUN) safetyMgr.notifyPumpDryRun();
            safetyMgr.disarmPump();
        });
    } else {
        Serial.println("[BOOT]       SAFE MODE — pompe OFF");
        pinMode(PIN_PUMP, OUTPUT);
        digitalWrite(PIN_PUMP, LOW);
    }

    // Button
    pinMode(PIN_BUTTON, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(PIN_BUTTON), buttonISR, FALLING);

    // 9/12 — WiFi
    Serial.println("[BOOT] 9/12 — WiFi...");
    wifiMgr.begin();
    if (wifiMgr.isAPMode()) statusLed.setState(LedState::AP_MODE);

    // 10/12 — ESP-NOW
    Serial.println("[BOOT] 10/12 — EspNowMaster...");
    // Pairing dynamique : le MAC esclave est chargé depuis NVS (namespace "espnow").
    // Si absent (premier boot), le maître broadcaste CMD_PAIRING_REQ toutes les 2s
    // jusqu'à recevoir DATA_PAIRING_ACK de l'esclave, puis persiste le MAC en NVS.
    // [DEPRECATED 2026-04-08] DEFAULT_SLAVE_MAC conservé pour référence uniquement.
    // static const uint8_t DEFAULT_SLAVE_MAC[6] = {0xFF,0xFF,0xFF,0xFF,0xFF,0xFF};
    espNow.begin();
    espNow.onSlaveAlert([](const DataAlert& alert) {
        telegramBot.sendAlert("Esclave: " + String(alert.message));
        mqttClient.publishAlert(alert.message);
    });

    // 11/12 — Web + MQTT + Telegram
    Serial.println("[BOOT] 11/12 — WebPortal + MQTT + Telegram...");
    webPortal.setSafetyManager(&safetyMgr);  // expose /api/safety/status + /api/safety/unlock
    webPortal.begin();
    // Note: PlantProfile et AutonomyCalculator ne sont PAS injectés dans
    // WebPortal — ces fonctionnalités sont exposées uniquement via Telegram
    // (/profiles, /autonomy N). À ré-injecter si on ajoute les routes REST.
    mqttClient.begin();
    telegramBot.begin();
    telegramBot.setSafetyManager(&safetyMgr);
    telegramBot.setPlantProfile(&plantProfile);
    telegramBot.setAutonomyCalc(&autonomyCalc);
    telegramBot.setEspNowMaster(&espNow);  // Pour /pairing_reset

    // 12/12 — TFT Dashboard
    Serial.println("[BOOT] 12/12 — TftDashboard...");
    tftDash.begin();
    tftDash.setModules(&configMgr, &sensorMgr, &pumpCtrl, &safetyMgr,
                       &timeMgr, &plantProfile, &autonomyCalc, &espNow, &wifiMgr);

    // OTA
    ArduinoOTA.setHostname(OTA_HOSTNAME);
    ArduinoOTA.onStart([]() {
        statusLed.setState(LedState::BOOT);
        digitalWrite(PIN_PUMP, LOW);
        safetyMgr.disarmPump();
    });
    ArduinoOTA.begin();

    // Safe mode alert
    if (safetyMgr.isSafeMode()) {
        telegramBot.sendAlert("SAFE MODE — pompe OFF (boot loop). /unlock pour rearmer.");
    }

    // Initial read
    sensorMgr.readAll();

    // FreeRTOS tasks
    xTaskCreatePinnedToCore(taskSensorLoop, "Sensors", 8192, NULL, 1, &taskSensorHandle, 1);
    xTaskCreatePinnedToCore(taskPumpLoop,   "Pump",    4096, NULL, 2, &taskPumpHandle,   1);
    xTaskCreatePinnedToCore(taskWifiLoop,   "WiFi",    4096, NULL, 1, &taskWifiHandle,   0);
    xTaskCreatePinnedToCore(taskCommsLoop,  "Comms",   8192, NULL, 1, &taskCommsHandle,  0);

    // Watchdog 30s
    esp_task_wdt_init(30, true);

    Serial.println();
    Serial.println("[BOOT] Systeme MAITRE operationnel.");
    Serial.printf( "[BOOT]   Mode: %d\n", (uint8_t)configMgr.mode());
    Serial.printf( "[BOOT]   WiFi: %s\n", wifiMgr.isConnected() ? wifiMgr.localIP().c_str() : "AP");
    Serial.printf( "[BOOT]   Esclave: %s\n", espNow.isConnected() ? "OK" : "En attente");
}

void loop() {
    vTaskDelay(pdMS_TO_TICKS(1000));
}
