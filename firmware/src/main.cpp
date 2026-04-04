// ============================================================
// BALCONY HYDRA v3 — Main Entry Point
// ESP32 WROOM-32 · PlatformIO · C++ OOP Architecture
// ============================================================

#include <Arduino.h>
#include <esp_task_wdt.h>
#include "config.h"
#include "ConfigManager.h"
#include "SensorManager.h"
#include "PumpController.h"
#include "WifiManager.h"
#include "WebPortal.h"
#include "MqttClient.h"
#include "TelegramBot.h"
#include "SleepManager.h"
#include "StatusLED.h"
#include "SafetyManager.h"

// ---- Global instances ----
ConfigManager  configMgr;
SensorManager  sensorMgr(configMgr);
PumpController pumpCtrl(configMgr, sensorMgr);
WifiManager    wifiMgr(configMgr);
WebPortal      webPortal(configMgr, sensorMgr, pumpCtrl, wifiMgr);
MqttClient     mqttClient(configMgr, sensorMgr, pumpCtrl);
TelegramBot    telegramBot(configMgr, sensorMgr, pumpCtrl);
SleepManager   sleepMgr(configMgr);
StatusLED      statusLed;
SafetyManager  safetyMgr(sensorMgr, statusLed);

// ---- Button ISR ----
volatile bool buttonPressed = false;
volatile uint32_t lastButtonPress = 0;

void IRAM_ATTR buttonISR() {
    uint32_t now = millis();
    if (now - lastButtonPress > BUTTON_DEBOUNCE_MS) {
        buttonPressed = true;
        lastButtonPress = now;
    }
}

// ---- FreeRTOS task handles ----
TaskHandle_t taskSensorHandle = NULL;
TaskHandle_t taskPumpHandle   = NULL;
TaskHandle_t taskWifiHandle   = NULL;
TaskHandle_t taskCommsHandle  = NULL;

// ---- FreeRTOS Tasks ----

void taskSensorLoop(void* param) {
    const TickType_t interval = pdMS_TO_TICKS(30000);
    
    // Clear boot crash counter after 60s of stable operation
    vTaskDelay(pdMS_TO_TICKS(60000));
    if (!safetyMgr.isSafeMode()) {
        Preferences p;
        p.begin("safety", false);
        p.putUChar("bootCnt", 0);
        p.end();
        Serial.println("[MAIN] Boot stable 60s — compteur crash remis à 0.");
    }
    
    for (;;) {
        sensorMgr.readAll();
        safetyMgr.update();
        
        Serial.printf("[MAIN] Hum: %d%% | Rés: %d%% | T°: %.1f°C | Sécurité: %s\n",
                      sensorMgr.avgMoisture(),
                      sensorMgr.tankLevel(),
                      sensorMgr.temperature(),
                      safetyMgr.isLockout() ? "LOCKOUT" : 
                      safetyMgr.isSafeMode() ? "SAFE_MODE" : "OK");
        
        // Update LED based on system state (priority order)
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

        if (configMgr.isTankCritical(sensorMgr.tankLevel())) {
            Serial.println("[MAIN] ⚠ RÉSERVOIR CRITIQUE");
            telegramBot.sendAlert("🔴 Réservoir CRITIQUE — pompe bloquée!");
            mqttClient.publishAlert("TANK_CRITICAL");
        } else if (configMgr.isTankWarning(sensorMgr.tankLevel())) {
            Serial.println("[MAIN] ⚠ Réservoir bas");
        }
        
        if (!sensorMgr.tankLevelsMatch()) {
            Serial.println("[MAIN] ⚠ Niveaux US divergents — vérifier raccords");
            telegramBot.sendAlert("⚠ Niveaux US divergents — raccord obstrué?");
        }
        
        vTaskDelay(interval);
    }
}

void taskPumpLoop(void* param) {
    const TickType_t interval = pdMS_TO_TICKS(1000);
    for (;;) {
        pumpCtrl.update();
        
        // Physical button check
        if (buttonPressed) {
            buttonPressed = false;
            statusLed.flashButtonAck();
            
            if (pumpCtrl.isRunning()) {
                Serial.println("[MAIN] Bouton pressé → arrêt pompe");
                pumpCtrl.stop(PumpStopReason::MANUAL_STOP);
                safetyMgr.disarmPump();
            } else if (safetyMgr.isLockout()) {
                Serial.println("[MAIN] Bouton pressé → LOCKOUT sécurité actif");
                statusLed.flashError();
            } else if (!pumpCtrl.isBlocked()) {
                if (safetyMgr.armPump()) {
                    Serial.println("[MAIN] Bouton pressé → relay armé → démarrage pompe");
                    pumpCtrl.start();
                    telegramBot.sendAlert("🔘 Arrosage manuel (bouton)");
                    statusLed.setState(LedState::WATERING);
                } else {
                    Serial.println("[MAIN] Bouton pressé → relay REFUSÉ (sécurité)");
                    statusLed.flashError();
                }
            } else {
                Serial.println("[MAIN] Bouton pressé → pompe BLOQUÉE (failsafe)");
                statusLed.flashError();
            }
        }
        
        // Watering check every minute
        static uint32_t lastMinuteCheck = 0;
        if (millis() - lastMinuteCheck > 60000) {
            lastMinuteCheck = millis();
            struct tm timeinfo;
            if (getLocalTime(&timeinfo, 1000)) {
                if (pumpCtrl.shouldWater(timeinfo.tm_hour, timeinfo.tm_min)) {
                    if (!pumpCtrl.isRunning() && !pumpCtrl.isBlocked() && !safetyMgr.isLockout()) {
                        if (safetyMgr.armPump()) {
                            Serial.println("[MAIN] Heure d'arrosage — relay armé → démarrage pompe");
                            pumpCtrl.start();
                            statusLed.setState(LedState::WATERING);
                        }
                    }
                }
                // Disarm relay when pump stops
                if (!pumpCtrl.isRunning() && safetyMgr.isPumpArmed()) {
                    safetyMgr.disarmPump();
                    statusLed.setState(LedState::OK);
                }
            }
        }
        
        vTaskDelay(interval);
    }
}

void taskWifiLoop(void* param) {
    const TickType_t interval = pdMS_TO_TICKS(500);
    for (;;) {
        wifiMgr.update();
        vTaskDelay(interval);
    }
}

void taskCommsLoop(void* param) {
    const TickType_t interval = pdMS_TO_TICKS(1000);
    for (;;) {
        mqttClient.update();
        telegramBot.update();
        vTaskDelay(interval);
    }
}

// ---- Setup ----

void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println();
    Serial.println("========================================");
    Serial.printf( "  BALCONY HYDRA v%s\n", HYDRA_VERSION);
    Serial.println("  Arrosage automatique solaire");
    Serial.println("  20 pots | ESP32 | LiFePO4");
    Serial.println("========================================");
    Serial.println();

    pinMode(PIN_LED, OUTPUT);
    digitalWrite(PIN_LED, HIGH);

    Serial.println("[BOOT] 1/10 — LED status...");
    statusLed.begin();
    
    Serial.println("[BOOT] 2/10 — Configuration...");
    configMgr.begin();
    
    Serial.println("[BOOT] 3/10 — Sleep manager...");
    sleepMgr.begin();
    
    Serial.println("[BOOT] 4/10 — Capteurs...");
    sensorMgr.begin();
    
    Serial.println("[BOOT] 5/10 — Sécurité hardware...");
    safetyMgr.begin();
    // Wire up safety alerts to Telegram + MQTT
    safetyMgr.onAlert([](const char* msg) {
        telegramBot.sendAlert(String(msg));
        mqttClient.publishAlert(msg);
    });
    
    Serial.println("[BOOT] 6/10 — Pompe...");
    if (!safetyMgr.isSafeMode()) {
        pumpCtrl.begin();
    } else {
        Serial.println("[BOOT]       ⚠ SAFE MODE — pompe désactivée");
        pinMode(PIN_PUMP, OUTPUT);
        digitalWrite(PIN_PUMP, LOW);  // Force OFF
    }
    
    // Bouton poussoir — actif même en safe mode (pour physical reset)
    pinMode(PIN_BUTTON, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(PIN_BUTTON), buttonISR, FALLING);
    Serial.println("[BOOT]       Bouton poussoir GPIO 5 activé.");
    
    // WiFi + Telegram démarrent MÊME en safe mode (pour /unlock distant)
    Serial.println("[BOOT] 7/10 — WiFi...");
    wifiMgr.begin();
    if (wifiMgr.isAPMode()) statusLed.setState(LedState::AP_MODE);
    
    Serial.println("[BOOT] 8/10 — Portail web...");
    webPortal.begin();
    
    Serial.println("[BOOT] 9/10 — MQTT...");
    mqttClient.begin();
    
    Serial.println("[BOOT] 10/10 — Telegram...");
    telegramBot.begin();
    telegramBot.setSafetyManager(&safetyMgr);  // Wire /unlock command
    
    if (safetyMgr.isSafeMode()) {
        Serial.println();
        Serial.println("[BOOT] ⚠⚠⚠ SAFE MODE ACTIF ⚠⚠⚠");
        Serial.println("[BOOT] Pompe désactivée. WiFi/Telegram actifs pour /unlock.");
        Serial.println("[BOOT] Bouton physique 10s pour reset local.");
        telegramBot.sendAlert("🔴 SAFE MODE — pompe désactivée (boot loop). Envoyez /unlock pour réarmer.");
    }
    
    Serial.println("[BOOT] Lecture initiale...");
    sensorMgr.readAll();
    
    // FreeRTOS tasks
    xTaskCreatePinnedToCore(taskSensorLoop, "Sensors", 4096, NULL, 1, &taskSensorHandle, 1);
    xTaskCreatePinnedToCore(taskPumpLoop,   "Pump",    4096, NULL, 2, &taskPumpHandle,   1);
    xTaskCreatePinnedToCore(taskWifiLoop,   "WiFi",    4096, NULL, 1, &taskWifiHandle,   0);
    xTaskCreatePinnedToCore(taskCommsLoop,  "Comms",   8192, NULL, 1, &taskCommsHandle,  0);
    
    // Hardware watchdog (30s)
    esp_task_wdt_init(30, true);
    
    const char* modeStr[] = {"AUTOMATIQUE", "SCHEDULÉ", "MANUEL"};
    Serial.println();
    Serial.println("[BOOT] Système opérationnel.");
    Serial.printf( "[BOOT]   Mode: %s\n", modeStr[static_cast<uint8_t>(configMgr.mode())]);
    Serial.printf( "[BOOT]   WiFi: %s\n", wifiMgr.isConnected() ? wifiMgr.localIP().c_str() :
                   wifiMgr.isAPMode() ? ("AP: " + wifiMgr.apIP()).c_str() : "Déconnecté");
    Serial.printf( "[BOOT]   Réservoir: %d%%\n", sensorMgr.tankLevel());
    Serial.printf( "[BOOT]   Humidité moy: %d%%\n", sensorMgr.avgMoisture());
    Serial.println();

    digitalWrite(PIN_LED, LOW);
}

// ---- Loop ----

void loop() {
    // StatusLED animation update
    statusLed.update();
    
    // Serial debug commands
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        
        if (cmd == "status") {
            Serial.printf("Hum: %d%% | Rés: %d%% | Pompe: %s | WiFi: %s (%s)\n",
                          sensorMgr.avgMoisture(), sensorMgr.tankLevel(),
                          pumpCtrl.isRunning() ? "ON" : "OFF",
                          wifiMgr.isConnected() ? "OK" : "KO",
                          wifiMgr.localIP().c_str());
        } else if (cmd == "water") {
            pumpCtrl.start();
        } else if (cmd == "stop") {
            pumpCtrl.stop();
        } else if (cmd == "sensors") {
            sensorMgr.readAll();
        } else if (cmd == "config") {
            Serial.println(configMgr.toJson());
        } else if (cmd == "pump") {
            Serial.println(pumpCtrl.toJson());
        } else if (cmd == "reset") {
            configMgr.reset();
        } else if (cmd == "ap") {
            wifiMgr.forceAPMode();
        } else if (cmd == "reboot") {
            ESP.restart();
        } else if (cmd == "help") {
            Serial.println("Commandes: status water stop sensors config pump reset ap reboot help");
        }
    }
    
    delay(100);
}
