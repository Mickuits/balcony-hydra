# TODO — Balcony Hydra v4

> Dernière MAJ : 2026-04-08

## État du sprint

**CI vert sur tous les jobs** ✅ — master + slave + tests natifs + protocol-check.
La session du 2026-04-07 a corrigé une dette technique massive accumulée depuis le commit `73233ea` (restructure v4) : 25 commits, déblocage complet du build slave qui n'avait jamais compilé.

## Sprint en cours

### Tests SIL natifs (Software-In-the-Loop)

- [x] Mock HAL `test/mocks/Arduino.h` (master + slave)
- [x] Mock stubs `TimeManager.h` et `PlantProfile.h` pour permettre la compilation native des modules réels
- [x] 91/91 tests master passent en natif via `pio test -e native`
- [x] 16/16 tests slave passent en natif
- [x] CI GitHub Actions hard gate sur les deux firmwares
- [ ] **Tests d'intégration natifs réels** : actuellement les 91 tests testent surtout les constantes et la logique pure. Étendre pour instancier les vrais `SafetyManager`, `PumpController` avec mocks injectés et vérifier les transitions d'état.
- [ ] **Couverture slave** : ajouter des tests qui instancient `DegradedMode`, `SensorManager` slave avec mocks.

### Dette technique identifiée

- [ ] **Restaurer `ConfigManager::fromJson()` master** — le bloc network est actuellement un no-op (commit `7a20ef5`). À ré-implémenter proprement avec `JsonObject n = doc["network"]` + `containsKey()` guards.
- [ ] **Implémenter `WebPortal::_handleApiProfiles` / `_handleApiProfileUpdate` / `_handleApiAutonomy`** — actuellement des stubs HTTP 501 (commit `d274956`). Les routes existent dans `_setupRoutes()` et le UI les attend.
- [x] **MAC ESP-NOW pairing** — Pairing dynamique au premier boot implémenté (2026-04-08). NVS namespace `espnow` clé `peerMac`. Voir `docs/PAIRING.md`. Validation comportementale sur hardware requise.
- [ ] **PIN_PUMP_B = 27 vs 15** — incohérence avec `config_v3_ref.h` non documentée. Valider physiquement avant flash hardware.
- [ ] **Code v3 résiduel** à supprimer : `firmware/lib/`, `firmware/src/`, `firmware/include/config.h`, `firmware/platformio.ini` (racine).
- [ ] **`build_flags_tft`** dans `master/platformio.ini` ligne 34 — option ignorée par PlatformIO (warning à chaque build). Soit renommer en `[env:master_with_tft]` soit retirer.
- [ ] **Calibration individuelle par capteur d'humidité** (NVS par index) — déjà dans le TODO de CLAUDE.md.
- [ ] **Historique local** (buffer circulaire RTC mem ou SPIFFS).
- [ ] **Watchdog par tâche FreeRTOS** (pas seulement global).

### Améliorations CI/CD

- [ ] Mettre à jour `actions/checkout@v4` → v5 (warning Node.js 20 deprecated).
- [ ] Pin la version PlatformIO dans le workflow (`pip install platformio==X.Y.Z`).
- [ ] Cache PlatformIO entre runs (déjà partiellement fait via `actions/cache`).
- [ ] Ajout d'un job `pio check` (cppcheck/clang-tidy) en `continue-on-error` pour démarrer la culture lint.
- [ ] Upload artifacts `.bin` sur builds de `main` pour debug futur.

### Hardware (pas dans le scope CI)

- [ ] Conception PCB custom (KiCad) pour remplacer le breakout board.
- [ ] Impression 3D boîtier sur mesure (Bambu Lab P2S).
- [ ] Ajout buzzer piezo pour alarme locale.

### Infrastructure

- [ ] Setup Grafana Cloud + InfluxDB pour dashboard historique.
- [ ] Docker compose pour broker MQTT local (Mosquitto).

## Bugs ouverts

Aucun bug bloquant. Tous les bugs préexistants découverts pendant la session 2026-04-07 ont été corrigés.

## Sessions récentes

### 2026-04-08 — Pairing dynamique ESP-NOW au premier boot

**Objectif** : remplacer les MACs hardcodés `0xFF:FF:FF:FF:FF:FF` par un mécanisme
de découverte automatique persisté en NVS.

**Résultats** :
- `Protocol.h` : +3 types (CMD_PAIRING_REQ/CONFIRM, DATA_PAIRING_ACK), +3 structs,
  +enum DeviceType, `typeName()` mis à jour, 3 static_assert ajoutés.
- `EspNowMaster` : `begin()` sans param, charge NVS, mode pairing si absent,
  `resetPairing()`, `_handlePairingAck()` avec save NVS + switch peer.
- `EspNowSlave` : idem symétrique, `_handlePairingReq()`.
- `master/src/main.cpp` + `slave/src/main.cpp` : appel `espNow.begin()` sans param.
- 5 tests SIL Catégorie 14 (packing Protocol), total 107 tests natifs master.
- `docs/PAIRING.md` créé.

### 2026-04-07 — Déblocage complet du build CI (25 commits)

**Objectif** : tester les agents Claude sur le projet, corriger les modules SIL natifs cassés (commit WIP `dbe5410`), faire passer le CI au vert.

**Résultats** :
- 25 commits sur main, CI 100% vert (master + slave + tests + protocol-check)
- Découverte que le firmware slave n'avait JAMAIS compilé pour ESP32 depuis `73233ea`
- 5 modules SIL réparés côté master (ConfigManager, SafetyManager, SensorManager, mocks, lib_extra_dirs)
- 1 firmware slave entièrement réparé (ConfigManager.h créé, redéfinitions constexpr nettoyées, includes relatifs corrigés, dépendances TimeManager/PlantProfile retirées du PumpController slave)
- 2 lib registry references cassées corrigées (Telegram Bot, XPT2046 → pin via GitHub tags)
- 91/91 tests natifs master + 16/16 tests natifs slave

**Agents utilisés** :
- `feature-dev:code-explorer` (audit migration v3→v4, READ-ONLY)
- `eng-firmware-embedded` × 2 en mode worktree (fix SIL master + fix slave complet)
- `eng-devops-ci` (proposition workflow CI v2)
