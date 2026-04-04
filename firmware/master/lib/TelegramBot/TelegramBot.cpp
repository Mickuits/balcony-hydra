// ============================================================
// TelegramBot — Implementation
// ============================================================

#include "TelegramBot.h"
#include "PlantProfile.h"
#include "AutonomyCalculator.h"
#include "SafetyManager.h"

TelegramBot::TelegramBot(ConfigManager& configMgr, SensorManager& sensorMgr, PumpController& pumpCtrl)
    : _bot(nullptr), _configMgr(configMgr), _sensorMgr(sensorMgr), _pumpCtrl(pumpCtrl),
      _lastCheck(0), _lastHeartbeat(0), _enabled(false) {}

void TelegramBot::begin() {
    if (!isEnabled()) {
        Serial.println("[TG] Pas de token configuré — désactivé.");
        return;
    }
    _secureClient.setInsecure();  // Skip cert validation (ESP32 memory constraint)
    _bot = new UniversalTelegramBot(_configMgr.config().network.telegramToken, _secureClient);
    _bot->longPoll = 0;
    _enabled = true;
    Serial.println("[TG] Bot Telegram initialisé.");
    sendAlert("🌱 Hydra v" HYDRA_VERSION " en ligne");
}

void TelegramBot::update() {
    if (!_enabled || !WiFi.isConnected() || !_bot) return;
    
    // Check messages every 3s
    if (millis() - _lastCheck > 3000) {
        _lastCheck = millis();
        int numNew = _bot->getUpdates(_bot->last_message_received + 1);
        while (numNew) {
            _handleMessages(numNew);
            numNew = _bot->getUpdates(_bot->last_message_received + 1);
        }
    }
    
    // Heartbeat
    if (millis() - _lastHeartbeat > _configMgr.config().heartbeatIntervalMs) {
        _lastHeartbeat = millis();
        sendHeartbeat();
    }
}

void TelegramBot::sendAlert(const String& message) {
    if (!_enabled || !_bot) return;
    _bot->sendMessage(_chatId(), message, "");
    Serial.printf("[TG] Alerte envoyée: %s\n", message.c_str());
}

void TelegramBot::sendHeartbeat() {
    if (!_enabled || !_bot) return;
    _bot->sendMessage(_chatId(), _buildStatusMessage(), "Markdown");
    Serial.println("[TG] Heartbeat envoyé.");
}

bool TelegramBot::isEnabled() const {
    return strlen(_configMgr.config().network.telegramToken) > 5 &&
           strlen(_configMgr.config().network.telegramChatId) > 0;
}

String TelegramBot::_chatId() const {
    return String(_configMgr.config().network.telegramChatId);
}

void TelegramBot::_handleMessages(int numNew) {
    for (int i = 0; i < numNew; i++) {
        String chatId = _bot->messages[i].chat_id;
        if (chatId != _chatId()) continue;  // Ignore unauthorized
        
        String text = _bot->messages[i].text;
        text.trim();
        text.toLowerCase();
        
        if (text == "/status" || text == "/s") {
            _bot->sendMessage(chatId, _buildStatusMessage(), "Markdown");
        }
        else if (text == "/water" || text == "/w") {
            if (_pumpCtrl.start()) {
                _bot->sendMessage(chatId, "💧 Pompe démarrée", "");
            } else {
                _bot->sendMessage(chatId, "⛔ Pompe bloquée (failsafe actif)", "");
            }
        }
        else if (text == "/stop") {
            _pumpCtrl.stop();
            _bot->sendMessage(chatId, "⏹ Pompe arrêtée", "");
        }
        else if (text == "/reset") {
            _pumpCtrl.resetFailsafe();
            _bot->sendMessage(chatId, "✅ Failsafe pompe réinitialisé", "");
        }
        else if (text == "/unlock") {
            if (_safetyMgr) {
                if (_safetyMgr->isHardLockout()) {
                    _safetyMgr->remoteUnlock("Telegram");
                    _bot->sendMessage(chatId, "🔓 Système déverrouillé à distance", "");
                } else if (_safetyMgr->isLockout()) {
                    _bot->sendMessage(chatId, "ℹ Lockout auto-recovery en cours — patience, le système se réarmera seul", "");
                } else {
                    _bot->sendMessage(chatId, "ℹ Pas de lockout actif", "");
                }
            } else {
                _bot->sendMessage(chatId, "⚠ SafetyManager non disponible", "");
            }
        }
        else if (text == "/safety") {
            if (_safetyMgr) {
                _bot->sendMessage(chatId, _safetyMgr->toJson(), "");
            }
        }

        else if (text == "/profiles") {
            if (_plantProfile) {
                _bot->sendMessage(chatId, _plantProfile->toJson(), "");
            } else {
                _bot->sendMessage(chatId, "PlantProfile non disponible", "");
            }
        }
        else if (text.startsWith("/autonomy")) {
            if (_autonomyCalc) {
                int days = 21;  // Default
                if (text.length() > 10) {
                    days = text.substring(10).toInt();
                    if (days < 1) days = 1;
                    if (days > 365) days = 365;
                }
                struct tm t;
                uint8_t month = 0;
                if (getLocalTime(&t, 1000)) month = t.tm_mon;
                AutonomyReport report = _autonomyCalc->compute(days, month);
                _bot->sendMessage(chatId, report.summary, "");
            } else {
                _bot->sendMessage(chatId, "AutonomyCalculator non disponible", "");
            }
        }
        else if (text == "/reboot") {
            _bot->sendMessage(chatId, "🔄 Redémarrage...", "");
            delay(500);
            ESP.restart();
        }
        else if (text == "/help" || text == "/start") {
            String help = "🌱 *Hydra v" HYDRA_VERSION "*\n\n";
            help += "📊 /status — État complet\n";
            help += "💧 /water — Arroser maintenant\n";
            help += "⏹ /stop — Arrêter pompe\n";
            help += "🔄 /reset — Reset failsafe pompe\n";
            help += "🔓 /unlock — Déverrouiller lockout dur\n";
            help += "🛡 /safety — État sécurité détaillé\n";
            help += "🌱 /profiles — Profils hydriques plantes\n";
            help += "📊 /autonomy N — Calcul autonomie N jours\n";
            help += "🔄 /reboot — Redémarrer système\n";
            _bot->sendMessage(chatId, help, "Markdown");
        }
    }
}

String TelegramBot::_buildStatusMessage() {
    const auto& sd = _sensorMgr.data();
    const auto& ps = _pumpCtrl.status();
    
    String emoji;
    if (ps.failsafeActive) emoji = "🔴";
    else if (_pumpCtrl.isRunning()) emoji = "💧";
    else emoji = "🟢";
    
    String tankEmoji;
    uint8_t tl = _sensorMgr.tankLevel();
    if (tl <= 10) tankEmoji = "🔴";
    else if (tl <= 25) tankEmoji = "🟡";
    else tankEmoji = "🔵";
    
    String msg = emoji + " *Hydra — Rapport*\n\n";
    msg += "💧 Réservoir: " + tankEmoji + " " + String(tl) + "%\n";
    msg += "🌡 Humidité sol: " + String(sd.avgMoisture) + "%\n";
    
    if (sd.environment.valid) {
        msg += "🌡 Température: " + String(sd.environment.temperature, 1) + "°C\n";
        msg += "💨 Humidité air: " + String(sd.environment.humidity, 0) + "%\n";
    }
    
    msg += "\n⚙ Pompe: ";
    if (_pumpCtrl.isRunning()) msg += "EN MARCHE (" + String(_pumpCtrl.runningForS()) + "s)\n";
    else if (ps.failsafeActive) msg += "BLOQUÉE ⚠\n";
    else msg += "Arrêt\n";
    
    msg += "🔄 Cycles total: " + String(ps.totalCycleCount) + "\n";
    msg += "⏱ Uptime: " + String(millis() / 3600000) + "h\n";
    
    return msg;
}
