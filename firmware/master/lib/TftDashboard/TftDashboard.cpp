// ============================================================
// TftDashboard — Implementation 7 ecrans TFT ILI9341
// ============================================================

#include "TftDashboard.h"
#include "ConfigManager.h"
#include "SensorManager.h"
#include "PumpController.h"
#include "SafetyManager.h"
#include "TimeManager.h"
#include "PlantProfile.h"
#include "AutonomyCalculator.h"
#include "EspNowMaster.h"
#include "WifiManager.h"

// Touch calibration (adjust for your specific screen)
#define TOUCH_MIN_X 300
#define TOUCH_MAX_X 3800
#define TOUCH_MIN_Y 300
#define TOUCH_MAX_Y 3800
#define SCREEN_W 320
#define SCREEN_H 240

// Refresh intervals
#define REFRESH_MAIN_MS     5000
#define REFRESH_SENSORS_MS  10000
#define REFRESH_PROFILES_MS 30000

TftDashboard::TftDashboard()
    : _tft(), _touch(PIN_TOUCH_CS),
      _currentScreen(Screen::MAIN), _lastRefresh(0),
      _needsRedraw(true), _wifiConfigDone(false) {
    memset(_wifiSSID, 0, sizeof(_wifiSSID));
    memset(_wifiPass, 0, sizeof(_wifiPass));
}

void TftDashboard::begin() {
    _tft.init();
    _tft.setRotation(1);  // Landscape
    _tft.fillScreen(COL_BG);
    _touch.begin();
    _touch.setRotation(1);
    _needsRedraw = true;
    Serial.println("[TFT] Dashboard initialise (320x240)");
}

void TftDashboard::setModules(ConfigManager* cfg, SensorManager* sens, PumpController* pump,
                               SafetyManager* safety, TimeManager* time, PlantProfile* profiles,
                               AutonomyCalculator* autonomy, EspNowMaster* comm, WifiManager* wifi) {
    _cfg = cfg; _sens = sens; _pump = pump; _safety = safety;
    _time = time; _profiles = profiles; _autonomy = autonomy;
    _comm = comm; _wifi = wifi;
}

void TftDashboard::update() {
    // Handle touch
    if (_touch.tirqTouched() && _touch.touched()) {
        TS_Point p = _touch.getPoint();
        int16_t x = map(p.x, TOUCH_MIN_X, TOUCH_MAX_X, 0, SCREEN_W);
        int16_t y = map(p.y, TOUCH_MIN_Y, TOUCH_MAX_Y, 0, SCREEN_H);
        _handleTouch(x, y);
        delay(200);  // Debounce
    }

    // Auto-refresh
    uint32_t refreshInterval = REFRESH_MAIN_MS;
    if (_currentScreen == Screen::SENSORS) refreshInterval = REFRESH_SENSORS_MS;
    if (_currentScreen == Screen::PROFILES) refreshInterval = REFRESH_PROFILES_MS;

    if (_needsRedraw || millis() - _lastRefresh > refreshInterval) {
        _lastRefresh = millis();
        _needsRedraw = false;

        switch (_currentScreen) {
            case Screen::MAIN:      _drawMain(); break;
            case Screen::WIFI:      _drawWifi(); break;
            case Screen::WATERING:  _drawWatering(); break;
            case Screen::SECURITY:  _drawSecurity(); break;
            case Screen::SENSORS:   _drawSensors(); break;
            case Screen::PROFILES:  _drawProfiles(); break;
            case Screen::AUTONOMY:  _drawAutonomy(); break;
            default: break;
        }
    }
}

void TftDashboard::setScreen(Screen screen) {
    _currentScreen = screen;
    _needsRedraw = true;
    _tft.fillScreen(COL_BG);
}

void TftDashboard::refresh() { _needsRedraw = true; }

// ---- UI HELPERS ----

void TftDashboard::_drawHeader(const char* title) {
    _tft.fillRect(0, 0, SCREEN_W, 24, COL_HEADER);
    _tft.setTextColor(COL_TEXT);
    _tft.setTextDatum(ML_DATUM);
    _tft.setTextSize(1);
    _tft.drawString(title, 6, 12);

    // Time (right side)
    if (_time && _time->hasValidTime()) {
        char buf[6];
        snprintf(buf, sizeof(buf), "%02d:%02d", _time->hour(), _time->minute());
        _tft.setTextDatum(MR_DATUM);
        _tft.drawString(buf, SCREEN_W - 6, 12);
    }
}

void TftDashboard::_drawNavBar() {
    int16_t y = SCREEN_H - 22;
    _tft.fillRect(0, y, SCREEN_W, 22, COL_DARKGRAY);

    const char* labels[] = {"HOME", "WIFI", "ARROS", "SECU", "CAPT", "PROF", "AUTO"};
    int16_t bw = SCREEN_W / 7;
    for (uint8_t i = 0; i < 7; i++) {
        uint16_t bg = (i == (uint8_t)_currentScreen) ? COL_HEADER : COL_DARKGRAY;
        _tft.fillRect(i * bw, y, bw - 1, 22, bg);
        _tft.setTextColor(COL_TEXT);
        _tft.setTextDatum(MC_DATUM);
        _tft.setTextSize(1);
        _tft.drawString(labels[i], i * bw + bw/2, y + 11);
    }
}

void TftDashboard::_drawProgressBar(int16_t x, int16_t y, int16_t w, int16_t h,
                                     uint8_t percent, uint16_t color) {
    _tft.drawRect(x, y, w, h, COL_GRAY);
    int16_t fillW = (w - 2) * percent / 100;
    _tft.fillRect(x + 1, y + 1, fillW, h - 2, color);
    _tft.fillRect(x + 1 + fillW, y + 1, w - 2 - fillW, h - 2, COL_BG);
}

void TftDashboard::_drawButton(int16_t x, int16_t y, int16_t w, int16_t h,
                                const char* label, uint16_t bgColor) {
    _tft.fillRoundRect(x, y, w, h, 4, bgColor);
    _tft.setTextColor(COL_TEXT);
    _tft.setTextDatum(MC_DATUM);
    _tft.drawString(label, x + w/2, y + h/2);
}

// ============================================================
// SCREEN 0: MAIN — Overview dashboard
// ============================================================
void TftDashboard::_drawMain() {
    _drawHeader("HYDRA v4 — Dashboard");

    int16_t cy = 30;

    // ---- Zone A (Balcon — remote) ----
    _tft.setTextColor(COL_OK);
    _tft.setTextDatum(TL_DATUM);
    _tft.drawString("BALCON (Zone A)", 6, cy);
    cy += 14;

    if (_comm && _comm->isConnected()) {
        const DataSensors& rs = _comm->lastSensors();
        _tft.setTextColor(COL_TEXT);
        char buf[40];
        snprintf(buf, sizeof(buf), "Hum: %d%%  Tank: %d%%", rs.avgMoisture, rs.tankLevelPct);
        _tft.drawString(buf, 10, cy);
        _drawProgressBar(200, cy - 2, 80, 12, rs.avgMoisture, COL_CYAN);
        cy += 14;
        if (rs.bmeValid) {
            snprintf(buf, sizeof(buf), "T: %.1fC  HR: %.0f%%", rs.temperature, rs.humidity);
            _tft.drawString(buf, 10, cy);
        }
        cy += 14;
        _drawProgressBar(10, cy, 140, 8, rs.tankLevelPct,
                         rs.tankLevelPct < 25 ? COL_WARN : COL_OK);
        _tft.drawString("Reservoir", 160, cy);
    } else {
        _tft.setTextColor(COL_ERROR);
        _tft.drawString("Esclave NON CONNECTE", 10, cy);
        if (_comm) {
            char buf[30];
            snprintf(buf, sizeof(buf), "Missed: %d pongs", _comm->missedPongs());
            cy += 12;
            _tft.drawString(buf, 10, cy);
        }
    }

    cy += 20;

    // ---- Zone B (Interieur — local) ----
    _tft.setTextColor(COL_CYAN);
    _tft.drawString("INTERIEUR (Zone B)", 6, cy);
    cy += 14;

    if (_sens) {
        _tft.setTextColor(COL_TEXT);
        char buf[40];
        snprintf(buf, sizeof(buf), "Hum: %d%%  Tank: %d%%",
                 _sens->avgMoisture(), _sens->tankLevel());
        _tft.drawString(buf, 10, cy);
        _drawProgressBar(200, cy - 2, 80, 12, _sens->avgMoisture(), COL_CYAN);
        cy += 14;
        _drawProgressBar(10, cy, 140, 8, _sens->tankLevel(),
                         _sens->tankLevel() < 25 ? COL_WARN : COL_OK);
        _tft.drawString("Reservoir", 160, cy);
    }

    cy += 20;

    // ---- Pump status ----
    _tft.setTextColor(COL_TEXT);
    if (_pump) {
        const char* pumpLabels[] = {"Balcon", "Interieur"};
        for (uint8_t z = 0; z < NUM_ZONES; z++) {
            const char* stateStr = _pump->isRunning(z) ? "ON" :
                                   _pump->isBlocked(z) ? "BLOQUE" : "OFF";
            uint16_t col = _pump->isRunning(z) ? COL_OK :
                           _pump->isBlocked(z) ? COL_ERROR : COL_GRAY;
            char buf[30];
            snprintf(buf, sizeof(buf), "Pompe %s: %s", pumpLabels[z], stateStr);
            _tft.setTextColor(col);
            _tft.drawString(buf, 10, cy);
            cy += 12;
        }
    }

    // ---- Comm + Safety status bar ----
    cy = SCREEN_H - 42;
    _tft.fillRect(0, cy, SCREEN_W, 18, COL_DARKGRAY);
    _tft.setTextColor(COL_TEXT);
    _tft.setTextSize(1);

    // ESP-NOW status
    const char* commStr = "?";
    uint16_t commCol = COL_GRAY;
    if (_comm) {
        switch (_comm->commState()) {
            case CommState::ESPNOW_OK:    commStr = "ESP-NOW OK"; commCol = COL_OK; break;
            case CommState::MQTT_FALLBACK: commStr = "MQTT fb"; commCol = COL_WARN; break;
            case CommState::DEGRADED:     commStr = "PERDU!"; commCol = COL_ERROR; break;
            default:                      commStr = "Deconnecte"; break;
        }
    }
    _tft.setTextColor(commCol);
    _tft.drawString(commStr, 6, cy + 9);

    // Safety
    if (_safety) {
        const char* safeStr = "OK";
        uint16_t safeCol = COL_OK;
        if (_safety->isSafeMode()) { safeStr = "SAFE MODE"; safeCol = COL_ERROR; }
        else if (_safety->isHardLockout()) { safeStr = "LOCKOUT"; safeCol = COL_ERROR; }
        else if (_safety->isLockout()) { safeStr = "LOCKOUT AUTO"; safeCol = COL_WARN; }
        else if (_safety->state() == SafetyState::WARNING) { safeStr = "WARNING"; safeCol = COL_WARN; }
        _tft.setTextColor(safeCol);
        _tft.setTextDatum(MR_DATUM);
        _tft.drawString(safeStr, SCREEN_W - 6, cy + 9);
        _tft.setTextDatum(TL_DATUM);
    }

    // WiFi
    if (_wifi) {
        _tft.setTextColor(_wifi->isConnected() ? COL_OK : COL_WARN);
        _tft.setTextDatum(MC_DATUM);
        _tft.drawString(_wifi->isConnected() ? "WiFi OK" : "WiFi OFF", SCREEN_W/2, cy + 9);
        _tft.setTextDatum(TL_DATUM);
    }

    _drawNavBar();
}

// ============================================================
// SCREEN 1: WIFI — Configuration WiFi
// ============================================================
void TftDashboard::_drawWifi() {
    _drawHeader("Configuration WiFi");

    _tft.setTextColor(COL_TEXT);
    _tft.setTextDatum(TL_DATUM);

    if (_wifi && _wifi->isConnected()) {
        _tft.drawString("Connecte a:", 10, 34);
        _tft.setTextColor(COL_OK);
        _tft.drawString(_wifi->localIP().c_str(), 10, 50);

        _tft.setTextColor(COL_TEXT);
        _tft.drawString("http://hydra.local", 10, 70);

        _drawButton(10, 100, 140, 30, "Deconnecter", COL_WARN);
        _drawButton(170, 100, 140, 30, "Scan reseaux", COL_HEADER);
    } else {
        _tft.drawString("Non connecte — mode AP", 10, 34);
        _tft.setTextColor(COL_WARN);
        _tft.drawString("SSID: Hydra-AP", 10, 50);
        _tft.drawString("Pass: hydra1234", 10, 66);
        _tft.drawString("→ http://192.168.4.1", 10, 82);

        _drawButton(10, 110, 300, 30, "Scanner les reseaux WiFi", COL_HEADER);

        _tft.setTextColor(COL_GRAY);
        _tft.drawString("Configurez via le portail web", 10, 160);
        _tft.drawString("ou touchez 'Scanner' ci-dessus", 10, 176);
    }

    _drawNavBar();
}

// ============================================================
// SCREEN 2: WATERING — Mode & settings
// ============================================================
void TftDashboard::_drawWatering() {
    _drawHeader("Arrosage — Config");

    if (!_cfg) { _drawNavBar(); return; }

    int16_t cy = 32;
    _tft.setTextColor(COL_TEXT);

    // Current mode
    const char* modes[] = {"AUTOMATIQUE", "PROGRAMME", "SOLAIRE", "MANUEL"};
    uint8_t modeIdx = (uint8_t)_cfg->mode();
    _tft.drawString("Mode actuel:", 10, cy);
    _tft.setTextColor(COL_CYAN);
    _tft.drawString(modes[modeIdx], 120, cy);
    cy += 18;

    // Mode buttons
    uint16_t modeColors[] = {COL_OK, COL_HEADER, COL_WARN, COL_GRAY};
    for (uint8_t i = 0; i < 4; i++) {
        uint16_t bg = (i == modeIdx) ? modeColors[i] : COL_DARKGRAY;
        _drawButton(10 + i * 77, cy, 73, 24, modes[i], bg);
    }
    cy += 32;

    _tft.setTextColor(COL_TEXT);

    // Thresholds
    const auto& mc = _cfg->config().moisture;
    char buf[50];
    snprintf(buf, sizeof(buf), "Seuil min: %d%%  max: %d%%", mc.minThreshold, mc.maxThreshold);
    _tft.drawString(buf, 10, cy);
    _drawProgressBar(10, cy + 14, 200, 8, mc.minThreshold, COL_CYAN);
    cy += 28;

    // Schedule (if SCHEDULED)
    if (modeIdx == 1) {
        const auto& sc = _cfg->config().schedule;
        snprintf(buf, sizeof(buf), "Horaire 1: %02d:%02d  Horaire 2: %02d:%02d",
                 sc.hour1, sc.min1, sc.hour2, sc.min2);
        _tft.drawString(buf, 10, cy);
        cy += 16;
    }

    // Solar info (if SOLAR)
    if (modeIdx == 2 && _time) {
        const auto& sol = _time->solar();
        if (sol.valid) {
            snprintf(buf, sizeof(buf), "Lever: %02d:%02d  Coucher: %02d:%02d",
                     sol.sunriseHour, sol.sunriseMin, sol.sunsetHour, sol.sunsetMin);
            _tft.drawString(buf, 10, cy);
            cy += 14;
            snprintf(buf, sizeof(buf), "Offset coucher: +%d min",
                     _cfg->config().solar.sunsetOffsetMin);
            _tft.drawString(buf, 10, cy);
        }
    }

    // Duration
    cy += 20;
    snprintf(buf, sizeof(buf), "Duree cycle: %ds (ou adaptatif via profil)",
             _cfg->config().pumpDurationS);
    _tft.setTextColor(COL_GRAY);
    _tft.drawString(buf, 10, cy);

    _drawNavBar();
}

// ============================================================
// SCREEN 3: SECURITY — Safety state + unlock
// ============================================================
void TftDashboard::_drawSecurity() {
    _drawHeader("Securite");

    if (!_safety) { _drawNavBar(); return; }

    int16_t cy = 32;

    // State
    const char* stateStr = "NOMINAL";
    uint16_t stateCol = COL_OK;
    if (_safety->isSafeMode()) { stateStr = "SAFE MODE"; stateCol = COL_ERROR; }
    else if (_safety->isHardLockout()) { stateStr = "LOCKOUT DUR"; stateCol = COL_ERROR; }
    else if (_safety->isLockout()) { stateStr = "LOCKOUT AUTO"; stateCol = COL_WARN; }
    else if (_safety->state() == SafetyState::WARNING) { stateStr = "WARNING"; stateCol = COL_WARN; }

    _tft.setTextColor(stateCol);
    _tft.setTextSize(2);
    _tft.drawString(stateStr, 10, cy);
    _tft.setTextSize(1);
    cy += 28;

    // Details
    _tft.setTextColor(COL_TEXT);
    char buf[60];
    snprintf(buf, sizeof(buf), "Relay: %s", _safety->isPumpArmed() ? "ARME" : "desarme");
    _tft.drawString(buf, 10, cy); cy += 14;

    if (_sens) {
        snprintf(buf, sizeof(buf), "T amb: %.1f C", _sens->temperature());
        _tft.drawString(buf, 10, cy); cy += 14;
    }

    // Lockout type
    if (_safety->isLockout()) {
        const char* ltStr[] = {"NONE","THERMAL","TANK","OVERCURRENT","DRY_RUN","BOOT_CRASH"};
        uint8_t lt = (uint8_t)_safety->lockoutType();
        snprintf(buf, sizeof(buf), "Type: %s", lt < 6 ? ltStr[lt] : "?");
        _tft.setTextColor(COL_WARN);
        _tft.drawString(buf, 10, cy); cy += 14;

        if (_safety->isHardLockout()) {
            _tft.setTextColor(COL_ERROR);
            _tft.drawString("Necessite /unlock ou bouton", 10, cy);
            cy += 20;
            _drawButton(10, cy, 140, 30, "UNLOCK", COL_ERROR);
        } else {
            _tft.setTextColor(COL_WARN);
            _tft.drawString("Auto-recovery en cours...", 10, cy);
        }
    }

    // Slave comm
    cy += 30;
    if (_comm) {
        const char* commStates[] = {"Deconnecte", "ESP-NOW OK", "MQTT fallback", "NON-RESPONSIVE"};
        uint8_t cs = (uint8_t)_comm->commState();
        uint16_t commCol = cs == 1 ? COL_OK : cs == 3 ? COL_ERROR : COL_WARN;
        _tft.setTextColor(commCol);
        snprintf(buf, sizeof(buf), "Esclave: %s", cs < 4 ? commStates[cs] : "?");
        _tft.drawString(buf, 10, cy);
    }

    _drawNavBar();
}

// ============================================================
// SCREEN 4: SENSORS — 20 sensors detail
// ============================================================
void TftDashboard::_drawSensors() {
    _drawHeader("Capteurs (20 pots)");

    if (!_sens) { _drawNavBar(); return; }

    int16_t cy = 28;
    char buf[30];

    // Zone B (local)
    _tft.setTextColor(COL_CYAN);
    _tft.drawString("Zone B — Interieur", 6, cy);
    cy += 12;

    for (uint8_t i = 0; i < 10; i++) {
        const auto& m = _sens->data().moisture[i];
        uint16_t col = !m.valid ? COL_GRAY : m.percent < 30 ? COL_ERROR :
                       m.percent < 50 ? COL_WARN : COL_OK;
        snprintf(buf, sizeof(buf), "%02d:%3d%%", i + 11, m.valid ? m.percent : 0);
        _tft.setTextColor(col);

        int16_t x = (i < 5) ? 6 : 166;
        int16_t y = cy + (i % 5) * 11;
        _tft.drawString(buf, x, y);
        _drawProgressBar(x + 55, y - 1, 60, 9, m.valid ? m.percent : 0, col);
    }
    cy += 58;

    // Zone A (remote)
    _tft.setTextColor(COL_OK);
    _tft.drawString("Zone A — Balcon (ESP-NOW)", 6, cy);
    cy += 12;

    if (_comm && _comm->isConnected()) {
        const DataSensors& rs = _comm->lastSensors();
        for (uint8_t i = 0; i < 10; i++) {
            uint16_t col = !rs.moisture[i].valid ? COL_GRAY :
                           rs.moisture[i].percent < 30 ? COL_ERROR :
                           rs.moisture[i].percent < 50 ? COL_WARN : COL_OK;
            snprintf(buf, sizeof(buf), "%02d:%3d%%", i + 1,
                     rs.moisture[i].valid ? rs.moisture[i].percent : 0);
            _tft.setTextColor(col);

            int16_t x = (i < 5) ? 6 : 166;
            int16_t y = cy + (i % 5) * 11;
            _tft.drawString(buf, x, y);
            _drawProgressBar(x + 55, y - 1, 60, 9,
                             rs.moisture[i].valid ? rs.moisture[i].percent : 0, col);
        }
    } else {
        _tft.setTextColor(COL_ERROR);
        _tft.drawString("Esclave non connecte", 10, cy);
    }

    _drawNavBar();
}

// ============================================================
// SCREEN 5: PROFILES — Plant profiles
// ============================================================
void TftDashboard::_drawProfiles() {
    _drawHeader("Profils Hydriques");

    if (!_profiles || !_time) { _drawNavBar(); return; }

    int16_t cy = 28;
    char buf[50];
    uint8_t month = _time->month();

    const char* catNames[] = {"CITRUS","AROMAT","SUCCUL","TROPIC","MEDIT","FLEURI","CUSTOM"};

    // Compact table: pot# category coeff duration
    _tft.setTextColor(COL_GRAY);
    _tft.drawString("Pot Cat   Coeff  Duree  Debit", 6, cy);
    cy += 12;

    for (uint8_t z = 0; z < NUM_ZONES; z++) {
        _tft.setTextColor(z == 0 ? COL_OK : COL_CYAN);
        _tft.drawString(z == 0 ? "— Zone A Balcon —" : "— Zone B Interieur —", 6, cy);
        cy += 11;

        for (uint8_t p = 0; p < 10; p++) {
            if (!_profiles->hasProfile(z, p)) continue;
            const auto& prof = _profiles->getProfile(z, p);
            float coeff = _profiles->seasonalCoeff(z, p, month);
            uint16_t dur = _profiles->computeCycleDurationS(z, p, month);

            uint8_t catIdx = (uint8_t)prof.category;
            snprintf(buf, sizeof(buf), "#%02d %s %.2f %4ds %dL/h",
                     z * 10 + p + 1,
                     catIdx < 7 ? catNames[catIdx] : "?",
                     coeff, dur, (int)prof.dripperFlowLH);

            _tft.setTextColor(COL_TEXT);
            _tft.drawString(buf, 6, cy);
            cy += 10;

            if (cy > SCREEN_H - 30) break;
        }
        if (cy > SCREEN_H - 30) break;
    }

    // Current month
    _tft.setTextColor(COL_GRAY);
    snprintf(buf, sizeof(buf), "Mois: %d — coefficients saisonniers", month + 1);
    _tft.drawString(buf, 6, SCREEN_H - 42);

    _drawNavBar();
}

// ============================================================
// SCREEN 6: AUTONOMY — Prediction calculation
// ============================================================
void TftDashboard::_drawAutonomy() {
    _drawHeader("Autonomie — Prediction");

    if (!_autonomy || !_time) { _drawNavBar(); return; }

    int16_t cy = 30;
    char buf[60];
    uint8_t month = _time->month();

    // Quick calculation for 7, 14, 21, 30 days
    uint16_t durations[] = {7, 14, 21, 30};
    const char* labels[] = {"7j", "14j", "21j", "30j"};

    _tft.setTextColor(COL_TEXT);
    _tft.drawString("Duree   Balcon       Interieur", 6, cy);
    cy += 14;

    for (uint8_t d = 0; d < 4; d++) {
        AutonomyReport report = _autonomy->compute(durations[d], month);

        // Zone A
        float marginA = report.zones[0].marginPct;
        uint16_t colA = report.zones[0].sufficient ? COL_OK : COL_ERROR;
        // Zone B
        float marginB = report.zones[1].marginPct;
        uint16_t colB = report.zones[1].sufficient ? COL_OK : COL_ERROR;

        snprintf(buf, sizeof(buf), "%s", labels[d]);
        _tft.setTextColor(COL_TEXT);
        _tft.drawString(buf, 6, cy);

        // Zone A bar
        _drawProgressBar(50, cy - 1, 100, 12,
                         constrain((int)(100 - marginA), 0, 100), colA);
        snprintf(buf, sizeof(buf), "%.0f%%", marginA);
        _tft.setTextColor(colA);
        _tft.drawString(buf, 155, cy);

        // Zone B bar
        _drawProgressBar(190, cy - 1, 100, 12,
                         constrain((int)(100 - marginB), 0, 100), colB);
        snprintf(buf, sizeof(buf), "%.0f%%", marginB);
        _tft.setTextColor(colB);
        _tft.drawString(buf, 295, cy);

        cy += 18;
    }

    // Details for 21 days
    cy += 5;
    AutonomyReport r21 = _autonomy->compute(21, month);

    _tft.setTextColor(COL_TEXT);
    snprintf(buf, sizeof(buf), "Detail 21 jours (mois %d):", month + 1);
    _tft.drawString(buf, 6, cy); cy += 14;

    for (uint8_t z = 0; z < 2; z++) {
        const char* zn[] = {"Balcon", "Interieur"};
        const auto& za = r21.zones[z];
        snprintf(buf, sizeof(buf), "%s: %.1fL / %.0fL  %s",
                 zn[z], za.estimatedConsumptionML / 1000.0,
                 za.storageCapacityML / 1000.0,
                 za.sufficient ? "OK" : "DEFICIT");
        _tft.setTextColor(za.sufficient ? COL_OK : COL_ERROR);
        _tft.drawString(buf, 10, cy); cy += 12;

        snprintf(buf, sizeof(buf), "  Max autonomie: %d jours  Conso/j: %.1fL",
                 za.maxAutonomyDays, za.dailyConsumptionML / 1000.0);
        _tft.setTextColor(COL_GRAY);
        _tft.drawString(buf, 10, cy); cy += 14;
    }

    // Overall
    _tft.setTextColor(r21.overallSufficient ? COL_OK : COL_ERROR);
    _tft.setTextSize(1);
    _tft.drawString(r21.overallSufficient ?
        "21 jours: AUTONOMIE SUFFISANTE" :
        "21 jours: DEFICIT — ajouter eau!", 6, cy);

    _drawNavBar();
}

// ============================================================
// TOUCH HANDLING
// ============================================================
void TftDashboard::_handleTouch(int16_t x, int16_t y) {
    // Nav bar touch (bottom 22px)
    if (y > SCREEN_H - 22) {
        int16_t bw = SCREEN_W / 7;
        uint8_t idx = x / bw;
        if (idx < (uint8_t)Screen::COUNT) {
            setScreen((Screen)idx);
            return;
        }
    }

    // Screen-specific touch
    switch (_currentScreen) {
        case Screen::MAIN:      _handleMainTouch(x, y); break;
        case Screen::WIFI:      _handleWifiTouch(x, y); break;
        case Screen::WATERING:
            // Mode buttons (y ~50, 4 buttons)
            if (y >= 46 && y <= 74 && _cfg) {
                uint8_t modeIdx = (x - 10) / 77;
                if (modeIdx < 4) {
                    _cfg->setMode((WateringMode)modeIdx);
                    _cfg->save();
                    _needsRedraw = true;
                }
            }
            break;
        case Screen::SECURITY:
            // Unlock button
            if (y >= 140 && y <= 170 && x >= 10 && x <= 150 && _safety) {
                if (_safety->isHardLockout()) {
                    _safety->remoteUnlock("TFT");
                    _needsRedraw = true;
                }
            }
            break;
        default: break;
    }
}

void TftDashboard::_handleMainTouch(int16_t x, int16_t y) {
    // Tap anywhere on main screen → refresh
    _needsRedraw = true;
}

void TftDashboard::_handleWifiTouch(int16_t x, int16_t y) {
    // "Scan reseaux" button
    if (y >= 100 && y <= 140 && _wifi) {
        if (_wifi->isConnected()) {
            // Disconnect button (left)
            if (x < 160) {
                _wifi->disconnect();
                _needsRedraw = true;
            }
        }
        // Full scan via captive portal
    }
}
