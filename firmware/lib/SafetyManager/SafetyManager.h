// ============================================================
// SafetyManager — Couche sécurité hardware indépendante
// Relais coupure, monitoring température, compteur boot
// ============================================================

#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include "config.h"
#include "SensorManager.h"
#include "StatusLED.h"

// Safety relay — normalement FERMÉ (pompe alimentée)
// GPIO HIGH = relay ouvert = pompe coupée (fail-safe: si MCU mort, relay retombe fermé)
// MAIS on inverse: relay normalement OUVERT, GPIO HIGH pour FERMER = alimenter pompe
// → Si MCU crash/reset → relay ouvert → pompe coupée
constexpr uint8_t PIN_SAFETY_RELAY = 18;

// Seuils de sécurité (non configurables — hardcoded pour sûreté)
constexpr float SAFETY_TEMP_WARNING   = 50.0;  // °C — alerte
constexpr float SAFETY_TEMP_CRITICAL  = 58.0;  // °C — coupure totale
constexpr float SAFETY_TEMP_RESUME    = 45.0;  // °C — reprise après coupure thermique
constexpr uint8_t SAFETY_MAX_BOOT_CRASHES = 3;  // 3 resets rapides → safe mode
constexpr uint32_t SAFETY_BOOT_WINDOW_MS  = 30000; // 30s — fenêtre de détection crash

enum class SafetyState : uint8_t {
    NOMINAL    = 0,  // Tout OK
    WARNING    = 1,  // Alerte (T° haute, réservoir bas)
    LOCKOUT    = 2,  // Coupure sécurité active
    SAFE_MODE  = 3   // Boot en mode dégradé (crashes répétés)
};

struct SafetyStatus {
    SafetyState state;
    bool relayEngaged;       // true = pompe peut fonctionner
    bool thermalLockout;     // true = T° trop haute, tout coupé
    bool crashSafeMode;      // true = trop de resets consécutifs
    float lastTemperature;
    uint8_t bootCount;
    uint32_t lastBootTime;
    char lockoutReason[64];
};

class SafetyManager {
public:
    SafetyManager(SensorManager& sensorMgr, StatusLED& led);
    
    void begin();
    void update();  // Check every second
    
    // Relay control — PumpController must call these
    bool armPump();      // Engage relay (allow pump to run)
    void disarmPump();   // Disengage relay (cut pump power)
    
    bool isPumpArmed() const { return _status.relayEngaged; }
    bool isLockout() const { return _status.state == SafetyState::LOCKOUT; }
    bool isSafeMode() const { return _status.crashSafeMode; }
    SafetyState state() const { return _status.state; }
    const SafetyStatus& status() const { return _status; }
    
    // Override (manual reset from button long-press or web)
    void resetLockout();
    
    // Callbacks for alerts
    typedef void (*AlertCallback)(const char* message);
    void onAlert(AlertCallback cb) { _alertCb = cb; }

private:
    SensorManager& _sensorMgr;
    StatusLED& _led;
    SafetyStatus _status;
    Preferences _prefs;
    AlertCallback _alertCb = nullptr;
    
    uint32_t _lastCheck;
    bool _tempAlertSent;
    
    void _checkTemperature();
    void _checkBootCrashes();
    void _engageRelay();
    void _disengageRelay();
    void _enterLockout(const char* reason);
    void _alert(const char* msg);
    void _recordBoot();
};
