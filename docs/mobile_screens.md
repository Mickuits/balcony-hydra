# Mobile Screens — Storyboard Balcony Hydra v4

> Storyboard des **16 écrans** du prototype mobile, avec flux navigation, états, et mapping vers les bindings/render functions du JS.
>
> **Source** : `mobile/balcony-hydra-mobile.html` (~5 600 lignes).
> Dernière MAJ : 2026-05-18.

## Vue d'ensemble

```
                        ┌─── BOTTOM NAV (5 entrées) ───┐
                        │ DASH · POTS · TANKS · STATS · SYS │
                        └──────────────────────────────────┘

  TOP-LEVEL                INTERMÉDIAIRE              WIZARDS / DÉTAILS
  ─────────                ─────────────              ─────────────────
  dashboard ───────────► (modaux)
  pots ──────────► detail
                  configurator ──┬──► addPot
                                 └──► editPot
                  profiles
  tanks ─────────► tankDetail ──► tankEdit
                   tankConfig ───► addTank
                   vacation
  stats
  system ────────► addPairing
                   (modaux remote*)
```

5 wizards (`addPot`, `editPot`, `addTank`, `tankEdit`, `addPairing`) + 14 modaux (waterPot, waterAll, remotePing, remoteResync, remoteOta, remoteReboot, remoteWifi, remotePause, vacationActivate, refill, deletePot, potCreated, safetyUnlock, pairingReset).

---

## 1 · DASHBOARD (entrée par défaut)

**ID** : `dashboard` · **Nav** : `DASH` · **Ligne HTML** : 800

### Rôle
Vue mission-critical : santé système + alertes ouvertes + zones humidité + sparkline 24 h. C'est l'écran de "réveil le matin, tout va bien ?".

### Contenu
| Section | Source data | Render fn |
|---|---|---|
| Header (slaves online + last sync) | `HARDWARE.master`, `HARDWARE.slaves` | `renderBindings` (`slaves.onlineFraction`, `sys.lastSync`) |
| Alertes ouvertes (1-3 cards) | `countAlerts()` | `renderDashboardAlerts` (4195) |
| Cards zones A/B (humidité moy + état pompe) | `HARDWARE.pots` filtrés par `controller` | `renderDashboardZones` (4249) |
| KPIs (eau 7j, cycles, alertes) | `STATS` | `renderBindings` |
| Mini sparkline humidité 24 h | SVG inline statique | (mock pur) |

### Actions
- Tap "STATS →" sur graph 24 h → `switchScreen('stats')`
- Tap card alerte → ouvre détail (modale `refill` / `deletePot` selon type)

### États possibles
- **Healthy** (vert) : 0 alerte, toutes les zones OK
- **Warning** (orange) : 1+ alerte non-critique (tank bas)
- **Critical** (rouge) : tank critique OU safety lockout

---

## 2 · POTS GRID

**ID** : `pots` · **Nav** : `POTS` · **Ligne HTML** : 910

### Rôle
Visualiser les 20 pots en grille filtrable + actions groupées + liste alertes par pot.

### Contenu
| Section | Source | Render fn |
|---|---|---|
| Filter tabs (all / dry / crit / watering) | `currentPotFilter` | `renderPotsGrid` (4301) |
| Grid 5 colonnes × 4 lignes, 20 pots | `HARDWARE.pots` | `renderPotsGrid` |
| CTA "Arroser tout" | — | modal `waterAll` |
| CTA "Add Pot" → configurator | — | `switchScreen('configurator')` |

### États pot (visuel)
6 états affichés par couleur de tile :
- `ok` (vert) — humidité dans la plage cible
- `high` (vert clair) — récemment arrosé, humide
- `dry` (orange) — sous seuil ok
- `crit` (rouge) — sous seuil dry, doit arroser
- `watering` (cyan animé) — en cours
- `off` (gris) — désactivé

### Actions
- Tap pot → `switchScreen('detail')` (passe l'ID via state global)
- Tap filter chip → `setPotFilter('crit')` (ou autre)
- Tap "Arroser tout" → modal `waterAll`

---

## 3 · POT DETAIL

**ID** : `detail` · **Origine nav** : `pots` (tap pot) · **Ligne HTML** : 983

### Rôle
Fiche complète d'un pot : gauge humidité, métriques sol, historique 7 j, actions individuelles.

### Contenu
- Header : nom pot + espèce + zone
- Gauge humidité (% actuel vs seuils dry/ok)
- 4 KPIs : T° sol, EC, dernier arrosage, volume eau cumulé
- Graph humidité 7 j (SVG)
- Journal 48 h (events)
- Boutons : Arroser maintenant, Skip cycle, Editer (→ `editPot`), Supprimer

### Actions
- "Arroser" → modal `waterPot`
- "Editer" → `switchScreen('editPot')`
- "Supprimer" → modal `deletePot`

---

## 4 · STATS / ANALYTICS

**ID** : `stats` · **Nav** : `STATS` · **Ligne HTML** : 1098

### Rôle
Analytics : conso eau, ranking pots, heatmap, breakdown alertes.

### Contenu
| Section | Période | Source |
|---|---|---|
| Period tabs (24H / 7J / 30J / SAISON) | `currentStatsPeriod` | `setStatsPeriod()` |
| 4 KPIs scalés selon période | `STATS_PERIOD[period].factor` | `BINDINGS['statsPeriod.*']` |
| Conso eau bar chart (SVG en dur 7j) | — | mock SVG |
| Ranking TOP CONSO (sorted desc) | `STATS.potRanking7d × factor` | `renderRanking` (4507) |
| Heatmap 7×24 humidité | — | mock SVG |
| Breakdown alertes | `STATS.alertsBreakdown` | `renderAlertsBreakdown` (4285) |

### Limitations connues (mocks)
- Bar chart "Volume par jour" et heatmap 7×24 **restent sur 7d** quelle que soit la période sélectionnée (SVG hardcodé). Refonte data layer nécessaire pour vraiment scaler.

---

## 5 · PROFILES

**ID** : `profiles` · **Origine** : flux `pots` (pas dans la bottom nav) · **Ligne HTML** : 1237

### Rôle
Visualiser et éditer les 4 plant profiles (HERB_MED, FRUIT_DEMANDING, SUCCULENT_DRY, LEAFY_GREENS) + calendrier saisonnier.

### Contenu
- Tabs profil × 4
- Sliders : seuil dry, seuil ok, volume cycle, cooldown
- Courbe saisonnière (12 mois) × coefficient saisonnier
- Liste pots du profil sélectionné

---

## 6 · SYSTEM ⭐

**ID** : `system` · **Nav** : `SYS` · **Ligne HTML** : 1444

### Rôle
**Écran mission-critical pour ops à distance**. Toute la santé système + safety + pairing + connectivité + remote actions.

### Sections (ordre vertical)
1. **SAFETY MANAGER** (top, mission-critical) — 4 états, T° PCB, relay armé, boot crash, cooling timer animé, unlock modal
2. **Dev sim** (`SIM → NORMAL / THERMAL / HARD / SAFE_MODE`) pour tester les états
3. **PAIRING ESP-NOW** — MAC master/slave, RSSI, seq#, ping RTT, paired since, btn Ping + btn Reset Pairing
4. **WAN status** — primaire/fallback/last outage/uptime 30j
5. **Contrôle à distance** — grid 6 buttons (Ping All, Re-sync ESP-NOW, OTA, Reboot soft, Reset WiFi, Pause système)
6. **Alimentation** — Master secteur, slaves (USB ou batterie), UPS
7. **Topology** — diagram master + lien + slave avec RSSI bars
8. **KPIs sys** — uptime, MQTT RTT, RAM, Flash log

### Render fns
| Fn | Section |
|---|---|
| `renderSafety` (4643) | SafetyManager (T° / relay / cooling / unlock) |
| `renderPairing` (4755) | Pairing card (paired / unpaired views) |
| `renderTopology` (4438) | Diagram master + slaves |
| `renderSlavePower` (4492) | Lignes alim slaves |
| `renderWanBars` (4558) | WAN signal bars (●●●○) |
| `renderLiveLog` (4549) | Live MQTT log (24 last events) |

### Actions
- `openModal('remote*')` × 6 — remote ops
- `setSafetyState(state)` — dev sim
- `simulatePairingPing()` — incrémente seq + jitter RSSI + log
- `openModal('safetyUnlock')` / `openModal('pairingReset')` — actions critiques
- `switchScreen('addPairing')` — depuis état UNPAIRED

---

## 7 · TANKS

**ID** : `tanks` · **Nav** : `TANKS` · **Ligne HTML** : 1833

### Rôle
Cartes réservoirs (zone A balcon 50L + zone B intérieur 25L) + planificateur vacances + graph conso 14j.

### Contenu
- 2 cards tank (viz cuve liquide animée + gauge % + KPIs mini)
- CTA "Mode vacances" → `switchScreen('vacation')`
- Graph conso eau 14j
- CTA "Configurer" → `switchScreen('tankConfig')`

### Actions
- Tap tank card → `switchScreen('tankDetail')`
- "Remplir" → modal `refill`

---

## 8 · TANK DETAIL

**ID** : `tankDetail` · **Origine** : `tanks` ou `tankConfig` · **Ligne HTML** : 2097

### Rôle
Fiche réservoir : viz cuve, KPIs, niveau historique 14j, calibration capteur US.

### Contenu
- Header : nom tank + zone + capacité
- Viz cuve animée 3D-like (SVG)
- KPIs : niveau %, volume L, cycles depuis remplissage, σ capteur, drift 21j
- Graph niveau 14j
- Actions : Recalibrer, Test capteur, Modifier (→ `tankEdit`), Refill (modal)

---

## 9 · TANK CONFIG

**ID** : `tankConfig` · **Origine** : `tanks` · **Ligne HTML** : 2270

### Rôle
Liste éditable des 2 réservoirs + bouton ajouter tank.

### Actions
- Tap row tank → `switchScreen('tankEdit')`
- CTA "Ajouter" → `switchScreen('addTank')`

---

## 10 · ADD TANK (wizard 4 étapes)

**ID** : `addTank` · **Origine** : `tankConfig` · **Ligne HTML** : 2352

### Étapes (affichage stepper)
1. Type de cuve (chip-grid : cylindrique / rectangulaire / conique / irrégulière)
2. Identité + capacité (nom, litres, hauteur intérieure, zone A/B)
3. Capteur niveau (US JSN-SR04T config, calibration)
4. Review + create

---

## 11 · TANK EDIT

**ID** : `tankEdit` · **Origine** : `tankConfig` (tap row) · **Ligne HTML** : 2432

### Sections
- Identité & capacité (éditables)
- Hardware (controller, GPIO US, pompe = SLAVE GPIO 27 péristaltique 12V) — lecture seule
- Calibration capteur (distance vide/plein, σ, drift)
- Danger zone : Supprimer

---

## 12 · VACATION MODE

**ID** : `vacation` · **Origine** : `tanks` · **Ligne HTML** : 1965

### Rôle
Planificateur d'absence : dates, projection conso, marge sécurité, alerte si insuffisant.

### Contenu
- Date picker (start + jours)
- Coef météo (Méditerranée été)
- Projection : autonomie disponible, conso prévue, marge
- Recommandation textuelle
- Bouton "Activer" → modal `vacationActivate`

---

## 13 · CONFIGURATOR

**ID** : `configurator` · **Origine** : `pots` · **Ligne HTML** : 2496

### Rôle
Liste éditable des 20 slots pots (assignés / libres) groupée par zone.

### Contenu
- Header : "20 slots · 19 assignés · 1 libre"
- Section Zone A (10 slots, 10 assignés)
- Section Zone B (10 slots, 9 assignés, 1 libre)
- CTA "Ajouter pot" → `switchScreen('addPot')`

### Actions
- Tap pot row → `switchScreen('editPot')`
- CTA "Ajouter pot" → wizard

---

## 14 · ADD POT (wizard 5 étapes)

**ID** : `addPot` · **Origine** : `configurator` · **Ligne HTML** : 2648

### Étapes
1. **Identité** — nom + espèce (autocomplete depuis 50+ plantes)
2. **Profil hydrique** — sélection chip parmi 4 profils existants
3. **Hardware** — controller (Zone A SLAVE / Zone B MASTER) + canal MUX 0-9 (grid grisée pour canaux pris) + type capteur (capacitif/résistif/tensiometer/EC+T)
4. **Calibration** — point sec (ADC raw) + point immergé (ADC raw)
5. **Review** — récap final + bouton créer → modal `potCreated`

### Refactor v4
- Étape 3 utilise **canal MUX (0-9)** et **controller** (SLAVE/MASTER) au lieu de GPIO ADC + GPIO pompe (cf. firmware v4 architecture distribuée).
- Pompe : info statique "Péristaltique 12V partagée par zone" (pas de choix).

---

## 15 · EDIT POT

**ID** : `editPot` · **Origine** : `configurator` ou `detail` · **Ligne HTML** : 2971

### Sections
- Identité (nom, espèce)
- Profil hydrique (changement re-évalue cooldown + seuils)
- Hardware (lecture seule sauf canal MUX si reassignment)
- Calibration (re-launch wizard partiel)
- Danger zone : Supprimer pot

---

## 16 · ADD PAIRING (wizard 3 étapes) ⭐ NOUVEAU 2026-05-18

**ID** : `addPairing` · **Origine** : `system` (état UNPAIRED) · **Ligne HTML** : 3085

### Étapes
1. **Prérequis** — checklist (master allumé, slave allumé, même pièce, magic 0xBA isolé)
2. **Scan/Handshake** — animation pulse double + live log temps réel :
   - `[T+0s] [ESPNOW] mode pairing activé · broadcast 2Hz`
   - `[T+0.8s] CMD_PAIRING_REQ envoyé · seq=1`
   - `[T+1.6s] CMD_PAIRING_REQ envoyé · seq=2`
   - `[T+2.4s] DATA_PAIRING_ACK reçu · slave 24:6F:28:8B:33:E1`
   - `[T+2.4s] CMD_PAIRING_CONFIRM envoyé`
   - `[T+2.4s] NVS espnow:peerMac écrit (master + slave)`
3. **Confirmation** — résumé (MAC master, MAC slave, RSSI initial, durée handshake) + 3 lignes succès (NVS écrit master/slave/boots suivants directs) + bouton "Retour SYSTEM"

### Logic JS
| Fn | Rôle |
|---|---|
| `cancelPairingWizard()` | Reset à step 1, retour SYSTEM |
| `startPairingScan()` | Lance setInterval 800ms, simule séquence handshake en 3 ticks |
| `_setPairingStep(n)` | Switch wizard step + update stepper visual |
| `finishPairingWizard()` | Commit `HARDWARE.pairing.status='PAIRED'`, retour SYSTEM, render() |

### Animation CSS
```css
@keyframes pairingPulse {
  0%   { transform: scale(0.6); opacity: 1; }
  100% { transform: scale(2); opacity: 0; }
}
```
2 cercles avec `animation-delay: 0s` et `0.8s` pour effet de propagation continue.

---

## Bottom navigation

```
┌──────────────────────────────────────────────┐
│  DASH    POTS    TANKS    STATS    SYS       │
│  ●                                            │ ← active
└──────────────────────────────────────────────┘
```

### Mapping écrans → onglet actif (cf. `switchScreen`, ligne 4978)

| Écran courant | Onglet actif |
|---|---|
| `dashboard` | DASH |
| `pots`, `detail`, `configurator`, `addPot`, `editPot`, `profiles` | POTS |
| `tanks`, `tankDetail`, `tankConfig`, `addTank`, `tankEdit`, `vacation` | TANKS |
| `stats` | STATS |
| `system`, `addPairing` | SYS |

---

## State management

### Globals (top-level dans `<script>`)

| Global | Type | Source de vérité pour |
|---|---|---|
| `CONFIG` | object | Préférences utilisateur (à terme → POST /api/config) |
| `HARDWARE` | object | État runtime master + slave + safety + pairing |
| `PROFILES` | object | 4 plant profiles |
| `STATS` | object | Données analytics (computed from log history) |
| `LIVE_LOG` | array | 24 derniers events MQTT |
| `WEATHER_FORECAST` | array | 14 jours météo (à terme → API Météo France) |
| `currentPotFilter` | string | UI state filtre POTS |
| `currentStatsPeriod` | string | UI state filtre STATS |
| `_pairingStep` | number | UI state wizard pairing |

### Re-render strategy

Pattern : **mutation → render()**. La fonction `render()` (ligne 4173) est l'orchestrateur :
```js
function render(){
  renderBindings();
  renderDashboardAlerts();
  renderDashboardZones();
  renderAlertsBreakdown();
  renderPotsGrid();
  renderTanksList();
  renderTopology();
  renderSlavePower();
  renderRanking();
  renderSafety();
  renderPairing();
}
```
Appelée :
- Au boot (`DOMContentLoaded`)
- Toutes les 3 s par `startLiveUpdates` (ligne 4682)
- Après toute action utilisateur (setSafetyState, confirmPairingReset, finishPairingWizard, etc.)

### Bindings déclaratifs

Pattern : `data-bind="key.path"` sur l'élément DOM, résolu via `BINDINGS` (object map) dans `renderBindings`. Permet de découpler la structure HTML de la source de données :
```html
<span data-bind="sys.uptime">14d 06h</span>
```
```js
BINDINGS['sys.uptime'] = () => formatUptime(HARDWARE.master.uptime);
```

---

## Transitions / animations

| Animation | Durée | Effet |
|---|---|---|
| `slideUp` (modal) | 0.25 s | translateY(100%) → translateY(0) |
| `pairingPulse` | 1.6 s × ∞ | scale(0.6) → scale(2) + opacity fade |
| `setStatsPeriod` (tabs) | instant | toggle .active |
| `setSafetyState` (cards) | instant | swap label/color/icon |
| `renderPotsGrid` (filter) | instant | DOM rewrite des tiles |
| Cuve liquide tank | continu | shimmer CSS sur viz cuve |

Pas d'animations FLIP/morphing entre écrans — switchScreen utilise un simple `display:none/block` (scrollTop reset à 0).

---

## Phase 2 — Roadmap d'intégration (à venir)

À ce stade tous les écrans sont **mock-only**. Phase 2 = remplacer les mocks par des appels réels (cf. `docs/mobile_api_contract.md`) :

1. **Remplacer `startLiveUpdates()` mock** par un client MQTT (mqtt.js sur WebSocket) :
   - `sub hydra/sensors` → `updateSensors(payload)` → mute `HARDWARE.master.avgHum`, `HARDWARE.tanks[*].vol`
   - `sub hydra/pump` → `updatePumpState(payload)` → mute `HARDWARE.master.pumpRunning`, `HARDWARE.slaves['SLAVE'].pumpRunning`
   - `sub hydra/alerts` → snackbar transitoire + push notification (Phase 3)
2. **Brancher les actions UI sur REST** :
   - `confirmSafetyUnlock()` → `POST /api/safety/unlock`
   - `confirmPairingReset()` → (à exposer côté firmware ou via Telegram)
   - "Arroser tout" modal → `POST /api/pump/start`
   - Wizards "Save" → `POST /api/config`
3. **Auth** : token statique header `X-Hydra-Token` au boot (cf. API contract §4)
4. **Reconnexion MQTT** : exponential backoff + bandeau "déconnecté"
5. **Cache offline** : IndexedDB des derniers `/api/status` et `hydra/sensors` reçus → SW renvoie 503 si master down (déjà câblé dans `sw.js`)

---

## Phase 3 — PWA distribution (déjà setup 2026-05-18)

- ✅ `manifest.webmanifest` avec 2 icônes SVG + 3 shortcuts (Dash / Arroser / Système)
- ✅ `sw.js` cache-first shell + network-first API + offline fallback
- ✅ Meta tags Apple (`apple-mobile-web-app-capable`) et Android (`theme-color`)
- [ ] Push notifications via Web Push API (Phase 3.5 — exige master HTTPS + serveur tiers)
- [ ] Background sync pour retry des POST si offline au moment de l'action

Pour installer en standalone sur iPhone : Safari → "Add to Home Screen". Sur Android Chrome : install banner automatique au 2e visit.
