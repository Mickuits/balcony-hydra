// ============================================================
// BALCONY HYDRA v3 — Main Entry Point
// ESP32 WROOM-32 · PlatformIO · C++ OOP Architecture
// ============================================================

#include <Arduino.h>
#include "config.h"

// TODO: Include module headers as they are developed
// #include "WifiManager.h"
// #include "WebPortal.h"
// #include "SensorManager.h"
// #include "PumpController.h"
// #include "MqttClient.h"
// #include "TelegramBot.h"
// #include "SleepManager.h"
// #include "ConfigManager.h"

void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println();
    Serial.println("========================================");
    Serial.printf("  BALCONY HYDRA v%s\n", HYDRA_VERSION);
    Serial.println("  Système d'arrosage automatique solaire");
    Serial.println("========================================");
    Serial.println();

    // Status LED
    pinMode(PIN_LED, OUTPUT);
    digitalWrite(PIN_LED, HIGH);

    // TODO: Initialize modules in order
    // 1. ConfigManager  — load NVS params
    // 2. WifiManager    — connect or start AP
    // 3. WebPortal      — start AsyncWebServer
    // 4. SensorManager  — init MUX, I2C, US
    // 5. PumpController — init MOSFET, failsafe
    // 6. MqttClient     — connect broker
    // 7. TelegramBot    — start polling
    // 8. SleepManager   — configure RTC wakeup

    Serial.println("[BOOT] Système initialisé.");
    digitalWrite(PIN_LED, LOW);
}

void loop() {
    // TODO: FreeRTOS tasks will replace this loop
    // For now, placeholder blink
    
    digitalWrite(PIN_LED, HIGH);
    delay(100);
    digitalWrite(PIN_LED, LOW);
    delay(2900);
}
