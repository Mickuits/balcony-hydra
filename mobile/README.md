# Mobile App — Balcony Hydra v4

> Prototype mobile haute fidélité (UI/UX). Mock autonome HTML/CSS/JS, zéro dépendance hors Google Fonts.

## Statut

**Prototype design** — pas encore connecté au firmware réel.
- 14 écrans complets, 5 wizards, ~30 modaux
- 4 834 lignes / ~243 KB, 100 % mobile-first
- Données simulées par boucle JS (`startLiveUpdates`, tick 3 s)
- Sert de **référence UX** pour la future app native ou PWA

## Comment l'ouvrir

```bash
# Double-clic sur le fichier
mobile/balcony-hydra-mobile.html

# Ou via dev server local
cd mobile && python -m http.server 8080
# puis ouvrir http://localhost:8080/balcony-hydra-mobile.html sur mobile
```

Inspecter le DOM = inspecter le state mock (objets globaux `HARDWARE`, `PROFILES`, `TANKS`, `POTS`).

## Écrans (14)

| Écran | Rôle | Navigation |
|---|---|---|
| `dashboard` | KPIs globaux + alertes + cartes zones + graph humidité 24 h | Bottom nav DASH (défaut) |
| `pots` | Grille 20 pots filtrable + actions groupées + liste alertes | Bottom nav POTS |
| `detail` | Fiche pot (gauge, métriques sol, journal 48 h, graph 7 j) | Tap pot |
| `tanks` | Cartes réservoirs + CTA vacances + graph conso 14 j | Bottom nav TANKS |
| `tankDetail` | Fiche réservoir (viz cuve, KPIs, niveau 14 j, calibration) | Tap tank |
| `tankConfig` | Liste éditable réservoirs + pompes | CTA tanks |
| `addTank` | Wizard 4 étapes ajout réservoir | CTA tankConfig |
| `tankEdit` | Édition (identité, hardware, calibration, danger zone) | Tap pot-row |
| `vacation` | Planificateur vacances (dates, coef météo, marge) | CTA tanks |
| `stats` | Analytics 24h/7j/30j/saison, heatmap, ranking top conso | Bottom nav STATS |
| `profiles` | Calendrier saisonnier + 4 profils plantes éditables (sliders) | Flux pots |
| `system` | Connectivité WAN, contrôle distant, alim, topologie ESP-NOW, log MQTT | Bottom nav SYS |
| `configurator` | Liste pots assignés par zone + CTA ajouter pot | CTA pots |
| `addPot` / `editPot` | Wizard 5 étapes ajout/édition pot (identité → profil → hardware → calibration → review) | CTA configurator |

Bottom nav : **DASH / POTS / TANKS / STATS / SYS**.

## Composants UI clés

- KPI cards (accent border colorée selon variante)
- Pot tiles (grid 5 colonnes, 6 états : ok / high / dry / crit / off / watering)
- Tank cards (viz cuve liquide animée + gauge % + KPIs mini)
- Charts SVG inline (line / area / stacked-bar / heatmap 7×24 / season-curve)
- Sliders, chip-grid, toggle, pin-grid (sélection GPIO)
- Modaux bottom-sheet (slide up, blur backdrop)
- Wizard stepper, danger zone (cadre rouge + confirmation typée)
- Topology (master + liens + slaves avec barres RSSI)
- Live log box (police monospace, tags color-coded)

## Style

- **Palette dark** : bg `#0a0d0c → #1f2724`, accent `#7cff5a`, warn `#ffb547`, crit `#ff5c5c`, water `#5ad3ff`
- **Typo** : Space Grotesk (UI) + JetBrains Mono (data)
- **Mobile-first** : viewport locked, bottom nav fixe, scrollbars masquées
- **Animations CSS** : pulse, water-ripple, pot-watering, droplet-pulse, fill-rise

## Live data system (mock)

`startLiveUpdates()` ligne 4190 — boucle `setInterval(3000)` qui :

- Diminue chaque humidité pot ≈ -1 %/min (avec bruit gaussien)
- Diminue volumes tanks (-0.8 ml T01, -0.3 ml T02 par tick)
- Recalcule l'état des pots via seuils du profil
- Jitter `mqttRtt`, `wanLatency`, `ramUsed`, `RSSI`
- Toutes les 12 s, pousse un événement dans le live log (12 max)
- Avec 2 % de probabilité par pot crit, log `Pxx dry threshold breach`

**Topics MQTT référencés** (textuel uniquement) : `/hydra/sensors`, `/hydra/state`, `/hydra/cmd/+`, `/hydra/alert`.

## ⚠ Écarts vs firmware réel — à résoudre

Le proto reflète une **vision UX maximaliste**. Plusieurs hypothèses divergent du firmware v4 actuel :

| # | Proto | Firmware v4 réel | Décision attendue |
|---|---|---|---|
| 1 | **3 slaves** (S01 balcon, S02 salon, S03 offline) | **1 slave** unique (balcon). Master gère l'intérieur. | Aligner le mock sur 1 slave OU élargir le firmware au pattern N-slaves |
| 2 | **1 capteur ADC par pot** (GPIO dédié par pot) | **1 MUX 16 canaux** par MCU (lecture multiplexée GPIO 36) | Ne pas exposer le GPIO par pot dans l'UI — exposer le canal MUX |
| 3 | **1 pompe par pot** (`gpioPump`) | **2 pompes péristaltiques** uniquement (1 par zone, GPIO 27) | Refactoriser le wizard pot : choix de la zone (A/B), pas de pin pompe |
| 4 | **Pas de modes** AUTO/SCHEDULED/SOLAR/MANUAL | Modes implémentés et exposés via API/Telegram | Ajouter un selector mode + paramètres de chaque mode (cooldown, créneaux, offset solaire) |
| 5 | **Pas d'UI safety** (thermal lockout, hard lockout, `/unlock`) | `SafetyManager` complet avec lockout + remote unlock | Écran dédié sécurité avec état lockout + bouton unlock confirmé |
| 6 | **Pas de wizard pairing ESP-NOW** | Pairing 3-way au premier boot, doc dans `PAIRING.md` | Ajouter écran de pairing au premier setup + bouton `/pairing_reset` |
| 7 | Pompe **submersible 5V** dans le wizard | Pompe **péristaltique 12V** uniquement | Retirer l'option submersible 5V |
| 8 | GPIO incohérents (ADC2, strapping, input-only) | Contraintes ESP32 strictes (voir CLAUDE.md) | Filtrer les pin-grids selon les contraintes ESP32 |

Ces écarts ne sont **pas des bugs du proto** — ils traduisent une UX désirable qu'il faut soit aligner sur le firmware, soit faire évoluer le firmware pour y répondre. Voir TODO.md §Mobile App.

## Roadmap (à implémenter)

### Phase 1 — Aligner le proto sur le firmware réel
- [ ] Refactoriser le wizard pot pour la réalité MUX + 2 pompes
- [ ] Ajouter selector de mode arrosage (AUTO / SCHEDULED / SOLAR / MANUAL)
- [ ] Ajouter écran safety (thermal, hard lockout, unlock)
- [ ] Ajouter écran pairing ESP-NOW
- [ ] Filtrer les pin-grids selon les contraintes ESP32

### Phase 2 — Brancher sur le firmware
- [ ] Remplacer `startLiveUpdates()` par un client MQTT.js (sub `hydra/sensors`, `hydra/pump`, `hydra/alerts`)
- [ ] Brancher les actions sur l'API REST du master (`POST /api/pump/start`, `POST /api/pump/stop`, `POST /api/safety/unlock`, `POST /api/config`)
- [ ] Authentification (à définir — token, JWT, basic auth sur le master)
- [ ] Reconnexion MQTT avec backoff

### Phase 3 — Distribution
- [ ] PWA (manifest + service worker) — installable depuis Chrome/Safari mobile, offline-first
- [ ] OU build React Native / Capacitor / Tauri mobile à partir du HTML
- [ ] Push notifications (FCM/APNs) pour alertes critiques

### Choix technique à trancher
- **PWA** : ré-utilisation directe du proto, install sans store, idéal vu zéro dépendance
- **React Native** : meilleure intégration native (notif push, biométrie), refactor ≈ 80 % du code
- **Capacitor (Ionic)** : wrap le HTML existant en app native, compromis

> Recommandation actuelle : **PWA** — le proto est déjà autonome HTML, ajouter un manifest + service worker suffit pour le déploiement initial.

## Voir aussi

- [`../CLAUDE.md`](../CLAUDE.md) — contexte projet complet
- [`../TODO.md`](../TODO.md) — roadmap globale (section Mobile App)
- [`../docs/architecture_v4.md`](../docs/architecture_v4.md) — architecture firmware + couche client
