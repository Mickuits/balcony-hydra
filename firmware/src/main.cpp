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
// TODO Phase 2:
// #include "WebPortal.h"
// #include "MqttClient.h"
// #include "TelegramBot.h"
// #include "SleepManager.h"

// ---- Global instances ----
ConfigManager  configMgr;
SensorManager  sensorMgr(configMgr);
PumpController pumpCtrl(configMgr, sensorMgr);
WifiManager    wifiMgr(configMgr);

// ---- FreeRTOS task handles ----
TaskHandle_t taskSensorHandle = NULL;
TaskHandle_t taskPumpHandle   = NULL;
TaskHandle_t taskWifiHandle   = NULL;

// ---- FreeRTOS Tasks ----

void taskSensorLoop(void* param) {
    const TickType_t interval = pdMS_TO_TICKS(30000);  // 30s
    for (;;) {
        sensorMgr.readAll();
        
        Serial.printf("[MAIN] Humidité moy: %d%% | Réservoir: %d%% | T°: %.1f°C\n",
                      sensorMgr.avgMoisture(),
                      sensorMgr.tankLevel(),
                      sensorMgr.temperature());
        
        if (configMgr.isTankCritical(sensorMgr.tankLevel())) {
            Serial.println("[MAIN] ⚠ RÉSERVOIR CRITIQUE");
        } else if (configMgr.isTankWarning(sensorMgr.tankLevel())) {
            Serial.println("[MAIN] ⚠ Réservoir bas");
        }
        
        if (!sensorMgr.tankLevelsMatch()) {
            Serial.println("[MAIN] ⚠ Niveaux US divergents — vérifier raccords");
        }
        
        vTaskDelay(interval);
    }
}

void taskPumpLoop(void* param) {
    const TickType_t interval = pdMS_TO_TICKS(1000);
    for (;;) {
        pumpCtrl.update();
        
        // Watering check every minute
        static uint32_t lastMinuteCheck = 0;
        if (millis() - lastMinuteCheck > 60000) {
            lastMinuteCheck = millis();
            struct tm timeinfo;
            if (getLocalTime(&timeinfo, 1000)) {
                if (pumpCtrl.shouldWater(timeinfo.tm_hour, timeinfo.tm_min)) {
                    if (!pumpCtrl.isRunning() && !pumpCtrl.isBlocked()) {
                        Serial.println("[MAIN] Heure d'arrosage — démarrage pompe");
                        pumpCtrl.start();
                    }
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

    Serial.println("[BOOT] 1/4 — Configuration...");
    configMgr.begin();
    
    Serial.println("[BOOT] 2/4 — Capteurs...");
    sensorMgr.begin();
    
    Serial.println("[BOOT] 3/4 — Pompe...");
    pumpCtrl.begin();
    
    Serial.println("[BOOT] 4/4 — WiFi...");
    wifiMgr.begin();
    
    Serial.println("[BOOT] Lecture initiale...");
    sensorMgr.readAll();
    
    // FreeRTOS tasks
    xTaskCreatePinnedToCore(taskSensorLoop, "Sensors", 4096, NULL, 1, &taskSensorHandle, 1);
    xTaskCreatePinnedToCore(taskPumpLoop,   "Pump",    4096, NULL, 2, &taskPumpHandle,   1);
    xTaskCreatePinnedToCore(taskWifiLoop,   "WiFi",    4096, NULL, 1, &taskWifiHandle,   0);
    
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
    // Heartbeat LED
    static uint32_t lastBlink = 0;
    if (millis() - lastBlink > 5000) {
        lastBlink = millis();
        digitalWrite(PIN_LED, HIGH);
        delay(50);
        digitalWrite(PIN_LED, LOW);
    }
    
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
