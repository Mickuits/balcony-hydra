# Mobile API Contract — Balcony Hydra v4

> Contrat exhaustif des interfaces REST + MQTT exposées par le firmware `master` pour consommation par l'app mobile (PWA).
>
> **Source de vérité** : `firmware/master/lib/WebPortal/`, `firmware/master/lib/MqttClient/`, `firmware/master/include/config_master.h`.
>
> Dernière MAJ : 2026-05-18 · Firmware v4.2.1+

## Vue d'ensemble

L'app mobile communique avec le master ESP32 via deux canaux complémentaires :

| Canal | Direction | Usage | Latence | Cible |
|---|---|---|---|---|
| **REST HTTP** | Mobile → Master | Commandes ponctuelles + lecture snapshot | 50-200 ms | Actions utilisateur (arroser, unlock, config) |
| **MQTT (sub)** | Master → Mobile (via broker) | Push temps réel (sensors, pump, alerts) | < 1 s | Live dashboard, alertes |

Le master expose le REST sur son IP locale (`http://hydra.local` via mDNS ou `http://192.168.1.42` typique). Le broker MQTT est un service externe (par défaut `192.168.1.10:1883`, configurable via `/api/config`).

```
┌──────────────┐    REST HTTP    ┌──────────────┐
│              │ ──────────────► │              │
│  App mobile  │                 │ ESP32 Master │
│  (PWA)       │ ◄────── sub ─── │ (hydra.local)│
└──────┬───────┘                 └──────┬───────┘
       │                                │ pub
       │   sub                          ▼
       └────────────────────────► ┌──────────────┐
                                  │  MQTT broker │
                                  │  (Mosquitto) │
                                  └──────────────┘
```

---

## 1 · REST API

**Base URL** : `http://hydra.local/` (mDNS) ou `http://<masterIp>/`
**Auth** : header `X-Hydra-Token: <32-hex>` requis sur **tous les POST**
(écritures). Les GET (lectures) sont libres. Voir §4 pour la procédure
d'obtention du token.
**Content-Type** : `application/json` pour POST avec body.

### 1.1 — `GET /` — Dashboard HTML (legacy)

Retourne le portail web embarqué (PROGMEM, ~50 KB). L'app mobile n'utilise pas cette route — elle est conservée pour le mode AP captif et l'accès navigateur historique.

### 1.2 — `GET /api/status` — Snapshot système complet

**Le plus utilisé**. Retourne en un seul payload : capteurs, pompe, config subset, WiFi.

**Response 200** :
```json
{
  "mode": 0,                          // 0=AUTO, 1=SCHEDULED, 2=MANUAL, 3=SOLAR (cf. WateringMode)
  "uptimeS": 1234567,                 // depuis dernier boot
  "sensors": {
    "avgMoisture": 47,                // 0-100 %, moyenne 20 capteurs
    "tankLevel": 72,                  // 0-100 %, tank zone B intérieur (master)
    "tank1Cm": 12.4,                  // distance brute ultrasonique US#1 (zone A balcon, via slave)
    "tank2Cm": 8.1,                   // distance brute ultrasonique US#2 (zone B, master)
    "temperature": 22.4,              // °C (BME280)
    "humidity": 54,                   // % HR (BME280)
    "pressure": 1013.2,               // hPa (BME280)
    "envValid": true                  // false si BME280 absent ou défaillant
  },
  "pump": {
    "running": false,                 // pompe zone B (master) en marche
    "runningForS": 0,                 // durée du cycle en cours
    "state": 0,                       // 0=IDLE, 1=RUNNING, 2=BLOCKED, 3=ERROR
    "failsafe": false,                // failsafe actif (overcurrent/dry-run/etc.)
    "totalCycles": 47,                // depuis dernier boot
    "lastCurrent": 1834               // mA, dernier pic
  },
  "config": {
    "pumpDuration": 30,               // secondes par cycle
    "sleepInterval": 1800,            // secondes entre cycles AUTO
    "moisture": { "min": 35, "max": 60 },
    "schedule": { "hour1": 7, "min1": 0, "hour2": 19, "min2": 0 },
    "network": { "wifiSsid": "Mougins_5G", "mqttHost": "192.168.1.10" }
  },
  "wifi": {
    "connected": true,
    "ap": false,                      // true si en mode AP captif
    "ip": "192.168.1.42",
    "rssi": -52
  }
}
```

**Polling recommandé** : 30 s en idle, 5 s pendant un cycle d'arrosage actif.

### 1.3 — `GET /api/sensors` — Détail 20 capteurs humidité

**Response 200** :
```json
{
  "moisture": [
    { "id": 0, "raw": 2340, "pct": 62, "ok": true },
    { "id": 1, "raw": 2580, "pct": 47, "ok": true },
    // … 20 entries
    { "id": 19, "raw": 1980, "pct": 78, "ok": true }
  ]
}
```

- `id` 0-9 → zone A balcon (via slave, lecture multiplexée)
- `id` 10-19 → zone B intérieur (master MUX local)
- `raw` : ADC brut 0-4095 (air sec ~3200, immergé ~1200)
- `pct` : converti en %  via airValue/waterValue config
- `ok` : false si capteur déconnecté ou hors plage

### 1.4 — `GET /api/config` — Configuration complète

Retourne la `SystemConfig` complète (schedule, moisture, tank, network, mode, durations) sérialisée par `ConfigManager::toJson()`. Voir `ConfigManager.h` pour le schéma exact.

### 1.5 — `POST /api/config` — Mise à jour partielle de la config

**Body** (JSON, fusion partielle préservant les champs non envoyés) :
```json
{
  "mode": 1,
  "moisture": { "min": 40 },
  "schedule": { "hour1": 8, "min1": 30 }
}
```

**Response 200** : `{"message":"Configuration sauvegardée"}`
**Response 400** : `{"message":"Erreur de format JSON"}`

⚠ **Comportement** : `ConfigManager::fromJson` fait une fusion partielle (les champs absents conservent leur valeur). Persistance NVS immédiate.

### 1.6 — Commandes pompe

| Méthode | Route | Description | Response succès | Response échec |
|---|---|---|---|---|
| POST | `/api/pump/start` | Démarre la pompe master (zone B intérieur) | 200 `{"message":"Pompe démarrée"}` | 409 `{"message":"Pompe bloquée — failsafe actif"}` |
| POST | `/api/pump/stop`  | Arrête la pompe master | 200 `{"message":"Pompe arrêtée"}` | — |
| POST | `/api/pump/reset` | Reset failsafe (après obstruction / dry-run résolu) | 200 `{"message":"Failsafe réinitialisé"}` | — |

⚠ Ces routes pilotent uniquement la pompe **zone B** (master). Pour la zone A (slave), il faut passer par ESP-NOW depuis le master — pas d'API REST directe sur le slave. Une commande zone-A passe par `POST /api/config` avec un changement de mode forçant un cycle, ou par MQTT `hydra/cmd/water` qui déclenche les deux zones.

### 1.7 — Commandes système

| Méthode | Route | Effet | Note |
|---|---|---|---|
| POST | `/api/reboot` | `ESP.restart()` après 100 ms | Coupure ~5 s. Pas de body. |
| POST | `/api/factory-reset` | Efface NVS complet + reboot | ⚠ Perte de toute la config. Pas de body. |

### 1.8 — Safety (SafetyManager)

| Méthode | Route | Description |
|---|---|---|
| GET  | `/api/safety/status` | État SafetyManager (JSON) |
| POST | `/api/safety/unlock` | Déverrouille hard lockout (équivalent `/unlock` Telegram) |

**`GET /api/safety/status` Response 200** :
```json
{
  "state": 0,                         // 0=NORMAL, 1=ALERTE, 2=LOCKOUT_AUTO, 3=LOCKOUT_DUR, 4=SAFE_MODE
  "stateLabel": "Nominal",
  "lockoutType": 0,                   // 0=Aucun, 1=Thermique, 2=Réservoir, 3=Surintensité, 4=Marche à sec, 5=Boot crash
  "lockoutTypeLabel": "Aucun",
  "relayEngaged": true,               // GPIO 18 — relay sécurité armé
  "temperature": 38.2,                // °C, dernière lecture BME280
  "bootCount": 0,                     // crashes au boot (compteur NVS, reset à 0 après 60 s stable)
  "lockoutReason": "",                // string libre si lockout
  "canAutoRecover": false,            // true si state=LOCKOUT_AUTO (thermal)
  "needsUnlock": false                // true si hard lockout (overcurrent/dry-run/safe_mode)
}
```

**`POST /api/safety/unlock` Response 200** : `{"message":"Lockout déverrouillé via portail web"}`
**Response 409** : `{"message":"Unlock refusé — auto-recovery en cours ou pas de lockout actif"}`
**Response 503** : `{"message":"SafetyManager non injecté"}` (config invalide, ne devrait pas arriver en prod)

### 1.9 — Captive portal (mode AP)

| Route | Comportement |
|---|---|
| `/generate_204` | Redirige vers `/` (Android captive portal detect) |
| `/hotspot-detect.html` | Redirige vers `/` (iOS) |
| `/canonical.html` | Redirige vers `/` (Win/Mac) |
| `/<n'importe quoi>` (404) | Redirige vers `/` (`_handleCaptivePortal`) |

L'app mobile peut s'appuyer sur cette redirection pour détecter le mode AP (réponse 302 sur une route inconnue).

### 1.10 — Routes **non** implémentées (à venir)

| Route attendue | Statut | Alternative actuelle |
|---|---|---|
| `GET /api/profiles` | ❌ Non implémenté | Telegram `/profiles` |
| `POST /api/profiles` | ❌ Non implémenté | — |
| `GET /api/autonomy?days=N` | ❌ Non implémenté | Telegram `/autonomy 21` |
| `GET /api/slave/status` | ❌ Non implémenté | Inclus dans `/api/status` côté master via ESP-NOW |
| `POST /api/pairing/reset` | ❌ Non implémenté | Telegram `/pairing_reset` |
| `GET /api/pairing/status` | ❌ Non implémenté | Telegram `/pairing_status` |

Voir `firmware/master/lib/WebPortal/WebPortal.cpp:323-331` pour les commentaires TODO du firmware.

---

## 2 · MQTT topics

**Broker** : externe (Mosquitto recommandé), configuré via `network.mqttHost:network.mqttPort`.
**Auth** : optionnelle (`network.mqttUser` / `network.mqttPass`). Si vide, connexion anonyme.
**Client ID** : `hydra-<efuseMac>` (unique par MCU).
**Retain** : sensors + pump = retain ON. Alerts = retain OFF.
**QoS** : 0 (best-effort, suffisant pour usage non-critique avec REST en backup).

### 2.1 — Topics publiés par le master (à consommer par l'app)

| Topic | Cadence | Retain | Payload |
|---|---|---|---|
| `hydra/sensors` | 60 s + au boot | ✅ | Snapshot capteurs |
| `hydra/pump` | 60 s + à chaque transition état | ✅ | Status pompes 2 zones |
| `hydra/alerts` | Sur événement | ❌ | Alertes texte |

**Payload `hydra/sensors`** :
```json
{
  "avgMoisture": 47,                  // %, 20 capteurs
  "tankLevel": 72,                    // % zone B master
  "temperature": 22.4,                // °C (-99 si invalide)
  "humidity": 54,                     // % HR (-1 si invalide)
  "pressure": 1013.2                  // hPa (-1 si invalide)
}
```

**Payload `hydra/pump`** (depuis `PumpController::toJson()`, dual-zone) :
```json
{
  "balcon": {
    "state": 0,                       // 0=IDLE, 1=RUNNING, 2=BLOCKED, 3=ERROR
    "stateLabel": "Arrêt",
    "running": false,
    "runningForS": 0,
    "avgMoisture": 48,
    "totalCycles": 12,
    "lastCurrent": 1850,              // mA
    "failsafe": false,
    "lastStopReason": 0
  },
  "interieur": {
    "state": 0,
    "stateLabel": "Arrêt",
    "running": false,
    "runningForS": 0,
    "avgMoisture": 55,
    "totalCycles": 8,
    "lastCurrent": 0,
    "failsafe": false,
    "lastStopReason": 0
  }
}
```

**Payload `hydra/alerts`** :
```json
{
  "alert": "Réservoir balcon < 10%",  // texte libre
  "timestamp": 1234567                // secondes depuis boot master
}
```

### 2.2 — Topics souscrits par le master (commandes depuis l'app)

Subscription wildcard côté firmware : `hydra/cmd/#`. Le master dispatche par suffixe (`MqttClient::_onMessage`).

| Topic | Effet | Payload attendu |
|---|---|---|
| `hydra/cmd/water` | `PumpController::start()` (zone B) | ignoré (juste publish vide ou `1`) |
| `hydra/cmd/stop`  | `PumpController::stop()` | ignoré |
| `hydra/cmd/reset` | `PumpController::resetFailsafe()` | ignoré |
| `hydra/cmd/reboot`| `ESP.restart()` | ignoré |

⚠ **Pas de commande MQTT pour le SafetyManager**. Utiliser REST `POST /api/safety/unlock`.

### 2.3 — Topics référencés dans le proto mobile mais **non implémentés**

Le prototype HTML référence en commentaires des topics qui n'existent pas dans le firmware. À aligner Phase 2 :

| Topic proto | Firmware | Action Phase 2 |
|---|---|---|
| `hydra/state` | ❌ N'existe pas | Soit consommer `hydra/sensors` + `hydra/pump`, soit ajouter un topic agrégé côté firmware |
| `hydra/p07/+` (per-pot) | ❌ N'existe pas | Pas de granularité par pot en MQTT. Utiliser REST `GET /api/sensors` pour le détail |

---

## 3 · Modèle de cycle de vie pour l'app mobile

### 3.1 — Boot sequence app

1. Charger config locale (URL master, broker MQTT)
2. `GET http://<masterUrl>/api/status` → init state
3. Connecter au broker MQTT, subscribe `hydra/sensors`, `hydra/pump`, `hydra/alerts`
4. Démarrer polling REST status (30 s idle)
5. Si erreur 5xx ou timeout → bandeau "Master déconnecté", retry exponentiel (5, 10, 20, 40, 60 s max)

### 3.2 — Pattern hybride REST + MQTT

| Source de vérité | Pour quoi |
|---|---|
| **MQTT push** | Sensors live, état pompe live, alertes critiques (snackbar) |
| **REST GET** | Config, snapshot complet au démarrage, après reconnexion MQTT |
| **REST POST** | Toutes les actions utilisateur (arroser, unlock, config, reboot) |

L'app ne doit **jamais** envoyer de commande sur MQTT — risque d'ordre incertain et pas d'ACK. Toujours utiliser REST pour les actions.

### 3.3 — Détection mode AP

Si l'app reçoit `wifi.ap = true` dans `/api/status` → afficher un bandeau "Master en mode configuration WiFi" et proposer de scanner les réseaux disponibles (route à ajouter côté firmware, actuellement géré uniquement par le portail HTML).

### 3.4 — Gestion offline

- MQTT déconnecté pendant > 30 s → bandeau "Live updates indisponibles · données figées".
- REST indisponible pendant > 60 s → désactiver toutes les actions, afficher snapshot dernière connue avec horodatage.
- Cache local (IndexedDB) du dernier `/api/status` + dernier `hydra/sensors` reçu.

---

## 4 · Sécurité

### 4.1 — Auth REST : token X-Hydra-Token (implémenté 2026-05-18)

Tous les POST `/api/*` exigent le header :

```
X-Hydra-Token: <32 caractères hexadécimaux>
```

**Obtention du token** :
- Au **premier boot** du firmware master, un token est généré aléatoirement
  via `esp_random()` (16 bytes d'entropie → 32 chars hex) et persisté en NVS
  (namespace `hydra`, clé `apiToken`).
- Le token s'affiche **dans le log série** au boot, encadré par des bannières
  pour qu'il soit facile à repérer :
  ```
  ============================================
  [BOOT] API TOKEN (X-Hydra-Token) : a3f9b8c2d1e4f5...
  [BOOT] À copier dans l'app mobile · Card REST API · MASTER
  ============================================
  ```
- Le **factory reset** (`/api/factory-reset`, `/factory_reset` Telegram,
  bouton 10s) régénère un nouveau token au prochain boot.

**Côté firmware (`WebPortal::_authorized`)** :
- Extraction du header via `req->getHeader("X-Hydra-Token")`. Le serveur
  doit déclarer le header avec `collectHeaders` (sinon ESPAsyncWebServer
  filtre les headers custom).
- Comparaison **constant-time** via `ConfigManager::constantTimeEquals`
  pour éviter les timing attacks (early-exit memcmp fuiterait la position
  du premier byte différent).
- Réponse `401 Unauthorized` si header absent ou invalide.

**Routes protégées** (toutes en POST) :
- `/api/pump/start`, `/api/pump/stop`, `/api/pump/reset`
- `/api/config`
- `/api/reboot`, `/api/factory-reset`
- `/api/safety/unlock`

**Routes libres** (GET, lecture seule, monitoring) :
- `/api/status`, `/api/sensors`, `/api/config`, `/api/safety/status`

### 4.2 — État global v4.2.1

| Couche | Auth | TLS | Notes |
|---|---|---|---|
| REST master | ✅ X-Hydra-Token | ❌ HTTP nu | TLS auto-signé recommandé pour exposition hors LAN |
| MQTT broker | ✅ user/pass (Mosquitto) | ❌ MQTT cleartext | Activer TLS via reverse proxy ou directives Mosquitto |
| ESP-NOW master ↔ slave | ✅ magic 0xBA + AES-128-CCM | n/a | Unicast post-pairing chiffré (cf. PAIRING.md §Sécurité) |
| Pairing initial ESP-NOW | ⚠ broadcast en clair | n/a | Limité dans le temps (manuel), portée < 100m |

### 4.3 — Roadmap durcissement supplémentaire

- [ ] **HTTPS** sur le master via certificat auto-signé + pinning côté app
- [ ] **Rate limiting** sur `/api/*` (max N req/min par IP) pour bloquer
  bruteforce du token
- [ ] **Renouvellement du token** via commande dédiée (préserve les
  pairings, change seulement le secret REST)
- [ ] **MFA Telegram** : pour les actions critiques (`/factory_reset`,
  `/unlock`), exiger une confirmation OTP par message Telegram en plus du
  token REST

---

## 5 · Exemples de code (client JS pour l'app)

### 5.1 — Fetch wrapper avec timeout + retry

```js
async function hydraFetch(path, opts = {}, retries = 2) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`http://hydra.local${path}`, { ...opts, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return hydraFetch(path, opts, retries - 1);
    }
    throw e;
  } finally { clearTimeout(t); }
}

// Usage
const status = await hydraFetch('/api/status');
await hydraFetch('/api/pump/start', { method: 'POST' });
```

### 5.2 — Client MQTT (mqtt.js sur WebSocket)

```js
import mqtt from 'mqtt';

const client = mqtt.connect('ws://192.168.1.10:9001', {
  clientId: 'hydra-mobile-' + Math.random().toString(16).slice(2,10),
  reconnectPeriod: 5000
});

client.on('connect', () => {
  client.subscribe(['hydra/sensors', 'hydra/pump', 'hydra/alerts']);
});

client.on('message', (topic, payload) => {
  const data = JSON.parse(payload.toString());
  switch (topic) {
    case 'hydra/sensors': updateSensors(data); break;
    case 'hydra/pump':    updatePumpState(data); break;
    case 'hydra/alerts':  showAlert(data); break;
  }
});
```

⚠ **Pré-requis broker** : activer WebSocket sur Mosquitto (`listener 9001` + `protocol websockets` dans `mosquitto.conf`). Sinon l'app ne peut pas se connecter au broker depuis un navigateur.

---

## 6 · Cross-reference firmware

| Concept doc | Source firmware |
|---|---|
| Routes REST | `firmware/master/lib/WebPortal/WebPortal.cpp:284-319` |
| Handlers REST | `firmware/master/lib/WebPortal/WebPortal.cpp:344-492` |
| Topics MQTT pub/sub | `firmware/master/lib/MqttClient/MqttClient.cpp:39-108` |
| Constantes topics | `firmware/master/include/config_master.h:82-85` |
| Safety JSON schema | `firmware/master/lib/SafetyManager/SafetyManager.cpp:313-330` |
| Pump JSON schema | `firmware/master/lib/PumpController/PumpController.cpp:298-320` |
| Tests MQTT dispatch | `firmware/master/test/test_functional.cpp:1778-1810` (T15_06+) |

---

## 7 · Changelog

| Date | Changement |
|---|---|
| 2026-05-18 | Création initiale (Phase 1 mobile alignment terminée) |
