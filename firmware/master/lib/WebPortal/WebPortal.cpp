// ============================================================
// WebPortal — Implementation
// ============================================================

#include "WebPortal.h"
#include "PlantProfile.h"
#include "AutonomyCalculator.h"
#include <ArduinoJson.h>

// ---- Embedded HTML/CSS/JS (PROGMEM) ----
const char WebPortal::_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hydra v3 — Arrosage</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
.hdr{background:#1e293b;padding:16px;text-align:center;border-bottom:2px solid #22d3ee}
.hdr h1{font-size:1.3em;color:#22d3ee}
.hdr small{color:#94a3b8;font-size:.8em}
.wrap{max-width:600px;margin:0 auto;padding:12px}
.card{background:#1e293b;border-radius:10px;padding:14px;margin-bottom:12px;border:1px solid #334155}
.card h2{font-size:1em;color:#22d3ee;margin-bottom:10px;border-bottom:1px solid #334155;padding-bottom:6px}
.row{display:flex;justify-content:space-between;align-items:center;padding:4px 0}
.row .lbl{color:#94a3b8;font-size:.85em}
.row .val{font-weight:700;font-size:.95em}
.ok{color:#4ade80}.warn{color:#fbbf24}.crit{color:#f87171}.off{color:#64748b}
.bar{height:8px;background:#334155;border-radius:4px;overflow:hidden;margin-top:4px}
.bar-fill{height:100%;border-radius:4px;transition:width .5s}
.btn{display:inline-block;padding:10px 16px;border:none;border-radius:8px;font-size:.9em;font-weight:700;cursor:pointer;width:100%;margin-top:6px;transition:opacity .2s}
.btn:active{opacity:.7}
.btn-go{background:#22d3ee;color:#0f172a}
.btn-stop{background:#f87171;color:#fff}
.btn-sec{background:#334155;color:#e2e8f0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.inp{width:100%;padding:8px;border-radius:6px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;font-size:.9em}
.inp:focus{outline:none;border-color:#22d3ee}
select.inp{appearance:none}
label{display:block;color:#94a3b8;font-size:.8em;margin-bottom:3px;margin-top:8px}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#4ade80;color:#0f172a;padding:10px 20px;border-radius:8px;font-weight:700;display:none;z-index:99}
.pulse{animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
</style>
</head>
<body>
<div class="hdr">
<h1>🌱 Balcony Hydra v3</h1>
<small id="ip"></small>
</div>
<div class="wrap">

<!-- STATUS -->
<div class="card" id="cStatus">
<h2>📊 État du système</h2>
<div class="row"><span class="lbl">Pompe</span><span class="val" id="pState">—</span></div>
<div class="row"><span class="lbl">Mode</span><span class="val" id="sMode">—</span></div>
<div class="row"><span class="lbl">WiFi</span><span class="val" id="sWifi">—</span></div>
<div class="row"><span class="lbl">Uptime</span><span class="val off" id="sUp">—</span></div>
</div>

<!-- RESERVOIR -->
<div class="card">
<h2>💧 Réservoir</h2>
<div class="row"><span class="lbl">Niveau</span><span class="val" id="tLvl">—</span></div>
<div class="bar"><div class="bar-fill" id="tBar" style="width:0%;background:#22d3ee"></div></div>
<div class="row" style="margin-top:6px"><span class="lbl">US #1</span><span class="val off" id="tU1">—</span></div>
<div class="row"><span class="lbl">US #2</span><span class="val off" id="tU2">—</span></div>
</div>

<!-- HUMIDITE -->
<div class="card">
<h2>🌡️ Capteurs</h2>
<div class="row"><span class="lbl">Humidité moy.</span><span class="val" id="mAvg">—</span></div>
<div class="bar"><div class="bar-fill" id="mBar" style="width:0%;background:#4ade80"></div></div>
<div class="row" style="margin-top:6px"><span class="lbl">Température</span><span class="val off" id="eT">—</span></div>
<div class="row"><span class="lbl">Humidité air</span><span class="val off" id="eH">—</span></div>
<div class="row"><span class="lbl">Pression</span><span class="val off" id="eP">—</span></div>
</div>

<!-- COMMANDES -->
<div class="card">
<h2>🔧 Commandes</h2>
<div class="grid2">
<button class="btn btn-go" onclick="apiPost('/api/pump/start')">▶ Arroser</button>
<button class="btn btn-stop" onclick="apiPost('/api/pump/stop')">⏹ Arrêter</button>
</div>
<button class="btn btn-sec" onclick="apiPost('/api/pump/reset')" style="margin-top:8px">↻ Reset failsafe</button>
</div>

<!-- CONFIG -->
<div class="card">
<h2>⚙️ Configuration</h2>

<label>Mode d'arrosage</label>
<select class="inp" id="cfgMode">
<option value="0">Automatique (capteurs)</option>
<option value="1">Schedulé (heures fixes)</option>
<option value="2">Manuel uniquement</option>
</select>

<div class="grid2">
<div><label>Arrosage matin</label><input type="time" class="inp" id="cfgT1" value="07:00"></div>
<div><label>Arrosage soir</label><input type="time" class="inp" id="cfgT2" value="20:00"></div>
</div>

<label>Durée pompe (secondes)</label>
<input type="number" class="inp" id="cfgDur" min="5" max="300" value="60">

<div class="grid2">
<div><label>Seuil humidité min (%)</label><input type="number" class="inp" id="cfgMmin" min="0" max="100" value="30"></div>
<div><label>Seuil humidité max (%)</label><input type="number" class="inp" id="cfgMmax" min="0" max="100" value="70"></div>
</div>

<label>Intervalle veille (secondes)</label>
<input type="number" class="inp" id="cfgSleep" min="600" max="21600" value="3600">

<label>WiFi SSID</label>
<input type="text" class="inp" id="cfgSsid" placeholder="Nom du réseau">
<label>WiFi Mot de passe</label>
<input type="password" class="inp" id="cfgWpass" placeholder="••••••••">

<label>Telegram Token</label>
<input type="text" class="inp" id="cfgTtok" placeholder="123456:ABC...">
<label>Telegram Chat ID</label>
<input type="text" class="inp" id="cfgTchat" placeholder="123456789">

<label>MQTT Host</label>
<input type="text" class="inp" id="cfgMhost" placeholder="broker.hivemq.com">

<button class="btn btn-go" onclick="saveConfig()" style="margin-top:12px">💾 Sauvegarder</button>

<div class="grid2" style="margin-top:8px">
<button class="btn btn-sec" onclick="if(confirm('Redémarrer?'))apiPost('/api/reboot')">🔄 Redémarrer</button>
<button class="btn btn-stop" onclick="if(confirm('Reset usine?'))apiPost('/api/factory-reset')" style="font-size:.8em">⚠ Reset usine</button>
</div>
</div>
</div>

<div class="toast" id="toast"></div>

<script>
const $ = id => document.getElementById(id);
const modes = ['Automatique','Schedulé','Manuel'];

function toast(msg, ok=true) {
  const t = $('toast');
  t.textContent = msg;
  t.style.background = ok ? '#4ade80' : '#f87171';
  t.style.color = ok ? '#0f172a' : '#fff';
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 2500);
}

async function apiGet(url) {
  try { const r = await fetch(url); return await r.json(); }
  catch(e) { return null; }
}

async function apiPost(url, body) {
  try {
    const opts = {method:'POST'};
    if (body) { opts.headers = {'Content-Type':'application/json'}; opts.body = JSON.stringify(body); }
    const r = await fetch(url, opts);
    const d = await r.json();
    toast(d.message || 'OK');
    refresh();
    return d;
  } catch(e) { toast('Erreur connexion', false); return null; }
}

async function refresh() {
  const s = await apiGet('/api/status');
  if (!s) return;

  $('sMode').textContent = modes[s.mode] || '?';
  $('sWifi').textContent = s.wifi.connected ? s.wifi.ip + ' (' + s.wifi.rssi + 'dBm)' : 'AP Mode';
  $('sUp').textContent = Math.floor(s.uptimeS/3600) + 'h ' + Math.floor((s.uptimeS%3600)/60) + 'm';

  // Pump
  const ps = s.pump;
  const pEl = $('pState');
  if (ps.running) { pEl.textContent = 'EN MARCHE (' + ps.runningForS + 's)'; pEl.className = 'val ok pulse'; }
  else if (ps.failsafe) { pEl.textContent = 'BLOQUÉE'; pEl.className = 'val crit'; }
  else { pEl.textContent = 'Arrêt'; pEl.className = 'val off'; }

  // Tank
  const tl = s.sensors.tankLevel;
  $('tLvl').textContent = tl + '%';
  $('tLvl').className = 'val ' + (tl <= 10 ? 'crit' : tl <= 25 ? 'warn' : 'ok');
  $('tBar').style.width = tl + '%';
  $('tBar').style.background = tl <= 10 ? '#f87171' : tl <= 25 ? '#fbbf24' : '#22d3ee';
  $('tU1').textContent = s.sensors.tank1Cm.toFixed(1) + ' cm';
  $('tU2').textContent = s.sensors.tank2Cm.toFixed(1) + ' cm';

  // Moisture
  $('mAvg').textContent = s.sensors.avgMoisture + '%';
  $('mAvg').className = 'val ' + (s.sensors.avgMoisture < 30 ? 'crit' : s.sensors.avgMoisture < 50 ? 'warn' : 'ok');
  $('mBar').style.width = s.sensors.avgMoisture + '%';
  $('mBar').style.background = s.sensors.avgMoisture < 30 ? '#f87171' : '#4ade80';

  // Env
  if (s.sensors.envValid) {
    $('eT').textContent = s.sensors.temperature.toFixed(1) + ' °C';
    $('eH').textContent = s.sensors.humidity.toFixed(0) + ' %';
    $('eP').textContent = s.sensors.pressure.toFixed(0) + ' hPa';
  }

  // Config
  $('cfgMode').value = s.mode;
  $('cfgDur').value = s.config.pumpDuration;
  $('cfgSleep').value = s.config.sleepInterval;
  $('cfgMmin').value = s.config.moisture.min;
  $('cfgMmax').value = s.config.moisture.max;
  if (s.config.schedule) {
    $('cfgT1').value = String(s.config.schedule.hour1).padStart(2,'0') + ':' + String(s.config.schedule.min1).padStart(2,'0');
    $('cfgT2').value = String(s.config.schedule.hour2).padStart(2,'0') + ':' + String(s.config.schedule.min2).padStart(2,'0');
  }
  if (s.config.network) {
    $('cfgSsid').value = s.config.network.wifiSsid || '';
    $('cfgMhost').value = s.config.network.mqttHost || '';
  }
  $('ip').textContent = s.wifi.ip || '';
}

async function saveConfig() {
  const t1 = $('cfgT1').value.split(':');
  const t2 = $('cfgT2').value.split(':');
  const cfg = {
    mode: parseInt($('cfgMode').value),
    pumpDuration: parseInt($('cfgDur').value),
    sleepInterval: parseInt($('cfgSleep').value),
    schedule: {
      hour1: parseInt(t1[0]), min1: parseInt(t1[1]), enabled1: true,
      hour2: parseInt(t2[0]), min2: parseInt(t2[1]), enabled2: true
    },
    moisture: { min: parseInt($('cfgMmin').value), max: parseInt($('cfgMmax').value) },
    network: {}
  };
  const ssid = $('cfgSsid').value;
  const wpass = $('cfgWpass').value;
  const ttok = $('cfgTtok').value;
  const tchat = $('cfgTchat').value;
  const mhost = $('cfgMhost').value;
  if (ssid) cfg.network.wifiSsid = ssid;
  if (wpass) cfg.network.wifiPass = wpass;
  if (ttok)  cfg.network.telegramToken = ttok;
  if (tchat) cfg.network.telegramChatId = tchat;
  if (mhost) cfg.network.mqttHost = mhost;

  await apiPost('/api/config', cfg);
}

refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>
)rawliteral";

// ---- Constructor ----

WebPortal::WebPortal(ConfigManager& configMgr, SensorManager& sensorMgr,
                     PumpController& pumpCtrl, WifiManager& wifiMgr)
    : _server(WEB_SERVER_PORT), _configMgr(configMgr),
      _sensorMgr(sensorMgr), _pumpCtrl(pumpCtrl), _wifiMgr(wifiMgr) {}

void WebPortal::begin() {
    _setupRoutes();
    _server.begin();
    Serial.printf("[WEB] Portail démarré sur port %d\n", WEB_SERVER_PORT);
}

void WebPortal::stop() {
    _server.end();
    Serial.println("[WEB] Portail arrêté.");
}

void WebPortal::_setupRoutes() {
    // Main page
    _server.on("/", HTTP_GET, [this](AsyncWebServerRequest* req) { _servePage(req); });

    // Captive portal redirects
    _server.on("/generate_204", HTTP_GET, [this](AsyncWebServerRequest* req) { _handleCaptivePortal(req); });
    _server.on("/hotspot-detect.html", HTTP_GET, [this](AsyncWebServerRequest* req) { _handleCaptivePortal(req); });
    _server.on("/canonical.html", HTTP_GET, [this](AsyncWebServerRequest* req) { _handleCaptivePortal(req); });

    // API: status (combined sensors + config + pump)
    _server.on("/api/status", HTTP_GET, [this](AsyncWebServerRequest* req) { _handleApiStatus(req); });

    // API: sensors
    _server.on("/api/sensors", HTTP_GET, [this](AsyncWebServerRequest* req) { _handleApiSensors(req); });

    // API: config GET
    _server.on("/api/config", HTTP_GET, [this](AsyncWebServerRequest* req) { _handleApiConfig(req); });

    // API: config POST
    _server.on("/api/config", HTTP_POST, 
        [](AsyncWebServerRequest* req) {},
        NULL,
        [this](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t idx, size_t total) {
            _handleApiConfigUpdate(req, data, len, idx, total);
        });

    // API: pump
    _server.on("/api/pump/start", HTTP_POST, [this](AsyncWebServerRequest* req) { _handleApiPumpStart(req); });
    _server.on("/api/pump/stop", HTTP_POST, [this](AsyncWebServerRequest* req) { _handleApiPumpStop(req); });
    _server.on("/api/pump/reset", HTTP_POST, [this](AsyncWebServerRequest* req) { _handleApiResetFailsafe(req); });

    // API: system
    _server.on("/api/reboot", HTTP_POST, [this](AsyncWebServerRequest* req) { _handleApiReboot(req); });
    _server.on("/api/factory-reset", HTTP_POST, [this](AsyncWebServerRequest* req) { _handleApiFactoryReset(req); });

    // 404 → redirect to main page (captive portal)
    //
    // TODO: Plant profiles & autonomy REST API.
    // Pour l'instant ces fonctionnalités sont accessibles UNIQUEMENT via
    // les commandes Telegram (/profiles, /autonomy N) qui utilisent
    // directement PlantProfile et AutonomyCalculator. Si on veut les
    // exposer aussi en HTTP REST, il faudra :
    //   - Ré-injecter les pointeurs via setPlantProfile/setAutonomyCalc
    //   - Wirer GET /api/profiles, POST /api/profiles, GET /api/autonomy
    //   - Implémenter les handlers (sérialisation JSON depuis PlantProfile)
    // Voir TelegramBot::_buildProfilesMessage pour le pattern de référence.

    _server.onNotFound([this](AsyncWebServerRequest* req) { _handleCaptivePortal(req); });
}

void WebPortal::_servePage(AsyncWebServerRequest* req) {
    req->send_P(200, "text/html", _html);
}

void WebPortal::_handleCaptivePortal(AsyncWebServerRequest* req) {
    req->redirect("http://" + _wifiMgr.localIP() + "/");
}

void WebPortal::_handleApiStatus(AsyncWebServerRequest* req) {
    JsonDocument doc;
    const auto& sd = _sensorMgr.data();
    const auto& cfg = _configMgr.config();

    doc["mode"] = static_cast<uint8_t>(cfg.mode);
    doc["uptimeS"] = millis() / 1000;

    // Sensors
    JsonObject sens = doc["sensors"].to<JsonObject>();
    sens["avgMoisture"] = sd.avgMoisture;
    sens["tankLevel"] = sd.tank[0].valid ? sd.tank[0].levelPct : 0;
    sens["tank1Cm"] = sd.tank[0].distanceCm;
    sens["tank2Cm"] = sd.tank[1].distanceCm;
    sens["temperature"] = sd.environment.temperature;
    sens["humidity"] = sd.environment.humidity;
    sens["pressure"] = sd.environment.pressure;
    sens["envValid"] = sd.environment.valid;

    // Pump
    JsonObject pump = doc["pump"].to<JsonObject>();
    const auto& ps = _pumpCtrl.status();
    pump["running"] = _pumpCtrl.isRunning();
    pump["runningForS"] = _pumpCtrl.runningForS();
    pump["state"] = static_cast<uint8_t>(ps.state);
    pump["failsafe"] = ps.failsafeActive;
    pump["totalCycles"] = ps.totalCycleCount;
    pump["lastCurrent"] = ps.lastCurrent_mA;

    // Config subset
    JsonObject cfgObj = doc["config"].to<JsonObject>();
    cfgObj["pumpDuration"] = cfg.pumpDurationS;
    cfgObj["sleepInterval"] = cfg.sleepIntervalS;

    JsonObject moist = cfgObj["moisture"].to<JsonObject>();
    moist["min"] = cfg.moisture.minThreshold;
    moist["max"] = cfg.moisture.maxThreshold;

    JsonObject sched = cfgObj["schedule"].to<JsonObject>();
    sched["hour1"] = cfg.schedule.hour1;
    sched["min1"] = cfg.schedule.min1;
    sched["hour2"] = cfg.schedule.hour2;
    sched["min2"] = cfg.schedule.min2;

    JsonObject net = cfgObj["network"].to<JsonObject>();
    net["wifiSsid"] = cfg.network.wifiSsid;
    net["mqttHost"] = cfg.network.mqttHost;

    // WiFi
    JsonObject wifi = doc["wifi"].to<JsonObject>();
    wifi["connected"] = _wifiMgr.isConnected();
    wifi["ap"] = _wifiMgr.isAPMode();
    wifi["ip"] = _wifiMgr.localIP();
    wifi["rssi"] = _wifiMgr.rssi();

    String output;
    serializeJson(doc, output);
    req->send(200, "application/json", output);
}

void WebPortal::_handleApiSensors(AsyncWebServerRequest* req) {
    _sensorMgr.readAll();
    const auto& sd = _sensorMgr.data();

    JsonDocument doc;
    JsonArray arr = doc["moisture"].to<JsonArray>();
    for (uint8_t i = 0; i < NUM_MOISTURE_SENSORS; i++) {
        JsonObject s = arr.add<JsonObject>();
        s["id"] = i;
        s["raw"] = sd.moisture[i].raw;
        s["pct"] = sd.moisture[i].percent;
        s["ok"] = sd.moisture[i].valid;
    }

    String output;
    serializeJson(doc, output);
    req->send(200, "application/json", output);
}

void WebPortal::_handleApiConfig(AsyncWebServerRequest* req) {
    req->send(200, "application/json", _configMgr.toJson());
}

void WebPortal::_handleApiConfigUpdate(AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total) {
    String body = String((char*)data).substring(0, len);
    if (_configMgr.fromJson(body)) {
        _configMgr.save();
        req->send(200, "application/json", "{\"message\":\"Configuration sauvegardée\"}");
        Serial.println("[WEB] Config mise à jour via portail.");
    } else {
        req->send(400, "application/json", "{\"message\":\"Erreur de format JSON\"}");
    }
}

void WebPortal::_handleApiPumpStart(AsyncWebServerRequest* req) {
    if (_pumpCtrl.start()) {
        req->send(200, "application/json", "{\"message\":\"Pompe démarrée\"}");
    } else {
        req->send(409, "application/json", "{\"message\":\"Pompe bloquée — failsafe actif\"}");
    }
}

void WebPortal::_handleApiPumpStop(AsyncWebServerRequest* req) {
    _pumpCtrl.stop();
    req->send(200, "application/json", "{\"message\":\"Pompe arrêtée\"}");
}

void WebPortal::_handleApiResetFailsafe(AsyncWebServerRequest* req) {
    _pumpCtrl.resetFailsafe();
    req->send(200, "application/json", "{\"message\":\"Failsafe réinitialisé\"}");
}

void WebPortal::_handleApiReboot(AsyncWebServerRequest* req) {
    req->send(200, "application/json", "{\"message\":\"Redémarrage...\"}");
    delay(500);
    ESP.restart();
}

void WebPortal::_handleApiFactoryReset(AsyncWebServerRequest* req) {
    _configMgr.reset();
    req->send(200, "application/json", "{\"message\":\"Reset usine — redémarrage...\"}");
    delay(500);
    ESP.restart();
}
