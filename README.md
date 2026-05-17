# 🌱 Balcony Hydra v4

**Système d'arrosage automatique distribué — 20 pots — 2 ESP32 — Plug-and-Play (zéro soudure)**

> Maître intérieur + Esclave balcon communicants par ESP-NOW + MQTT fallback.
> Monitoring tactile (TFT 2.4"), portail web, bot Telegram, et prototype d'app mobile haute fidélité.

## Architecture v4 — Distribuée

```
┌──────────────────────────────┐
│   APP MOBILE (PWA cible)     │  ← mobile/balcony-hydra-mobile.html
│   prototype HTML 14 écrans   │     (MQTT + REST)
└──────────────┬───────────────┘
               │ WiFi
               ▼
┌───────────────────────────────────────────────────────────┐
│         INTÉRIEUR — ESP32 Maître (USB secteur)             │
│  TFT 2.4" tactile · Pompe B · 10 capteurs · RTC · Relay   │
│  Web portal · Telegram · MQTT · LED RGB · Bouton          │
└─────────────────────┬─────────────────────────────────────┘
                      │ ESP-NOW (2.4 GHz peer-to-peer)
                      │ + MQTT fallback
┌─────────────────────┴─────────────────────────────────────┐
│          BALCON — ESP32 Esclave (USB secteur)              │
│  Pompe A · 10 capteurs · BME280 · INA219 · LED RGB        │
│  Mode dégradé local si maître perdu                       │
└───────────────────────────────────────────────────────────┘
```

## Caractéristiques

### Hardware distribué
- **20 pots** répartis en 2 zones (10 balcon + 10 intérieur)
- **2 ESP32 WROOM-32** : maître intérieur + esclave balcon
- **3 réservoirs 25L** : 2 vases communicants balcon (50 L) + 1 intérieur (25 L)
- **2 pompes péristaltiques 12V** indépendantes (1 par zone)
- **USB secteur** des deux côtés (pas de batterie = pas de risque thermique)

### Communication
- **ESP-NOW** peer-to-peer (primaire, ne dépend pas du routeur)
- **MQTT fallback** via routeur WiFi
- **Pairing dynamique** au premier boot (3-way REQ/ACK/CONFIRM)
- **Mode dégradé esclave** si maître perdu (arrosage autonome sur schedule NVS)

### Interfaces utilisateur
- **TFT 2.4" tactile** (ILI9341 + XPT2046) sur le maître — 7 écrans dashboard
- **Portail web** embarqué (AsyncWebServer) en français
- **Bot Telegram** : alertes push + commandes (`/status`, `/water`, `/unlock`, `/autonomy N`...)
- **MQTT** vers Grafana / InfluxDB pour historique
- **App mobile** (prototype HTML haute fidélité, voir `mobile/`)

### Intelligence hydrique
- **Modes** : AUTO (thermostat humidité), SCHEDULED (horaires fixes), SOLAR (lever/coucher NOAA), MANUAL
- **Profils par plante** (7 catégories) avec coefficients saisonniers ×12 mois
- **AutonomyCalculator** : prévision conso pour N jours d'absence
- **WiFi geolocation** : géoloc auto au premier boot (Mozilla Location Service)
- **Apprentissage taux d'assèchement** par régression linéaire sur 24h

### Sécurité (défense en profondeur, 6 couches)
1. Alim USB secteur (pas de batterie)
2. Fusible 3A + pull-down MOSFET 10kΩ (hardware)
3. Relay sécurité côté maître (double verrou pompe B)
4. `SafetyManager` (thermal lockout, boot crash, overcurrent, dry-run, hard lockout)
5. Monitoring multi-canal (Telegram, web, MQTT, TFT)
6. Prédiction (autonomy + profils)

### OTA et résilience
- **OTA WiFi** (ArduinoOTA, hostname `hydra`) — rollback auto
- **Reconnexion WiFi** avec backoff exponentiel
- **Fallback sans NTP** : arrosage basé sur `millis()` si NTP jamais sync
- **Auto-recovery** : thermal & tank auto-réarment quand conditions normales reviennent
- **Hard lockout** : surintensité / dry-run → bloqué, déverrouillage via `/unlock` Telegram

## Structure du repo

```
balcony-hydra/
├── README.md                    ← ce fichier
├── CLAUDE.md                    ← contexte projet pour Claude Code
├── TODO.md                      ← roadmap active
├── DECISIONS.md                 ← log des décisions de design
├── LICENSE
├── docs/
│   ├── architecture_v4.md       ← architecture détaillée (firmware + client)
│   ├── safety_analysis.md       ← analyse sécurité (6 couches, seuils chiffrés)
│   ├── PAIRING.md               ← procédure pairing ESP-NOW
│   ├── test_matrix.md           ← matrice 132 tests hardware
│   ├── BOM_v4_secteur.xlsx      ← Bill of Materials (43 lignes, ~235 €)
│   ├── wiring_master.svg        ← wiring électrique maître
│   ├── wiring_slave.svg         ← wiring électrique esclave
│   ├── firmware_architecture.svg
│   ├── hydra-sysml-diagrams.pdf
│   ├── protocole_mise_en_service.pdf
│   └── legacy/                  ← docs v2/v3 archivés
├── firmware/
│   ├── common/                  ← Protocol.h + config_common.h
│   ├── master/                  ← firmware maître (16 modules, TFT, web, Telegram)
│   └── slave/                   ← firmware esclave (6 modules, mode dégradé)
├── hardware/                    ← pin assignments + datasheets
└── mobile/
    ├── balcony-hydra-mobile.html  ← prototype mobile haute fidélité (14 écrans)
    └── README.md                  ← inventaire + roadmap PWA
```

## État du projet

**✅ Logiciellement complet.** Firmware prêt à recevoir le hardware.
- CI 100 % vert sur 5 jobs hard gate (build master + build slave + lint × 2 + protocol-check)
- **138/138 tests** Unity natifs master + **16/16** tests slave, zéro IGNORE
- Couverture SIL ~60 % du chemin critique (le reste nécessite hardware réel)
- 14 décisions de design documentées dans `DECISIONS.md`

**🟡 En attente** : validation hardware (1 journée + 2 ESP32) — voir `TODO.md`.

**🟡 Prototype mobile** : livré 2026-05-17, 14 écrans, données mock. Roadmap d'intégration Phase 1/2/3 dans `mobile/README.md`.

## Quickstart firmware

```bash
git clone git@github.com:<user>/balcony-hydra.git
cd balcony-hydra/firmware

# Maître
cd master
cp include/secrets.h.example include/secrets.h
# Éditer secrets.h (WiFi, Telegram, MQTT)
pio run -t upload && pio device monitor

# Esclave (dans un autre terminal)
cd ../slave
pio run -t upload && pio device monitor

# Pairing automatique au premier boot — voir docs/PAIRING.md
```

## Prototype mobile

Ouvrir `mobile/balcony-hydra-mobile.html` dans un navigateur (mobile de préférence).

14 écrans complets, 5 wizards, ~30 modaux, données simulées par boucle JS.
Voir `mobile/README.md` pour l'inventaire complet et la roadmap d'intégration.

## Budget

- **Hardware** : ~235 € tout compris (voir `docs/BOM_v4_secteur.xlsx`)
- **Software** : 100 % open source (MIT)
- **Cloud** : optionnel (broker MQTT local Mosquitto OU service gratuit)

## Licence

MIT — Usage libre.

## Auteur

Micka — [Prime Yachting](https://primeyachting.com) — Cogolin / Mougins le Haut, France
