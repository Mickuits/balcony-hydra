# Hardware Bring-up Checklist — Balcony Hydra v4

> Procédure de mise en route à exécuter **dès réception des 2 ESP32 + composants**.
> Objectif : passer de « firmware validé en SIL (~60 %) » à « système *fully
> operational* validé sur hardware réel (100 %) ».
>
> Cette checklist **orchestre** les contrôles existants — elle ne les duplique pas :
> - Tests fonctionnels détaillés → `docs/test_matrix.md` (T1–T12, ~132 cas)
> - Procédure terrain pas-à-pas → `docs/protocole_mise_en_service.pdf`
> - Appairage ESP-NOW → `docs/PAIRING.md`
> - Câblage → `docs/wiring_master.svg` + `docs/wiring_slave.svg`
>
> Cocher au fur et à mesure. Ne pas passer à l'étape suivante tant que la
> précédente n'est pas verte (chaque couche dépend de la précédente).

---

## §0 — PRÉ-REQUIS BLOQUANT : valider le remap SPI/relay (2026-05-29)

Le bus SPI du TFT a été remappé pour libérer le relay du GPIO 18
(cf. `DECISIONS.md 2026-05-29`). **À vérifier en tout premier**, car non
validable en SIL (TftDashboard n'est pas instancié en natif).

Pinout cible maître (cf. `config_master.h` + `platformio.ini`) :

| Signal | GPIO | Note |
|--------|------|------|
| SPI MOSI | 23 | inchangé |
| SPI MISO | **35** | input-only — valide pour MISO (entrée) |
| SPI CLK  | **19** | remappé depuis 18 |
| TFT CS | 13 | |
| TFT DC | 12 | strapping — vérifier état boot |
| TOUCH CS | 15 | |
| Relay sécurité | **18** | seul sur 18 désormais |

- [ ] Câbler le TFT/XPT2046 sur **MOSI=23, MISO=35, CLK=19, CS=13, DC=12, TOUCH_CS=15** (Wago/Dupont)
- [ ] Câbler le relay sécurité sur **GPIO 18** uniquement (plus de partage)
- [ ] `pio run -e master` compile sans erreur avec les flags `USER_SETUP_LOADED` (déjà dans `platformio.ini`)
- [ ] **Init écran OK** : au boot, le TFT affiche le 1er écran (pas blanc/noir). Sinon → ajuster `ILI9341_DRIVER` / `SPI_FREQUENCY` (essayer 27 MHz)
- [ ] **Tactile OK** : la lecture XPT2046 répond sur MISO=35 (toucher l'écran bouge le curseur / déclenche les zones)
- [ ] **Relay OK et indépendant** : `SafetyManager` arme/désarme le relay sur 18 sans perturber l'affichage (les deux fonctionnent simultanément → preuve que le conflit est levé)
- [ ] **GPIO 12 (DC, strapping)** : le boot flash réussit (pas de brick) avec le TFT branché. Sinon, forcer l'état au boot ou déplacer DC.

> ✅ Si §0 est vert, le conflit historique GPIO 18 est définitivement clos.
> ❌ Si l'écran ne s'init pas : le remap *pin* est bon, c'est la config TFT_eSPI
> (driver/freq) qu'il faut ajuster — pas besoin de retoucher le pinout.

---

## §1 — Mise sous tension & flash (par MCU)

- [ ] Alim **USB secteur** maître (prise intérieure) + esclave (prise balcon) — pas de batterie/solaire
- [ ] Flash maître : `pio run -e master -t upload` puis `pio device monitor`
- [ ] Flash esclave : `pio run -e slave -t upload`
- [ ] Boot maître propre (12-step boot série, pas de boot-loop) → relever le **token API** affiché au boot (`X-Hydra-Token`)
- [ ] Boot esclave propre (LED bleue = attente pairing)
- [ ] Noter les **2 MAC ESP-NOW** (commande série) pour la doc de déploiement *(TODO.md §En attente)*

---

## §2 — Acceptation fonctionnelle : exécuter `docs/test_matrix.md` (T1–T12)

Exécuter la matrice dans l'**ordre recommandé** (§ « Ordre d'exécution » du doc).
Ces groupes ne sont **pas** couverts par le SIL et nécessitent le hardware :

- [ ] **T1** — Communication Maître ↔ Esclave (pairing 3-way, unicast chiffré AES-128-CCM, PING/PONG)
- [ ] **T2** — Mode Dégradé Esclave (maître coupé → arrosage autonome sur schedule NVS)
- [ ] **T3** — Arrosage Mode AUTO (seuil humidité → cycle, cooldown, max cycles/24h)
- [ ] **T4** — Modes SCHEDULED / SOLAR / MANUEL (horaires, NOAA solaire, commande)
- [ ] **T5** — SafetyManager (thermal lockout 58°C + recovery 45°C/5min, hard lockout, `/unlock`)
- [ ] **T6** — Hardware & sécurité passive (MOSFET, **relay GPIO 18**, fusible 3A, pull-down — tests batterie supprimés en v4)
- [ ] **T7** — Interface utilisateur (TFT 7 écrans + tactile, bouton GPIO 5, **dépend de §0**)
- [ ] **T8** — Capteurs & alertes par pot (20 capteurs via MUX, calibration)
- [ ] **T9** — Robustesse WiFi & réseau (backoff, fallback AP, reconnexion, fallback sans NTP)
- [ ] **T10** — Profils hydriques & durée de cycle adaptative
- [ ] **T11** — Autonomie & prédiction conso (`/autonomy N`)
- [ ] **T12** — Géolocalisation WiFi (scan → lat/lon → solaire)

---

## §3 — Chemins externes à valider (non couverts SIL, cf. TODO.md « Couverture SIL ~60 % »)

- [ ] Capteur ultrasonique tank level réel (pulseIn ≠ mock) — maître + esclave
- [ ] ESP-NOW transmission bout-en-bout **à travers murs** (intérieur ↔ balcon)
- [ ] WiFi : AP / STA / captive portal / reconnexion sur vrai routeur
- [ ] MQTT : connexion broker Mosquitto, publish `hydra/sensors|pump|alerts`, subscribe `hydra/cmd/*`
- [ ] WebPortal : toutes les routes + **auth `X-Hydra-Token`** (401 sans header, 200 avec)
- [ ] App mobile PWA : bascule mock→live (MQTT.js + REST), actions branchées
- [ ] Telegram : alertes push + commandes (`/status /water /unlock /autonomy /factory_reset`)
- [ ] Heartbeat Telegram 12h
- [ ] TimeManager : NTP + DS3231 + algorithme solaire NOAA
- [ ] OTA : `pio run -t upload --upload-port hydra-master.local` (pompe OFF + relay désarmé pendant update)
- [ ] FreeRTOS : 4 tâches dual-core, pas de watchdog reset intempestif
- [ ] **Valider `PIN_PUMP_B = 27`** vs `config_v3_ref.h` (=15) — lever l'ambiguïté historique *(TODO.md)*

---

## §4 — Sign-off « Fully Operational »

Le système est déclaré *fully operational* quand :

- [ ] §0 vert (remap SPI/relay validé)
- [ ] T1–T12 **tous** verts dans `test_matrix.md`
- [ ] §3 : tous les chemins externes validés au moins une fois
- [ ] 72 h de fonctionnement continu sans hard lockout ni boot-loop (test d'endurance)
- [ ] Un cycle d'absence simulé (`/autonomy 21`) cohérent avec la conso mesurée
- [ ] Sauvegarde de la config (export PWA) + procédure de restauration testée

> **État actuel (avant hardware)** : logique applicative validée — 154/154 tests
> Unity natifs (firmware) + 459/459 tests Vitest (mobile). Reste l'intégration
> matérielle ci-dessus (~40 % du chemin critique), par nature non simulable.
