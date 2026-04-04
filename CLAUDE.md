# CLAUDE.md — Balcony Hydra v4

> Ce fichier fournit tout le contexte nécessaire à Claude Code pour travailler efficacement sur ce projet.

## Résumé du projet

Système d'arrosage automatique **distribué maître/esclave** pour 20 pots répartis entre un balcon extérieur (Mougins le Haut) et l'intérieur de l'appartement. **2 ESP32** communiquant par **ESP-NOW + MQTT fallback**. Plug-and-play (zéro soudure).

**Propriétaire:** Micka — ingénieur système, captain de yacht, basé Cogolin (semaine) / Mougins (weekends). Profil technique exigeant, approche ingénierie rigoureuse.

## Stack technique

- **MCU:** 2× ESP32 WROOM-32 DevKit (30 pins), dual-core 240MHz, 4MB flash
- **Framework:** Arduino (via PlatformIO)
- **Build:** PlatformIO (VS Code) — 2 projets séparés (`firmware/master/` + `firmware/slave/`)
- **Langage:** C++ (OOP, classes, headers séparés)
- **RTOS:** FreeRTOS natif ESP32 (4 tâches, dual-core)
- **Communication:** ESP-NOW (primaire, peer-to-peer) + MQTT (fallback, via routeur WiFi)
- **Écran:** LCD TFT 2.4" ILI9341 + tactile XPT2046 (maître uniquement)
- **Libs principales:** ArduinoJson 7, ESPAsyncWebServer, PubSubClient, Adafruit BME280, Adafruit INA219, UniversalTelegramBot, TFT_eSPI, XPT2046_Touchscreen

## Architecture système distribuée

```
INTÉRIEUR (maître USB secteur)          BALCON (esclave solaire LiFePO4)
┌──────────────────────┐               ┌──────────────────────┐
│ ESP32 MAÎTRE         │   ESP-NOW     │ ESP32 ESCLAVE        │
│ LCD TFT 2.4" tactile │◄────────────►│ Pompe A (10 pots)    │
│ Pompe B (10 pots)    │   + MQTT     │ 10 capteurs humidité │
│ 10 capteurs humidité │   fallback   │ BME280 + INA219      │
│ DS3231 RTC           │               │ LED RGB              │
│ Relay sécurité       │               │ Mode dégradé local   │
│ Web + Telegram + MQTT│               │ LiFePO4 + solaire    │
│ LED RGB              │               └──────────────────────┘
└──────────────────────┘
```

Voir `docs/architecture_v4.md` pour l'architecture détaillée.

## Architecture firmware

```
firmware/
├── common/                     # Code partagé maître+esclave
│   ├── Protocol.h              # Messages ESP-NOW bidirectionnels (structs)
│   └── config_common.h         # Constantes partagées (seuils, pins communs)
├── master/                     # Firmware maître (intérieur, USB secteur)
│   ├── platformio.ini
│   ├── src/main.cpp
│   ├── include/
│   │   ├── config_master.h     # Pins maître, seuils spécifiques
│   │   └── secrets.h.example
│   └── lib/
│       ├── ConfigManager/      # NVS, JSON, validation
│       ├── SensorManager/      # MUX×1 (10 capteurs intérieur), US#2
│       ├── PumpController/     # Pompe B intérieur (filaire GPIO 27)
│       ├── SafetyManager/      # Relay, thermal, crash, remote unlock
│       ├── StatusLED/          # LED RGB maître
│       ├── WifiManager/        # AP+STA, config écran tactile
│       ├── EspNowMaster/       # ESP-NOW comm + MQTT fallback vers esclave
│       ├── TftDashboard/       # ILI9341 + XPT2046 tactile (5 écrans)
│       ├── WebPortal/          # AsyncWebServer, dashboard web
│       ├── MqttClient/         # MQTT cloud
│       ├── TelegramBot/        # Alertes push + commandes
│       ├── TimeManager/        # DS3231 + NTP + solaire NOAA
│       └── SleepManager/       # Gestion veille
└── slave/                      # Firmware esclave (balcon, solaire)
    ├── platformio.ini
    ├── src/main.cpp
    ├── include/config_slave.h
    └── lib/
        ├── SensorManager/      # MUX×1 (10 capteurs balcon), US#1, BME280, INA219
        ├── PumpController/     # Pompe A balcon (locale GPIO 27)
        ├── EspNowSlave/        # Réception commandes + envoi données
        ├── SafetyLocal/        # Failsafes locaux (sans relay, MOSFET + fusibles)
        ├── StatusLED/          # LED RGB esclave
        └── DegradedMode/       # Arrosage autonome si maître perdu (NVS schedule)
```

### Modules existants (v3, à restructurer en master/ et slave/)
Le code actuel dans `firmware/lib/` est le firmware monolithique v3. Il doit être
découpé en `firmware/master/lib/` et `firmware/slave/lib/` avec le code commun
dans `firmware/common/`. Les modules existants sont fonctionnels et testés:

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

## Architecture dual-zone

Le système gère **2 zones indépendantes** avec chacune sa pompe, son réservoir et ses capteurs :

### Zone A — Balcon (extérieur)
- 10 pots (citronnier, aromates, méditerranéennes)
- 2 réservoirs 25L en vases communicants (50L)
- Pompe péristaltique 12V via MOSFET GPIO 27
- Capteur US#1 (GPIO 14/34)
- Capteurs humidité MUX1 C0-C9
- BME280 environnement
- Goutteurs 4-8 L/h

### Zone B — Intérieur
- 10 pots (plantes vertes, tropicales)
- 1 réservoir 25L dédié
- Pompe péristaltique 12V via MOSFET GPIO 15
- Capteur US#2 (GPIO 12/35)
- Capteurs humidité MUX1 C10-C15 + MUX2 C0-C3
- Goutteurs 2-4 L/h
- Tube 4/6mm passe par porte/fenêtre balcon

### Indépendance des zones
- Chaque zone a sa moyenne d'humidité séparée
- En mode AUTO, une zone peut arroser sans l'autre
- Cooldown et max cycles par zone (pas global)
- Tank failsafe par zone (US#1 → zone A, US#2 → zone B)
- Le relay sécurité coupe les DEUX pompes (sécurité globale)
- Telegram indique la zone dans chaque alerte

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
- **Fallback sans NTP** : si `getLocalTime()` échoue (WiFi jamais connecté), arrosage toutes les `sleepInterval×2` (min 1h) basé sur `millis()`, en respectant le mode (AUTO vérifie humidité, SCHEDULÉ arrose systématiquement)

### OTA (Over-The-Air updates)
- ArduinoOTA, hostname `hydra`, découverte mDNS
- Pompe forcée OFF + relay désarmé pendant la mise à jour
- LED blanche fixe pendant l'update
- Rollback automatique si update échoue
- Upload: `pio run -t upload --upload-port hydra.local`

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

### Mode AUTOMATIQUE (thermostat d'humidité)
- **L'humidité pilote, pas l'horaire**
- Chaque cycle capteurs (30s), on lit l'humidité moyenne des 20 pots
- Si humidité < seuil_min → arrosage immédiat (quelle que soit l'heure)
- Si humidité > seuil_min → rien
- **Protection anti-spam** :
  - Cooldown minimum entre 2 cycles auto (défaut 2h, configurable)
  - Max cycles par 24h (défaut 4, configurable)
  - Compteur reset toutes les 24h
- Pas de schedule horaire en mode AUTO — le sol décide

### Mode SCHEDULÉ
- Arrosage aux heures fixes configurées (HH:MM × 2 créneaux)
- Ignore les capteurs humidité (monitoring seul)

### Mode SOLAIRE
- Arrosage calé sur lever/coucher du soleil (algorithme NOAA embarqué)
- Offset configurable par événement (ex: coucher +30 min)
- Ignore les capteurs humidité (monitoring seul)

### Mode MANUEL
- Arrosage uniquement sur commande (web, Telegram, MQTT, bouton, série)

### Résumé des 4 modes

| Mode | Déclencheur | Humidité décide | Horaire |
|------|------------|-----------------|---------|
| AUTO | Humidité < seuil | OUI | NON |
| SCHEDULED | Heures fixes | NON (monitoring) | OUI |
| SOLAR | Lever/coucher soleil | NON (monitoring) | Solaire |
| MANUAL | Commande | NON (monitoring) | NON |

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

### Environnement physique — Architecture v4 distribuée
- **Maître (intérieur appartement)** : ESP32 + TFT 2.4" + pompe B + 10 capteurs. USB secteur.
  - Boîtier ABS 200×150×85mm, pas besoin IP65 (intérieur)
  - Réservoir intérieur 25L dédié
- **Esclave (balcon plein sud, Mougins le Haut)** : ESP32 + pompe A + 10 capteurs. Solaire.
  - Boîtier IP65 ABS BLANC, presse-étoupes
  - 2 réservoirs 25L en vases communicants (50L)
  - Derrière les bidons : boîtier énergie ventilé (LiFePO4 + MPPT + fusibles)
  - Grilles inox convection + isolant alu/bulle sur couvercle
- **Communication** : ESP-NOW (peer-to-peer, pas besoin routeur) + MQTT fallback (via WiFi routeur)
- **Aucun câble entre intérieur et balcon** — tout est sans fil
- **Wago 221** pour toutes les connexions (zéro soudure)

### Prochaines étapes v4 (TODO)
- [ ] Restructurer le repo en `firmware/master/` + `firmware/slave/` + `firmware/common/`
- [ ] Implémenter `Protocol.h` (structs messages ESP-NOW bidirectionnels)
- [ ] Firmware esclave: `EspNowSlave`, `DegradedMode`, `SafetyLocal`
- [ ] Firmware maître: `EspNowMaster`, `TftDashboard` (ILI9341 + XPT2046)
- [ ] Résoudre conflit SPI/LED (pins 18,19,23 partagés entre SPI TFT et LED RGB)
- [ ] Écran config WiFi: scan réseaux + clavier virtuel tactile au premier boot
- [ ] Wiring diagrams séparés: `wiring_master.svg` + `wiring_slave.svg`
- [ ] BOM finale v4 avec quantités consolidées
- [ ] Tests unitaires PlatformIO (par firmware)
- [ ] CI/CD GitHub Actions (build master + slave)

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
- [x] OTA updates (ArduinoOTA, hostname "hydra", pump forced OFF during update)
- [x] PumpController → SafetyManager callback wired (overcurrent/dry-run → hard lockout)
- [x] Fallback arrosage sans NTP (intervalle basé sur sleepInterval×2 si WiFi jamais connecté)
- [x] Tank auto-recovery (niveau remonte → auto-reset failsafe pompe + notify SafetyManager)
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
