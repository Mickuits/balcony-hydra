# CLAUDE.md — Balcony Hydra v3

> Ce fichier fournit tout le contexte nécessaire à Claude Code pour travailler efficacement sur ce projet.

## Résumé du projet

Système d'arrosage automatique solaire pour 20 pots sur un balcon à Cogolin (Golfe de Saint-Tropez). Architecture ESP32 embarquée avec monitoring à distance. **Plug-and-play (zéro soudure).**

**Propriétaire:** Micka — ingénieur système, captain de yacht, basé Cogolin (semaine) / Mougins (weekends). Profil technique exigeant, approche ingénierie rigoureuse.

## Stack technique

- **MCU:** ESP32 WROOM-32 DevKit (30 pins), dual-core 240MHz, 4MB flash
- **Framework:** Arduino (via PlatformIO)
- **Build:** PlatformIO (VS Code) — `platformio.ini` dans `firmware/`
- **Langage:** C++ (OOP, classes, headers séparés)
- **RTOS:** FreeRTOS natif ESP32 (4 tâches, dual-core)
- **Libs principales:** ArduinoJson 7, ESPAsyncWebServer, PubSubClient, Adafruit BME280, Adafruit INA219, UniversalTelegramBot

## Architecture firmware

```
firmware/
├── platformio.ini          # Config build + dépendances
├── src/
│   └── main.cpp            # Point d'entrée, boot 10 étapes, FreeRTOS tasks, CLI série
├── include/
│   ├── config.h            # Toutes les constantes (pins, seuils, defaults, topics MQTT)
│   └── secrets.h.example   # Template credentials (copier en secrets.h)
└── lib/
    ├── ConfigManager/      # NVS persistence, JSON serialization, validation params
    ├── SensorManager/      # MUX multiplexing, US médiane, BME280, INA219
    ├── PumpController/     # Logique arrosage 3 modes, 6 failsafes
    ├── SafetyManager/      # Couche sécurité HW: relais, thermal lockout, crash detection
    ├── StatusLED/          # LED RGB (R=G17, G=G19, B=G23) — état visuel système
    ├── WifiManager/        # AP captif + STA, auto-reconnexion, DNS redirect
    ├── WebPortal/          # AsyncWebServer, HTML PROGMEM, REST API complète
    ├── MqttClient/         # PubSubClient, auto-publish 60s, subscribe cmd
    ├── TelegramBot/        # Alertes push, heartbeat 12h, commandes interactives
    └── SleepManager/       # Deep sleep ESP32, RTC wakeup, force pump OFF
```

### Dépendances entre modules

```
ConfigManager ──→ TOUS (fournit SystemConfig)
SensorManager ──→ PumpController (fournit SensorData)
SensorManager ──→ WebPortal, MqttClient, TelegramBot (données à publier)
PumpController ──→ WebPortal, MqttClient, TelegramBot (état pompe)
WifiManager ──→ WebPortal, MqttClient, TelegramBot (connexion réseau)
WebPortal ──→ PumpController (commandes start/stop)
WebPortal ──→ ConfigManager (mise à jour config)
MqttClient ──→ PumpController (commandes distantes)
TelegramBot ──→ PumpController (commandes distantes)
SleepManager ──→ ConfigManager (durée sleep), PumpController (force OFF)
```

### FreeRTOS — Répartition des tâches

| Tâche | Core | Intervalle | Stack | Priorité | Modules |
|-------|------|-----------|-------|----------|---------|
| Sensors | 1 | 30s | 4KB | 1 | SensorManager |
| Pump | 1 | 1s | 4KB | 2 (haute) | PumpController |
| WiFi | 0 | 500ms | 4KB | 1 | WifiManager |
| Comms | 0 | 1s | 8KB | 1 | MqttClient + TelegramBot |

**Règle critique:** Le WiFi utilise le Core 0 par défaut sur ESP32. Ne jamais mettre de tâche WiFi-intensive sur Core 1.

## Pin assignment (ESP32)

### Entrées analogiques (ADC1 uniquement — ADC2 incompatible WiFi)
- `GPIO 36 (VP)` → MUX1 SIG (ADC1_CH0) — 16 capteurs humidité
- `GPIO 39 (VN)` → MUX2 SIG (ADC1_CH3) — 4 capteurs humidité

### Entrées digitales (input only)
- `GPIO 34` → US#1 ECHO (bidon 3, principal)
- `GPIO 35` → US#2 ECHO (bidon 1, redondance)

### Contrôle MUX (S0-S3 partagés entre MUX1 et MUX2)
- `GPIO 32` → S0, `GPIO 33` → S1, `GPIO 25` → S2, `GPIO 26` → S3
- `GPIO 4` → MUX1 EN (active LOW)
- `GPIO 16` → MUX2 EN (active LOW)

### Actionneurs
- `GPIO 27` → MOSFET Gate (pompe 12V) — **pull-down 10kΩ obligatoire**
- `GPIO 14` → US#1 TRIGGER
- `GPIO 12` → US#2 TRIGGER

### Bouton physique
- `GPIO 5` → Bouton poussoir (INPUT_PULLUP, appui = LOW, ISR FALLING)
- Anti-rebond logiciel 300ms
- **Appui 1× pompe OFF** → démarre un cycle (durée config)
- **Appui 1× pompe ON** → arrête la pompe
- **Appui si failsafe** → 3 blinks LED rouge (erreur, pompe bloquée)
- Fonctionne dans TOUS les modes, même sans WiFi

### LED RGB (common cathode)
- `GPIO 17` → Rouge (LEDC PWM ch4)
- `GPIO 19` → Vert (LEDC PWM ch5)
- `GPIO 23` → Bleu (LEDC PWM ch6)

Code couleur :
| Couleur | Pattern | Signification |
|---------|---------|---------------|
| Vert fixe | Continu | Système OK |
| Vert respiration | Pulse 2s | OK, deep sleep imminent |
| Bleu fixe | Continu | WiFi AP mode (config) |
| Bleu clignotant | 500ms | Connexion WiFi en cours |
| Cyan fixe | Continu | Arrosage en cours |
| Jaune clignotant | 1s | Alerte (réservoir bas, T° haute) |
| Rouge fixe | Continu | Failsafe pompe actif |
| Rouge clignotant rapide | 200ms | Erreur critique (T° critique, lockout) |
| Blanc flash ×3 | 100ms | Feedback bouton pressé |

### Relais de sécurité
- `GPIO 18` → Relais sécurité pompe (normalement OUVERT)
- HIGH = relay fermé = pompe peut fonctionner
- LOW / MCU mort / reset = relay ouvert = pompe coupée
- **Indépendant du PumpController** — géré par SafetyManager
- Le PumpController commande le MOSFET, le SafetyManager commande le relais
- La pompe ne tourne QUE si les deux sont actifs (relay ET MOSFET)

### Sécurité hardware (indépendant du firmware)
- **Fusible 5A** sur sortie batterie (protection court-circuit global)
- **Fusible 3A** sur ligne pompe 12V (protection pompe bloquée)
- **Fusible thermique 72°C** sur câble batterie (auto-coupure irréversible si surchauffe)
- **Pull-down 10kΩ** sur Gate MOSFET (pompe OFF si MCU crash/reset)
- **BMS intégré** LiFePO4 (surcharge/décharge/court-circuit)

### I2C
- `GPIO 21` → SDA (BME280 0x76 + INA219 0x40) — pull-up 4.7kΩ
- `GPIO 22` → SCL — pull-up 4.7kΩ

### Status
- `GPIO 2` → LED onboard

### Libres
- `GPIO 15` — disponible pour extension

## Architecture de sécurité (défense en profondeur)

```
COUCHE 5 — MONITORING    Telegram (/status /unlock /safety) + dashboard web + MQTT
COUCHE 4 — FIRMWARE      SafetyManager (auto-recovery + hard lockout) + PumpController (6 failsafes)
COUCHE 3 — RELAIS HW     Relay sécurité GPIO 18 (coupe 12V si MCU non-responsive)
COUCHE 2 — PROTECTION    Fusible 5A batterie + 3A pompe + pull-down MOSFET
COUCHE 1 — PHYSIQUE      LiFePO4 (stable 60°C) + fusible thermique 72°C + BMS intégré
```

### Politique de réarmement (CRITIQUE — système autonome sans surveillance)

**Auto-recovery (le système se réarme SEUL) :**
- Thermal lockout (T° > 58°C) → quand T° < 45°C **stable pendant 5 min** → auto-réarm + alerte Telegram
- Tank critique (<10%) → quand niveau remonte > 10% → auto-reset failsafe + alerte
- WiFi perdu → reconnexion agressive (backoff exponentiel 10-60s, retry depuis AP toutes les 2 min)
- 1-2 boot crashes → watchdog reset → reboot propre, compteur incrémenté

**Hard lockout (nécessite `/unlock` Telegram OU bouton physique) :**
- 3+ boot crashes → safe mode (WiFi+Telegram restent actifs pour `/unlock` distant)
- Surintensité pompe >3A (problème mécanique probable)
- Dry-run pompe <50mA (problème hydraulique probable)

**Irréversible (remplacement physique du composant) :**
- Fusible thermique 72°C (soudé, auto-coupure définitive)
- Fusibles 5A / 3A (à remplacer)

### SafetyManager — détails
- **Thermal auto-recovery** : T° > 58°C → lockout auto → quand T° < 45°C stable 5 min → réarm. Si T° remonte pendant le cooling, le timer de 5 min se reset.
- **Boot crash detection** : compteur NVS incrémenté à chaque boot. Remis à 0 après 60s de fonctionnement stable. 3+ = safe mode.
- **Safe mode** : pompe désactivée MAIS WiFi + Telegram + Web restent actifs → `/unlock` fonctionne à distance.
- **Double verrou pompe** : SafetyManager arme le relay, PumpController commande le MOSFET. Les deux doivent être actifs pour que la pompe tourne.
- **Remote unlock** : `/unlock` depuis Telegram ou POST `/api/safety/unlock` depuis le portail web.

### Robustesse WiFi (système autonome)
- Reconnexion avec backoff exponentiel (10s → 20s → 40s → 60s max)
- Après 3 échecs → mode AP, MAIS retry STA toutes les 2 min en arrière-plan
- Si WiFi routeur revient → reconnexion automatique depuis AP mode
- Mode dégradé sans WiFi : arrosage local continue sur le schedule NVS, pas de monitoring
- `WiFi.setAutoReconnect(true)` activé comme filet de sécurité supplémentaire

### Alimentation (3 rails)
- **12V** (batterie directe) → pompe via MOSFET, entrée LM2596
- **5V** (sortie LM2596) → ESP32 VIN, capteurs US JSN-SR04T
- **3.3V** (pin 3V3 ESP32, AMS1117 onboard max 500mA) → MUX ×2, BME280, INA219, capteurs humidité

## Structs de données clés

### SystemConfig (ConfigManager.h)
```cpp
struct SystemConfig {
    WateringSchedule schedule;   // hour1/min1/hour2/min2/enabled1/enabled2
    MoistureConfig moisture;     // minThreshold/maxThreshold/airValue/waterValue
    TankConfig tank;             // heightCm/minLevelCm/criticalPct/warningPct
    NetworkConfig network;       // wifiSsid/wifiPass/mqttHost/mqttPort/telegramToken/...
    WateringMode mode;           // AUTOMATIC(0) / SCHEDULED(1) / MANUAL(2)
    uint16_t pumpDurationS;      // Durée pompe par cycle
    uint32_t sleepIntervalS;     // Intervalle deep sleep (600-21600s)
    uint32_t heartbeatIntervalMs;
    bool otaEnabled;
};
```

### SensorData (SensorManager.h)
```cpp
struct SensorData {
    MoistureReading moisture[20]; // raw(uint16), percent(uint8), valid(bool)
    TankReading tank[2];          // distanceCm, levelCm, levelPct, valid
    EnvironmentReading environment; // temperature, humidity, pressure, valid
    PumpMetrics pump;             // voltage, current_mA, power_mW, valid
    uint8_t avgMoisture;
    unsigned long timestamp;
};
```

### PumpStatus (PumpController.h)
```cpp
struct PumpStatus {
    PumpState state;              // IDLE / RUNNING / BLOCKED / ERROR
    PumpStopReason lastStopReason; // DURATION_DONE / TANK_EMPTY / OVERCURRENT / DRY_RUN / ...
    uint32_t totalCycleCount;
    float lastCurrent_mA;
    bool failsafeActive;
};
```

## API REST (WebPortal)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/` | Page HTML dashboard (PROGMEM) |
| GET | `/api/status` | État complet (sensors + pump + config + wifi) |
| GET | `/api/sensors` | Détail des 20 capteurs humidité |
| GET | `/api/config` | Config actuelle (JSON) |
| POST | `/api/config` | Mise à jour config (body JSON) |
| POST | `/api/pump/start` | Démarrer pompe |
| POST | `/api/pump/stop` | Arrêter pompe |
| POST | `/api/pump/reset` | Reset failsafe |
| POST | `/api/reboot` | Redémarrer ESP32 |
| POST | `/api/factory-reset` | Reset usine + reboot |

**Captive portal:** Les routes `/generate_204`, `/hotspot-detect.html`, `/canonical.html` redirigent vers `/` pour le portail captif en mode AP.

## MQTT Topics

| Topic | Direction | Contenu |
|-------|-----------|---------|
| `hydra/sensors` | PUB (60s) | avgMoisture, tankLevel, temperature, humidity, pressure |
| `hydra/pump` | PUB (60s) | state, running, totalCycles, lastCurrent, failsafe |
| `hydra/alerts` | PUB (event) | alert message + timestamp |
| `hydra/cmd/water` | SUB | Déclenche arrosage |
| `hydra/cmd/stop` | SUB | Arrête pompe |
| `hydra/cmd/reset` | SUB | Reset failsafe |
| `hydra/cmd/reboot` | SUB | Redémarre ESP32 |

## Telegram Bot

**Commandes:** `/status` `/water` `/stop` `/reset` `/unlock` `/safety` `/reboot` `/help`

- `/unlock` — déverrouille un hard lockout à distance (surintensité, dry-run, safe mode)
- `/safety` — affiche l'état détaillé du SafetyManager (JSON)

**Alertes push automatiques:**
- Réservoir critique (<10%)
- Niveaux US divergents (raccord obstrué)
- Pompe failsafe (surintensité, dry-run)
- Heartbeat toutes les 12h (rapport complet Markdown)

## Logique d'arrosage

### Mode AUTOMATIQUE
1. Réveil timer RTC (toutes les N heures)
2. Lecture capteurs humidité (20 pots via MUX)
3. SI heure = schedule configuré ET humidité moyenne < seuil_min → START pompe
4. Pompe tourne pendant `pumpDurationS` secondes
5. Failsafes actifs en permanence pendant le fonctionnement
6. Retour deep sleep

### Mode SCHEDULÉ
- Arrosage aux heures fixes configurées, ignore les capteurs humidité
- Capteurs utilisés uniquement pour monitoring/alertes

### Mode MANUEL
- Arrosage uniquement sur commande (web, Telegram, MQTT, série)

### Failsafes (toujours actifs, quel que soit le mode)
1. **Tank <10%** → STOP pompe + BLOCK + alerte Telegram
2. **Runtime >300s** → STOP (anti-inondation)
3. **Courant >3A** → STOP + BLOCK (pompe bloquée mécaniquement)
4. **Courant <50mA après 3s** → STOP + BLOCK (marche à sec)
5. **Niveaux US divergent >15%** → ALERTE (raccord obstrué possible)
6. **Pull-down HW 10kΩ** → pompe OFF au boot/reset (hardware, pas firmware)

## Hardware — Rappels importants

### Contraintes ESP32
- **ADC2 interdit** pour lecture analogique quand WiFi actif → utiliser ADC1 uniquement (GPIO 32-39)
- **GPIO 34, 35, 36, 39** sont INPUT ONLY (pas de pull-up/down interne)
- **GPIO 12** influence le flash voltage au boot — OK en digital output après boot
- **Deep sleep** : seul RTC memory persiste, tout le reste est perdu

### Environnement physique
- **Balcon plein sud, Cogolin** — températures été 40-50°C en surface, AUCUNE ombre
- **LiFePO4** choisie pour stabilité thermique (pas LiPo)
- **Deux boîtiers séparés** (IP65, ABS BLANC obligatoire) :
  - **Boîtier 1 — Électronique** (200×150×85mm, au mur) : ESP32, MUX, MOSFET, relais, LED, bouton
  - **Boîtier 2 — Énergie** (250×200×120mm, au sol derrière bidons) : batterie, MPPT, LM2596, fusibles
  - Boîtier énergie ventilé (grilles inox convection) + isolant alu/bulle sur couvercle
  - Bidons 25L font écran thermique devant le boîtier énergie
  - Câble inter-boîtiers 18AWG silicone 1.5m + Wago
- **Wago 221** pour toutes les connexions (zéro soudure)
- **3 bidons 25L** en vases communicants (passe-cloisons 1/2" + joints EPDM)

### Calibration capteurs humidité
- **Air sec** : ADC ~3200 → 0%
- **Immergé** : ADC ~1200 → 100%
- Configurable via portail web (champs airValue/waterValue)
- Chaque capteur devrait être calibré individuellement (TODO)

## Conventions de code

- **Langue du code:** anglais (noms de classes, variables, fonctions)
- **Langue des logs série:** français (messages `Serial.printf("[MODULE] ...")`)
- **Langue de l'interface web:** français
- **Style:** classes C++ avec headers séparés (.h/.cpp), PlatformIO lib structure
- **Nommage:** PascalCase (classes), camelCase (méthodes/variables), UPPER_SNAKE (constantes/defines)
- **Préfixe logs:** `[CONFIG]`, `[SENSOR]`, `[PUMP]`, `[WIFI]`, `[WEB]`, `[MQTT]`, `[TG]`, `[SLEEP]`, `[BOOT]`, `[MAIN]`
- **Secrets:** jamais dans le repo — `secrets.h` est dans `.gitignore`

## Commandes de build

```bash
# Build
cd firmware && pio run

# Flash
pio run -t upload

# Monitor série (115200 baud)
pio device monitor

# Build + flash + monitor
pio run -t upload && pio device monitor

# Clean
pio run -t clean
```

## CLI série (debug)

Commandes disponibles via le port série (115200 baud) :
```
status   — Résumé rapide (humidité, réservoir, pompe, WiFi)
water    — Démarrer arrosage
stop     — Arrêter pompe
sensors  — Lecture forcée de tous les capteurs
config   — Dump config JSON
pump     — Dump état pompe JSON
reset    — Reset usine (NVS clear + reboot)
ap       — Forcer mode AP WiFi
reboot   — Redémarrer ESP32
help     — Liste des commandes
```

## Documentation disponible

| Fichier | Contenu |
|---------|---------|
| `docs/BOM_v3_plug_and_play.xlsx` | Bill of Materials (41 composants, prix, sources) |
| `docs/schema_hydraulique.svg` | Schéma hydraulique (bidons, pompe, manifold, goutteurs) |
| `docs/wiring_diagram.svg` | Wiring électrique complet (3 rails, tous GPIO) |
| `docs/firmware_architecture.svg` | Architecture firmware (modules, tâches FreeRTOS) |
| `docs/system_architecture_complete.svg` | Architecture système complète (hardware + firmware + cloud, tous flux) |
| `docs/architecture.md` | Notes d'architecture texte |
| `hardware/pin_assignment.md` | Table d'assignation GPIO détaillée |

## TODO / Prochaines étapes

### Firmware
- [ ] Implémenter OTA updates (ArduinoOTA ou AsyncElegantOTA)
- [ ] Calibration individuelle par capteur (stockage NVS par index)
- [ ] Historique local (buffer circulaire en RTC memory ou SPIFFS)
- [ ] Watchdog par tâche FreeRTOS (pas seulement global)
- [ ] Tests unitaires (PlatformIO test runner)
- [ ] Mode AP timeout (retour STA après 5 min sans client)

### Hardware
- [x] Bouton poussoir GPIO 5 pour arrosage manuel (implémenté)
- [ ] Conception PCB custom (KiCad) pour remplacer le breakout board
- [ ] Impression 3D boîtier sur mesure (Bambu Lab P2S)
- [ ] Ajout buzzer piezo pour alarme locale (GPIO 18)

### Infrastructure
- [ ] Setup Grafana Cloud + InfluxDB pour dashboard historique
- [ ] Docker compose pour broker MQTT local (Mosquitto)
- [ ] CI/CD : build firmware automatique sur push (GitHub Actions + PlatformIO)

## Contexte projet

Ce projet fait partie de l'écosystème Prime Yachting / projets personnels de Micka. Autres projets connexes :
- **NavStab** — Simulateur de stabilité navale HTML5
- **Yacht Digital Retrofit Kit** — IoT prédictif superyacht (architecture similaire : ESP32 + MQTT + dashboard)
- **BTC Signal** — Dashboard Bitcoin (React/FastAPI)

Le style d'ingénierie est rigoureux, orienté systèmes, avec une attention particulière aux failsafes et à la résilience (background défense/aéro/spatial).
