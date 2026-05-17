# Inventaire complet — mobile/balcony-hydra-mobile.html

> Output VAGUE 1.A du refactor — produit par agent code-explorer 2026-05-18
> Source analysée : `mobile/balcony-hydra-mobile.html` (~6238 lignes, single-file HTML+CSS+JS)

---

## 1. Objets globaux JS — structure et rôle

### CONFIG (ligne 3839)
Objet plain, config utilisateur persistable. Sous-objets : `location` (city, postal, lat, lng), `system` (masterIp, masterId, fwVersion, fwBuild, mqttBroker, wifiSsid), `thresholds` (tankWarn:30%, tankCrit:15%, potDryDefault:28, potOkDefault:52), `vacation` (startDate, endDate, safetyMargin, notificationsEnabled), `watering` (mode:'AUTO'|'SCHEDULED'|'MANUAL', auto:{moistureMinPct, moistureMaxPct, cooldownH, maxCyclesPerDay}, scheduled:{slot1, slot2}).

### HARDWARE (ligne 3884)
Source de vérité unique de l'état live ESP32. Sous-objets :
- `master` : online, uptime, lastSync, ramUsed, ramTotal, flashUsed, flashTotal, mqttRtt, powerVolt, wanLatency, wanLoss, zone:'B', avgHum, pumpRunning
- `slaves['SLAVE']` : online, rssi, voltage, lastSeq, zone:'A', avgHum, pumpRunning
- `ups` : charge, voltage, runtimeRemain
- `pairing` : status ('PAIRED'|'UNPAIRED'|'PAIRING'), masterMac, slaveMac, lastSeq, rssi, lastPingMs, pairedSince, magicByte
- `safety` : state ('NORMAL'|'THERMAL_LOCKOUT'|'HARD_LOCKOUT'|'SAFE_MODE'), reason, sinceLockoutS, tempPcb, bootCrashCount, thermalCoolingRemainS, relayArmed, pumpEnabled
- `pots` : dict P01–P20, chaque entrée = {controller:'MASTER'|'SLAVE', muxChannel:0-9, hum, tempSoil, ec, lastWater, profileId, name, species, nameShort, zone:'balcon'|'interieur', state:'crit'|'dry'|'ok'|'high'|'watering'|'off', vol}
- `tanks` : dict T01–T02, chaque entrée = {controller, name, cap, vol, lastFill, cycles, sensorOk, distSensor, distFull, sigmaMm, driftPct, calibAge}

### PROFILES (ligne 3967)
Dict de 4 profils hydriques. Clés : 'HERB_MED', 'FRUIT_DEMANDING', 'SUCCULENT_DRY', 'LEAFY_GREENS'. Chaque entrée = {name, label, dry, ok, vol, cooldown, potCount, k (coefficient humidité/ml)}.

### WEATHER_FORECAST (ligne 3975)
Tableau de 14 entrées {tmax, tmin, precip, et0}. Données statiques mock.

### STATS (ligne 3994)
Statistiques historiques calculées. Champs : baseConsoLpd, baseConsoS01 (zone A), baseConsoS02 (zone B), baseTempReference, baseEt0Reference, std7d, std30d, totalEvents7d, totalSkipped7d, totalLiters7d, alertsLast7d, potRanking7d (tableau [{id, liters}×5]).

### STATS_PERIOD (ligne 4080)
Dict de 4 périodes : '24h', '7d', '30d', 'season'. Chaque entrée = {label, short, days, factor (multiplicateur vs baseline 7j), consoTitle}.

### POT_DB (ligne 4018)
`Proxy` sur `HARDWARE.pots`. Ajoute champs dérivés à chaque accès : profile, slave/slaveId (alias controller), gpio/muxChannel (alias muxChannel), dry, ok (depuis PROFILES), temp (alias tempSoil), coef (hardcodé '0.85×'), last (appel `fmtDuration(lastWater)`), zone (label français). Implémente `ownKeys`, `has`, `getOwnPropertyDescriptor` pour l'énumération.

### TANK_DB (ligne 4044)
`Proxy` sur `HARDWARE.tanks`. Ajoute à chaque accès : slave/slaveId (alias controller), pct (vol/cap×100), status ('ok'|'warn'|'crit'), statusLabel, conso24, avg7, autonomy (vol/dailyConso), lastFill (appel `fmtDuration`), zone (label avec nombre de pots).

### BINDINGS (ligne 4187)
Dict de 38 paires clé→fonction getter. Clés groupées : `sys.*` (18 entrées), `pots.*` (9 entrées), `slaves.*` (1 entrée), `tanks.*` (4 entrées), `stats.*` (7 entrées), `statsPeriod.*` (4 entrées), `alerts.*` (1 entrée), `watering.*` (1 entrée). Consommé par `renderBindings()` via `querySelectorAll('[data-bind]')`.

### LIVE_LOG (ligne 4624)
Tableau circulaire max 12 entrées. Chaque entrée = {time, tag, msg}. Alimenté par `pushLogEvent()`. Rendu par `renderLiveLog()`.

### SAFETY_PRESETS (ligne 4691)
Dict de 4 états SafetyManager : NORMAL, THERMAL_LOCKOUT, HARD_LOCKOUT, SAFE_MODE. Chaque entrée = {label, badge, color, reason, icon, showCooling, showUnlock, relay, relayColor}.

### Variables UI state (lignes 4075–4076)
- `currentPotFilter` : `'all'`
- `currentStatsPeriod` : `'7d'`

### Variables wizard pairing (lignes 4982–4984)
- `_pairingStep`, `_pairingScanInterval`, `_pairingScanStartTs`

### HUM_PER_ML (ligne 5439) et PUMP_FLOW_RATE (ligne 5445)
**DUPLIQUE** les champs `k` de PROFILES. PUMP_FLOW_RATE = 25 ml/s.

### currentWaterPot (ligne 5447)
`'P07'` — pot sélectionné dans la modale d'arrosage manuel.

### MQTT_BRIDGE_STATE (ligne 5781)
Enum objet : `{MOCK, CONNECTING, CONNECTED, ERROR}`.

### mqttBridge (ligne 5783)
Service MQTT. FSM : MOCK → CONNECTING → CONNECTED ↔ ERROR (backoff 2s→30s).

### REST_STATE (ligne 6046)
Enum objet : `{MOCK, READY, ERROR, UNAUTHORIZED}`.

### restClient (ligne 6048)
Service REST. FSM : MOCK → READY / ERROR / UNAUTHORIZED.

---

## 2. Fonctions JS — classées par responsabilité

### 2.1 Rendu (read-only sur HARDWARE)

| Fonction | Ligne | Description |
|---|---|---|
| `renderBindings(scope)` | 4257 | Parcourt `[data-bind]`, appelle BINDINGS[key]() |
| `render()` | 4269 | Master render |
| `renderDashboardAlerts()` | 4286 | Alerte P07 + alerte T02 |
| `renderDashboardZones()` | 4340 | Barres progression balcon/intérieur |
| `renderAlertsBreakdown()` | 4376 | Compte alertes par type |
| `renderPotsGrid(filter)` | 4392 | Grid pots avec filtre |
| `renderTanksList()` | 4422 | Liste tanks + CTA refill + tankConfig |
| `renderTopology()` | 4529 | Topologie master/slave ESP-NOW |
| `renderSlavePower()` | 4583 | Ligne tension slave |
| `renderRanking()` | 4598 | Top consommateurs depuis STATS.potRanking7d × factor période |
| `renderLiveLog()` | 4640 | Log lines depuis LIVE_LOG |
| `renderWanBars()` | 4649 | Barres WAN/RAM/MQTT/SSID |
| `renderSafety()` | 4734 | Écran safety depuis HARDWARE.safety + SAFETY_PRESETS |
| `renderPairing()` | 4914 | État pairing (paired/unpaired view) |

### 2.2 Mutations d'état

| Fonction | Ligne | Description |
|---|---|---|
| `setSafetyState(state)` | 4814 | Écrit HARDWARE.safety.*, appelle renderSafety() |
| `confirmSafetyUnlock()` | 4836 | async — REST live ou mock → setSafetyState('NORMAL') |
| `confirmWaterAll()` | 4862 | async — REST live ou mock → HARDWARE.pots[*].state |
| `confirmRemoteReboot()` | 4891 | async — REST live → restClient.state mutation directe |
| `confirmPairingReset()` | 4964 | HARDWARE.pairing = UNPAIRED |
| `finishPairingWizard()` | 5049 | HARDWARE.pairing = PAIRED |
| `setStatsPeriod(period)` | 5066 | currentStatsPeriod, re-render |
| `setWateringMode(mode)` | 5092 | CONFIG.watering.mode |
| `simulatePairingPing()` | 4953 | Mute HARDWARE.pairing |
| `startLiveUpdates()` | 5106 | setInterval 3s — tick principal |
| `updateVacationProjection()` | 5272 | DOM direct, pas de state |

### 2.3 Services (MQTT + REST)

`mqttBridge` — init, connectFromUI, connect, disconnect, isLive, _ensureLibLoaded, _dispatch, _scheduleRetry, _renderUI.
`restClient` — init, testFromUI, testSilently, disableLive, pumpStart, pumpStop, pumpReset, safetyUnlock, reboot, factoryReset, getStatus, updateConfig, _request, _renderUI.

### 2.4 Handlers UI

| Fonction | Ligne |
|---|---|
| `switchScreen(id)` | 5665 |
| `openModal(id)` | 5697 |
| `closeModal()` | 5698 |
| `openPotDetail(id)` | 5590 |
| `openTankDetail(tankId)` | 5373 |
| `openWaterModal(potId)` | 5449 |
| `selectWaterVolume(vol)` | 5563 |
| `recomputeProjection(volume)` | 5495 |
| `updateThresholdBar(p)` | 5487 |
| `applyPotFilter(filter)` | 5640 |
| `goToPotsWithFilter(filter)` | 5655 |
| `wizardStep(n)` | 5714 |
| `finalizeAdd()` | 5730 |
| `selChip(el)`, `selChipSingle(el)` | 5735, 5740 |
| `_setPairingStep(step)` | 4986 |
| `cancelPairingWizard()` | 4998 |
| `startPairingScan()` | 5004 |
| `finishPairingWizard()` | 5049 |

### 2.5 Utilitaires purs

| Fonction | Ligne | Description |
|---|---|---|
| `getPotsForController(id)` | 4090 | Filtre par controller |
| `getPotsForZone(zone)` | 4102 | Filtre par zone physique |
| `getPotsByZone(zone)` | 4108 | **DOUBLON** de getPotsForZone |
| `getActivePots()` | 4114 | state !== 'off' |
| `getAlertPots()` | 4120 | state in ['crit','dry','off'] |
| `getOnlinePots()` | 4126 | entries |
| `getOfflinePots()` | 4131 | entries |
| `avgHumidity()` | 4134 | Moyenne globale |
| `avgHumidityZone(zone)` | 4140 | Moyenne zone |
| `totalSlavesOnline()` | 4152 | {online, total} |
| `countAlerts()` | 4160 | Somme alertes |
| **`fmtDuration` v1** | 4168 | `'—'` pour 0, `'Xj Yh'`/`'Xh YYm'`/`'Xm'` |
| **`fmtDuration` v2 (OVERRIDE)** | 4806 | `'Xs'` pour <60, `'Xmin YYs'`/`'Xh YYmin'` |
| `fmtUptime(seconds)` | 4178 | `'Xd HH:MM'` |
| `fmtMacShort(mac)` | 4912 | Uppercase ou `'—'` |
| `pushLogEvent(tag, msg)` | 4626 | LIVE_LOG (max 12) |
| `computeWeatherCoefficient(forecast)` | 5215 | FAO Penman-Monteith simplifié |

### 2.6 Séquence de boot (DOUBLE BOOT — BUG)

Lignes 6210–6222 : `DOMContentLoaded` ET `if(readyState !== 'loading')` appellent tous les deux `render()`, `startLiveUpdates()`, `mqttBridge.init()`, `restClient.init()`. **Double init → 2 setInterval en parallèle.**

---

## 3. Inventaire des écrans (16 screens)

| id | Nav | Rôle | Source |
|---|---|---|---|
| `dashboard` | dashboard | KPIs, alertes, zones, graph | BINDINGS, renderDashboard* |
| `pots` | pots | Grid 20 pots filtrable | renderPotsGrid, HARDWARE.pots |
| `detail` | pots | Détail pot SVG | openPotDetail → DOM direct |
| `configurator` | pots | Hub config | Statique |
| `addPot` | pots | Wizard 5 étapes | wizardStep, finalizeAdd |
| `editPot` | pots | Wizard édition (STUB navigation) | Statique |
| `tanks` | tanks | Liste réservoirs | renderTanksList |
| `tankDetail` | tanks | Détail réservoir | openTankDetail → DOM direct |
| `tankConfig` | tanks | Hub config réservoirs | Statique |
| `addTank` | tanks | Wizard 4 étapes (STUB navigation) | Statique |
| `stats` | stats | Conso, ranking, periods | renderRanking, BINDINGS statsPeriod.*, setStatsPeriod |
| `system` | system | Uptime, MQTT/REST cards, topology | renderTopology, renderSlavePower, renderWanBars |
| `addPairing` | system | Wizard 3 étapes | _setPairingStep, startPairingScan, finishPairingWizard |
| `safety` | system | SafetyManager 4 états | renderSafety, SAFETY_PRESETS |
| `vacation` | stats | Projection vacances | updateVacationProjection, computeWeatherCoefficient |
| `profiles` | pots | **STATIQUE** — pas de renderProfiles() | Aucune |

---

## 4. Inventaire modales (14 modales)

| id | Déclencheur | Action |
|---|---|---|
| `waterAll` | btn ARROSER TOUT | confirmWaterAll |
| `waterPot` | openWaterModal(potId) | Partiel |
| `refill` | renderTanksList CTA | STUB |
| `tankCalib` | tankConfig | STUB |
| `potCreated` | finalizeAdd étape 5 | closeModal + switchScreen('pots') |
| `unlock` | bouton unlock safety | confirmSafetyUnlock |
| `pairingReset` | bouton reset pairing | confirmPairingReset |
| `reboot` | écran system | confirmRemoteReboot |
| `factoryReset` | écran system | STUB |
| `deleteZone` | configurator | STUB |
| `editPotModal` | non câblé | STUB |
| `addNotif` | static | STUB |
| `calibSensor` | tankConfig | STUB |
| `schedConfig` | watering SCHEDULED | STUB |

---

## 5. Inventaire wizards

### addPot (5 étapes) — fonctionnel
Stepper `#wizardSteps`. Navigation via `wizardStep(n)`.
1. Zone physique (chips)
2. Pin/canal MUX (.pin-grid)
3. Profil + nom/espèce
4. Volume + calibration capteur
5. Récapitulatif → finalizeAdd → openModal('potCreated')

### addTank (4 étapes) — STUB
HTML présent, navigation cassée (wizardStep pointe sur #addPot).

### addPairing (3 étapes) — fonctionnel
Stepper `#pairingSteps`. Navigation via `_setPairingStep(step)`.
1. Pré-requis + bouton Démarrer scan → startPairingScan
2. Log temps réel (setInterval 800ms) → auto-avance étape 3 à T+2.4s
3. Confirmation MAC slave → finishPairingWizard

### editPot, tankEdit
Stubs — HTML présent, logique absente.

---

## 6. Dépendances inter-modules

```
HARDWARE ←── startLiveUpdates (mutation /3s)
HARDWARE ←── mqttBridge._dispatch (mutation MQTT live)
HARDWARE ←── confirmWaterAll, confirmPairingReset, finishPairingWizard, setSafetyState
HARDWARE ──→ POT_DB (Proxy lecture)
HARDWARE ──→ TANK_DB (Proxy lecture)
HARDWARE ──→ tous les renderXxx

CONFIG ←── setWateringMode
CONFIG ──→ BINDINGS, TANK_DB, renderDashboardAlerts

PROFILES ──→ POT_DB (dry, ok)
PROFILES ──→ startLiveUpdates (seuils recalculés)
HUM_PER_ML (DOUBLON de PROFILES.k) ──→ recomputeProjection

STATS ──→ BINDINGS, TANK_DB, renderTanksList, renderRanking
STATS_PERIOD ──→ renderRanking, setStatsPeriod, BINDINGS statsPeriod.*

LIVE_LOG ←── pushLogEvent
LIVE_LOG ──→ renderLiveLog

SAFETY_PRESETS ──→ renderSafety, setSafetyState

mqttBridge ──→ HARDWARE (via _dispatch)
mqttBridge.isLive() ──→ startLiveUpdates (suspend simulation)
restClient.isLive() ──→ confirmSafetyUnlock, confirmWaterAll, confirmRemoteReboot

currentWaterPot ←── openWaterModal, openPotDetail
currentPotFilter ←── applyPotFilter
currentStatsPeriod ←── setStatsPeriod
```

---

## 7. Couplages problématiques (BUGS À FIXER PENDANT LE REFACTOR)

### 7.1 fmtDuration déclarée 2 fois — BUG SILENCIEUX
- v1 ligne 4168 (overrided)
- v2 ligne 4806 (effective)
- Décision refactor : 2 fonctions nommées distinctement (`fmtDurationHuman`, `fmtDurationShort`).

### 7.2 Double boot — BUG
DOMContentLoaded + readyState immédiat → 2 setInterval. Décision : unique entrée `main()`.

### 7.3 Mutation directe restClient.state
Ligne 4898 hors `_setState()`. Décision : exposer `_setState` ou ajouter méthode publique `markAsRebooting()`.

### 7.4 getPotsForZone vs getPotsByZone — DOUBLON
Décision : unifier en `getPotsByZone`.

### 7.5 renderTanksList CTA dupliqués
Inject CTAs à la fin de innerHTML alors qu'ils existent en HTML statique → doublon après 1er render. Décision : retirer les CTAs du innerHTML inject.

### 7.6 HUM_PER_ML duplique PROFILES.k
Décision : remplacer HUM_PER_ML par référence directe `PROFILES[profileId].k`.

### 7.7 BINDINGS string-based — pas de typage
Décision TypeScript strict : type literal union des clés.

### 7.8 currentWaterPot muté par 2 fonctions
openWaterModal + openPotDetail. Décision : un seul state owner (uiStore.selectedPot).

### 7.9 Proxy POT_DB/TANK_DB difficile à typer en TS strict
Décision : remplacer par fonctions `getPotViewModel(id)` / `getTankViewModel(id)`.

### 7.10 Liste détaillée pots hardcodée HTML
Décision : générer dynamiquement depuis HARDWARE.pots.

### 7.11 switchScreen mapping hardcodé
Décision : ajouter `navId` propriété sur chaque screen via Router pattern.

---

## 8. CSS — sections (~781 lignes total)

| Section | Lignes | Volume |
|---|---|---|
| Reset + variables CSS | 19–60 | 40 |
| Body + app shell | 60–90 | 30 |
| Header | 90–115 | 25 |
| Bottom nav | 115–155 | 40 |
| KPI grid | 155–200 | 45 |
| Zones | 200–250 | 50 |
| Pots grid | 250–340 | 90 |
| Pot detail | 340–380 | 40 |
| Tanks | 380–470 | 90 |
| Alerts | 470–500 | 30 |
| Stats | 500–540 | 40 |
| Topology | 540–580 | 40 |
| Safety | 580–615 | 35 |
| Pairing | 615–635 | 20 |
| Wizard | 635–670 | 35 |
| Modals | 670–720 | 50 |
| Buttons | 720–745 | 25 |
| MQTT banner | 745–760 | 15 |
| Config + refill CTA | 760–780 | 20 |
| Misc + log | 780–800 | 20 |

9 `@keyframes` : pulse, blink, spin, fadeIn, slideUp, breathe, waterFlow, chargeAnim, scanLine.
Pas de `@media queries`. Tout dans `:root`.

---

## 9. Points de risque pour le refactor

- **R1 — fmtDuration** : unifier avant split
- **R2 — Double boot** : remplacer par `main()` unique
- **R3 — BINDINGS** : typage strict (literal union)
- **R4 — HARDWARE mutable** : store réactif ou setter centralisé
- **R5 — Proxy POT_DB/TANK_DB** : remplacer par view models
- **R6 — renderXxx couplé au DOM** : impossible à tester sans jsdom
- **R7 — Écrans statiques** (profiles, sections pots, configurator) : connecter aux données ou laisser stub explicite
- **R8 — Wizards partiels** : addTank, editPot — créer composant wizard générique
- **R9 — CSS sans modules** : mapping classes → composants nécessaire
- **R10 — startLiveUpdates → mqttBridge.isLive()** : ordre de chargement
- **R11 — sw.js** : à porter en src/sw.ts ou utiliser vite-plugin-pwa
