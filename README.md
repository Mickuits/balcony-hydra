# 🌱 Balcony Hydra v3

**Système d'arrosage automatique solaire — 20 pots — Plug-and-Play (zéro soudure)**

> Système embarqué ESP32 avec monitoring à distance, portail web de configuration, et alimentation solaire autonome LiFePO4.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    BALCONY HYDRA v3                  │
├──────────┬──────────┬──────────┬────────────────────┤
│ ☀ Solaire │ 🔋 LiFePO4 │ 💧 Pompe  │ 📡 ESP32 WiFi     │
│ 20W mono │ 12V 6Ah  │ 12V 2L/m │ MQTT + Telegram   │
├──────────┴──────────┴──────────┴────────────────────┤
│ 20× capteurs humidité · 2× niveau US · BME280      │
│ Portail web embarqué · OTA · Deep sleep · Failsafe  │
└─────────────────────────────────────────────────────┘
```

## Caractéristiques

- **20 pots** avec goutteurs réglables individuellement
- **3 réservoirs 25L** en vases communicants (75L total)
- **Solaire autonome** — panneau 20W + LiFePO4 12V 6Ah (15+ jours sans soleil)
- **Portail web embarqué** (WiFi AP) — paramétrage complet en français
- **Telegram Bot** — alertes + commandes à distance
- **MQTT** — données vers Grafana/InfluxDB
- **Deep sleep** — consommation µA entre cycles
- **Failsafe** — coupure pompe si réservoir bas, mode dégradé sans WiFi
- **Plug-and-play** — zéro soudure (borniers à vis, Wago 221, Dupont, JST)
- **OTA** — mise à jour firmware par WiFi

## Structure du repo

```
balcony-hydra/
├── README.md
├── LICENSE
├── .gitignore
├── docs/
│   ├── BOM_v3_plug_and_play.xlsx      # Bill of Materials complet
│   ├── schema_hydraulique.svg          # Schéma hydraulique système
│   ├── wiring_diagram.svg             # Wiring diagram électrique
│   └── architecture.md                # Notes d'architecture
├── hardware/
│   └── pin_assignment.md              # Table d'assignation GPIO
├── firmware/
│   ├── platformio.ini                 # Config PlatformIO
│   ├── src/
│   │   └── main.cpp                   # Point d'entrée
│   ├── include/
│   │   ├── config.h                   # Configuration système
│   │   └── secrets.h.example          # Template secrets (WiFi, Telegram)
│   ├── lib/                           # Modules C++ (à venir)
│   └── test/                          # Tests unitaires (à venir)
└── tools/                             # Scripts utilitaires (à venir)
```

## Prérequis

- [PlatformIO](https://platformio.org/) (VS Code extension)
- ESP32 DevKit WROOM-32 (30 pins)
- Breakout board borniers à vis CZH-Labs

## Quickstart

```bash
# Cloner le repo
git clone git@github.com:<user>/balcony-hydra.git
cd balcony-hydra/firmware

# Copier et éditer les secrets
cp include/secrets.h.example include/secrets.h
# Éditer secrets.h avec vos credentials WiFi/Telegram

# Build & flash
pio run -t upload

# Monitor série
pio device monitor
```

## Budget

~250-280€ tout compris (hors réservoirs existants), sourcing AliExpress/Amazon/Leroy Merlin.

## Licence

MIT — Usage libre.

## Auteur

Micka — [Prime Yachting](https://primeyachting.com) — Mougins le Haut, France
