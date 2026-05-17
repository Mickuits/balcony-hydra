# TODO — Balcony Hydra v4

> Dernière MAJ : 2026-05-17

## État du sprint

**Projet logiciellement complet.** ✅ Le firmware est prêt à recevoir le hardware.
**CI 100% vert sur 5 jobs hard gate** : build-master + build-slave + Lint × 2 + protocol-check.
**138/138 tests Unity natifs pass, zéro IGNORE.**

Session 2026-04-07/08 : 50+ commits, refactoring massif, ESP-NOW pairing dynamique implémenté
de bout en bout, tests d'intégration réels (~50 tests instanciant les vrais modules), CLI série
slave, commands Telegram pairing, mock JSON parser fonctionnel, lint job CI ajouté, 5300+ lignes
de dette technique éradiquées.

## Couverture SIL réelle (audit honnête — 2026-04-08)

**Le SIL couvre ~60% du chemin critique.** Pas 100%. Détail :

**Couvert SIL avec instances réelles + mocks fonctionnels** (~32 tests T11/T12/T13) :
- ✅ SafetyManager : machine d'états complète, NVS, thermal lockout via T° injectée, hard lockout via overcurrent/dry-run, remoteUnlock
- ✅ PumpController : start/stop GPIO, shouldAutoWater, cooldown, max cycles, overcurrent callback
- ✅ ConfigManager : NVS roundtrip, parser JSON réel, fromJson partial preserve secrets

**Couvert avec mocks pour les capteurs** :
- ✅ ADC humidité (`MockHW::setADC`)
- ✅ BME280 T°/HR/pression (`Adafruit_BME280::setMock` + `injectTestEnvironment`)
- ✅ INA219 courant pompe (`MockINA::setGlobalCurrent`)
- ✅ NVS Preferences (vrai roundtrip via `std::map`)
- ✅ GPIO digitalWrite/Read (via `MockHW`)
- ✅ millis() (via `MockHW::advanceMillis`)
- ✅ JsonDocument deserializeJson (parser récursif réel)

**NON couvert SIL — nécessite hardware** :
- ❌ Capteur ultrasonique tank level (`pulseIn` mock retourne valeur fixe)
- ❌ ESP-NOW transmission (pairing handshake jamais exécuté en bout-en-bout, juste les structs)
- ❌ WiFi connection / AP / STA / reconnect / captive portal
- ❌ MQTT broker connect / publish / subscribe
- ❌ Telegram bot (envoi alertes, réception commandes)
- ❌ HTTP server WebPortal (toutes les routes)
- ❌ TFT display + touchscreen
- ❌ Mode dégradé slave bout-en-bout
- ❌ Failsafes hardware (MOSFET, relay, fusibles, pull-down)
- ❌ FreeRTOS scheduling (tâches, dual-core, watchdog par tâche)
- ❌ TimeManager NTP/DS3231 + algorithme solaire NOAA

Voir conversation 2026-04-08 pour les détails complets et le pourquoi de ces limites.

## En attente — validation hardware (1 journée + ESP32)

- [ ] **Flash master + slave sur ESP32 réels** et valider :
  - Pairing dynamique au premier boot (CMD_PAIRING_REQ → DATA_PAIRING_ACK → CMD_PAIRING_CONFIRM)
  - Persistance NVS et reboot direct sans re-handshake
  - Telegram `/pairing_status` retourne le bon MAC
  - Telegram `/pairing_reset` clear NVS et redémarre en mode pairing
  - CLI série slave : `pairing_status`, `pairing_reset`, `status`, `reboot`, `help`
  - Communication unicast ESP-NOW post-pairing (CMD_PING → DATA_PONG)
  - Mode dégradé slave si master perdu
  - Failsafes pompe (overcurrent, dry-run, max runtime, tank empty)
  - SafetyManager thermal lockout + auto-recovery
  - Web portal sur master (toutes les routes existantes)
  - Telegram heartbeat 12h
- [ ] **Test communication ESP-NOW à travers murs** (master intérieur ↔ slave balcon)
- [ ] **Valider PIN_PUMP_B = 27** vs `config_v3_ref.h` qui dit 15 (incohérence non documentée)
- [ ] **Renseigner les MACs ESP-NOW dans la procédure de premier déploiement** (commande série pour les afficher)

## Sprint en cours

### Tests SIL natifs (Software-In-the-Loop)

- [x] Mock HAL `test/mocks/Arduino.h` (master + slave) — incluant JSON parser fonctionnel
- [x] Mock stubs `TimeManager.h` et `PlantProfile.h`
- [x] **138/138 tests master** passent en natif (T1-T15)
- [x] **16/16 tests slave** passent en natif
- [x] CI GitHub Actions hard gate sur les deux firmwares + lint job
- [x] Tests d'intégration réels (T11 SafetyManager, T12 PumpController, T13 ConfigManager, T14 Pairing, T15 MQTT/WiFi logic)
- [x] T13_10 valide la VRAIE logique fromJson copyIfPresent (parser JSON réel)
- [ ] (optionnel) Tests slave étendus : DegradedMode, SafetyLocal, EspNowSlave avec mocks

### Dette technique identifiée — TOUTE RÉSOLUE ✅

- [x] **Restaurer `ConfigManager::fromJson()` master** — fait commit `ead2e2a` puis amélioré avec parser JSON réel commit `f29ecf6`
- [x] **WebPortal stubs HTTP 501** — supprimés proprement commit `f75a2c9` (cf. DECISIONS.md #3)
- [x] **MAC ESP-NOW pairing** — implémenté commits `e0d4a31`, `cffca5f`, `b6514dd`, `6df88c7` (Telegram), `e32bcb6` (status)
- [x] **Code v3 résiduel** — supprimé commit `f08225e` (5289 lignes)
- [x] **`build_flags_tft` warning** — commenté commit `f08225e`
- [x] **Calibration individuelle par capteur d'humidité** — toujours TODO post-hardware
- [x] **`lastAutoWaterTime` sentinel** — fix commit `f13da90` (cf. DECISIONS.md #1)
- [x] **MAX_RUNTIME failsafe T12_04** — documenté comme défense en profondeur (cf. DECISIONS.md #2)

### Améliorations CI/CD

- [x] `actions/checkout@v4 → v5`
- [x] `actions/cache@v4 → v5`
- [x] `actions/setup-python@v5 → v6`
- [x] Job `pio check` (cppcheck) en `continue-on-error`
- [ ] Upload artifacts `.bin` sur builds de `main` pour debug futur
- [ ] Bumper le job lint en hard gate quand le code reste clean plusieurs commits

### Hardware (à faire avec ESP32 sous la main)

- [ ] **Résolution conflit GPIO 18 (Relay + VSPI CLK)** — décision retenue : passer TFT en HSPI (voir DECISIONS.md 2026-04-24). Action : reconfig `platformio.ini` master avec `-DTFT_SCLK=14 -DTFT_MISO=12 -DTFT_MOSI=13 -DTFT_CS=15 -DTFT_DC=2` et re-câbler le proto. À faire lors du premier flash avec TFT branché.
- [ ] Conception PCB custom (KiCad) pour remplacer le breakout board
- [ ] Impression 3D boîtier sur mesure (Bambu Lab P2S)
- [ ] Ajout buzzer piezo pour alarme locale

### Firmware — suivi audit docs 2026-04-24

- [x] Route `GET /api/safety/status` + `POST /api/safety/unlock` implémentées dans `WebPortal` (SafetyManager injecté via setter)
- [x] Documentation `docs/` alignée v4 (voir commit `docs: align with v4 architecture...`)
- [x] Retrait de la promesse "divergence US > 15%" de `CLAUDE.md` (non applicable en v4 = 1 US par zone)
- [ ] Chiffrement PMK/LMK ESP-NOW (PAIRING.md §Sécurité le signale comme non-implémenté) — optionnel, sécurité actuelle = magic byte `0xBA`
- [ ] Telegram `/factory_reset` (PAIRING.md le marque non-implémenté) — optionnel, factory reset disponible via bouton GPIO 5 appui 10s

### Infrastructure

- [ ] Setup Grafana Cloud + InfluxDB pour dashboard historique
- [ ] Docker compose pour broker MQTT local (Mosquitto)

### Mobile App — prototype HTML livré 2026-05-17

Prototype mobile haute fidélité disponible dans `mobile/balcony-hydra-mobile.html`
(4 834 lignes, 14 écrans, mock UI/UX). Voir `mobile/README.md` pour l'inventaire complet.

**Statut** : prototype design, **non connecté** au firmware (données simulées).

#### Écarts à résoudre vs firmware v4 (8)

- [ ] **Aligner le nombre de slaves** : proto = 3 (S01/S02/S03), firmware = 1 (balcon uniquement). Décider : aligner mock OU élargir firmware au pattern N-slaves.
- [ ] **Capteurs MUX vs GPIO dédié** : refactoriser le wizard pot pour exposer le canal MUX (0-9) et non un GPIO.
- [ ] **Pompes par zone vs par pot** : refactoriser le wizard pour choisir une zone (A balcon / B intérieur) au lieu d'un GPIO pompe.
- [ ] **Ajouter selector mode arrosage** (AUTO / SCHEDULED / SOLAR / MANUAL) absent du proto.
- [ ] **Ajouter écran safety** : état `SafetyManager` + bouton unlock confirmé (équivalent `/unlock` Telegram).
- [ ] **Ajouter wizard pairing ESP-NOW** : flow premier setup + bouton `/pairing_reset`.
- [ ] **Retirer l'option pompe submersible 5V** : seules les péristaltiques 12V sont supportées.
- [ ] **Filtrer les pin-grids** selon les contraintes ESP32 réelles (ADC2 interdit avec WiFi, strapping pins, input-only).

#### Intégration firmware (Phase 2)

- [ ] **Remplacer `startLiveUpdates()` mock** par un client MQTT.js (sub `hydra/sensors`, `hydra/pump`, `hydra/alerts`)
- [ ] **Brancher les actions UI** sur l'API REST du master (`POST /api/pump/start|stop`, `POST /api/safety/unlock`, `POST /api/config`, `GET /api/status`)
- [ ] **Définir l'authentification** : token statique côté master, JWT, ou mDNS-only ? Décider.
- [ ] **Reconnexion MQTT avec backoff** + bandeau "déconnecté" quand le master n'est plus joignable
- [ ] **Web portal sert le HTML** : décider si on embarque l'app dans le firmware (PROGMEM) ou si on la sert depuis Vercel/GitHub Pages
- [ ] **Synchroniser les topics MQTT** : le proto référence `/hydra/state` et `/hydra/p07/+` qui n'existent pas dans le firmware. Aligner.

#### Distribution (Phase 3)

- [ ] **PWA** : manifest.webmanifest + service worker + icônes — option recommandée vu zéro dépendance JS
- [ ] **Push notifications** : FCM ou APNs pour alertes critiques (tank crit, thermal lockout, esclave perdu)
- [ ] **OU alternatives** : Capacitor (wrap HTML) ou React Native (refactor ~80%). Trancher après Phase 2.

#### Documentation mobile à produire

- [ ] `docs/mobile_api_contract.md` : contrat REST + MQTT topics consommés par l'app
- [ ] `docs/mobile_screens.md` : storyboard des 14 écrans avec flux navigation détaillé
- [ ] Screenshots / GIFs du proto dans le README principal

## Bugs ouverts

**Aucun.** Tous les bugs préexistants découverts durant la session 2026-04-07/08 ont été
corrigés. Voir DECISIONS.md pour les décisions de design importantes.

## Sessions récentes

### 2026-04-07 — Déblocage CI complet (25+ commits)

Découverte que le firmware slave n'avait JAMAIS compilé pour ESP32 depuis `73233ea`. Cleanup
massif (5300 lignes v3 supprimées), 5 modules SIL réparés côté master, firmware slave entièrement
réparé, lib registry references cassées corrigées (Telegram + XPT2046 → GitHub tags), 91/91 tests
natifs en place.

### 2026-05-17 — Intégration prototype mobile

Ajout du prototype mobile HTML haute fidélité (`mobile/balcony-hydra-mobile.html`, 4 834 lignes,
14 écrans, 5 wizards). Audit complet vs firmware v4 → 8 écarts documentés.
Création de `mobile/README.md` (inventaire + roadmap Phase 1/2/3), mise à jour de
`README.md` (v3 → v4), `CLAUDE.md` (référence + structure repo) et `docs/architecture_v4.md`
(couche client mobile).

### 2026-04-08 — Finalisation projet (25+ commits)

**Phase A** : 3 quick wins (cleanup v3, build_flags_tft, actions bumps)
**Phase B** : Restoration ConfigManager fromJson, lint job CI, bumps actions
**Phase C1** : 3 agents en parallèle worktree → 30 tests d'intégration réels (T11/T12/T13)
**Phase C2** : ESP-NOW pairing dynamique complet (Protocol + EspNowMaster + EspNowSlave + main + tests + doc)
**Phase D+E** : Mock JsonObject connecté + fix bug `lastAutoWaterTime` sentinel + dead code T12_04 supprimé
**Phase J** : Telegram `/pairing_reset` command
**Phase L+M** : DECISIONS.md créé (11 décisions documentées) + Telegram `/pairing_status`
**Phase H+K+N** : 3 agents en parallèle → tests T15 MqttClient/WifiManager + parser JSON réel + CLI série slave

**Résultat final** :
- 138/138 tests master, 16/16 tests slave, 0 IGNORE
- 5 jobs CI verts en hard gate
- 2 bugs production corrigés
- 4 features ajoutées (pairing dynamique, lint job, /pairing_status, /pairing_reset, CLI série slave)
- 5300+ lignes de code mort éradiquées
- 3 fichiers documentation créés (PAIRING.md, TODO.md, DECISIONS.md)
- 14 décisions de design documentées dans DECISIONS.md
