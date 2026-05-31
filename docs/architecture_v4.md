# Architecture v4 — Système Distribué Maître/Esclave

> Pivot architectural majeur: 2 ESP32, communication sans fil ESP-NOW + MQTT fallback
> + une couche client mobile (PWA cible) au-dessus du master.

## Vue d'ensemble

```
                ┌─────────────────────────────────────┐
                │  APP MOBILE (PWA cible)              │
                │  mobile/balcony-hydra-mobile.html    │  ← prototype HTML 14 écrans
                │  MQTT subscribe + REST API           │     (mock, données simulées)
                └──────────────────┬──────────────────┘
                                   │ WiFi
                                   ▼
┌─────────────────────────────────────────────────────────┐
│                    APPARTEMENT (intérieur)                │
│                                                          │
│  ┌──────────────────────────────────────────┐            │
│  │     ESP32 MAÎTRE — Boîtier intérieur     │            │
│  │                                          │            │
│  │  LCD TFT 2.4" tactile (dashboard+config) │            │
│  │  DS3231 RTC + NTP sync                   │            │
│  │  LED RGB status                          │            │
│  │  Bouton poussoir                         │            │
│  │  Pompe B intérieur (filaire)             │            │
│  │  10 capteurs humidité (filaire MUX)      │            │
│  │  Capteur US réservoir intérieur          │            │
│  │  Relay sécurité (coupe les 2 pompes)     │            │
│  │  WiFi: réseau maison + ESP-NOW           │            │
│  │  Web portal + Telegram + MQTT cloud      │            │
│  │  Alimenté USB secteur 5V                 │            │
│  └──────────────┬───────────────────────────┘            │
│                 │ filaire                                 │
│        ┌────────┴────────┐                               │
│        │ Pompe B + tubes │ → 10 pots intérieur            │
│        │ Réservoir 25L   │                               │
│        │ Capteur US #2   │                               │
│        └─────────────────┘                               │
└───────────────────┬──────────────────────────────────────┘
                    │ ESP-NOW (2.4GHz, peer-to-peer, pas besoin routeur)
                    │ + MQTT fallback (via routeur WiFi)
                    │ sans fil, à travers murs/vitres
┌───────────────────┴──────────────────────────────────────┐
│                      BALCON (extérieur)                    │
│                                                          │
│  ┌──────────────────────────────────────────┐            │
│  │     ESP32 ESCLAVE — Boîtier IP65 blanc   │            │
│  │                                          │            │
│  │  Pompe A balcon (locale)                 │            │
│  │  10 capteurs humidité (filaire MUX)      │            │
│  │  Capteur US réservoir balcon             │            │
│  │  BME280 environnement extérieur          │            │
│  │  INA219 courant pompe                    │            │
│  │  LED RGB status                          │            │
│  │  MOSFET pompe + pull-down sécurité       │            │
│  │  WiFi: ESP-NOW + MQTT fallback           │            │
│  │  Alimenté USB 5V secteur (prise balcon)   │            │
│  │  Mode dégradé si WiFi perdu              │            │
│  └──────────────────────────────────────────┘            │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐                      │
│  │ Réservoir 1  ├──┤ Réservoir 2  │ 50L vases comm.      │
│  │    25L       │  │    25L       │                      │
│  └──────────────┘  └──────────────┘                      │
│                                                          │
│  ┌──────────────────────┐                                │
│  │ 🔌 USB 5V Secteur    │ prise balcon                    │
│  └──────────────────────┘                                │
└──────────────────────────────────────────────────────────┘
```

## Communication ESP-NOW + MQTT fallback

### ESP-NOW (primaire)
- Protocole peer-to-peer Espressif, 2.4GHz
- Pas besoin du routeur WiFi — fonctionne même si Internet est coupé
- Latence <5ms, portée ~50m en intérieur (largement suffisant balcon↔appart)
- Filtrage par magic byte `0xBA` (pas de chiffrement PMK/LMK à ce stade — voir PAIRING.md §Sécurité)
- Bidirectionnel: maître envoie commandes, esclave remonte données
- Pas de TCP/IP overhead — très léger, faible empreinte CPU

### MQTT fallback (secondaire)
- Si ESP-NOW échoue (interférences, distance), bascule sur MQTT via routeur WiFi
- Le maître publie les commandes sur `hydra/cmd/slave/*`
- L'esclave publie ses données sur `hydra/slave/sensors`
- Fonctionne tant que le routeur WiFi est opérationnel

### Messages ESP-NOW

**Maître → Esclave:**
```
CMD_PUMP_START    { duration_s: uint16 }
CMD_PUMP_STOP     { }
CMD_READ_SENSORS  { }
CMD_SET_CONFIG    { moisture_min, moisture_max, pump_duration }
CMD_PING          { }
CMD_REBOOT        { }
```

**Esclave → Maître:**
```
DATA_SENSORS      { moisture[10], tank_level, tank_cm, temperature, humidity, pressure, pump_current }
DATA_PUMP_STATUS  { state, running_for_s, total_cycles, failsafe }
DATA_ACK          { cmd_id, success }
DATA_ALERT        { type, message }
DATA_PONG         { uptime_s, vbus_v, rssi }
```

### Intervalle communication
- Esclave envoie DATA_SENSORS toutes les 30s (quand actif)
- Maître envoie CMD_PING toutes les 60s (heartbeat)
- Si 3 CMD_PING envoyés sans DATA_PONG en retour (180s) → maître alerte "Esclave balcon non-responsive"

## Mode dégradé esclave (lien maître perdu)

Si l'esclave perd la communication avec le maître (ESP-NOW ET MQTT fallback absents) :
1. Continue d'arroser selon le dernier schedule/config reçu (stocké en NVS)
2. LED jaune clignotant
3. Tente de reconnecter ESP-NOW toutes les 30s
4. Si reconnexion → remonte toutes les données accumulées
5. Les failsafes restent actifs localement (tank, max runtime, overcurrent)

## Sécurité distribuée

### Maître (intérieur)
- Relay sécurité GPIO 18 — coupe sa propre pompe intérieur
- SafetyManager: thermal lockout, crash detection, remote unlock
- Peut envoyer CMD_PUMP_STOP à l'esclave à tout moment
- Si esclave non-responsive → alerte Telegram

### Esclave (balcon, USB secteur)
- MOSFET pull-down 10kΩ — pompe OFF si crash/reset
- Fusible 3A inline ligne pompe
- Failsafes locaux: tank empty, max runtime, overcurrent, dry-run
- Si maître non-responsive → mode dégradé (pas d'arrêt total)
- USB secteur = pas de risque batterie/thermique

### Indépendance critique
- L'esclave peut fonctionner sans le maître (mode dégradé)
- Le maître peut fonctionner sans l'esclave (zone intérieur indépendante)
- La perte de WiFi routeur n'affecte PAS ESP-NOW (peer-to-peer)
- La perte d'ESP-NOW déclenche le fallback MQTT
- La perte des DEUX déclenche le mode dégradé esclave

## Écran TFT 2.4" tactile (maître)

### Modèle recommandé
- ILI9341 2.4" 320×240 SPI + XPT2046 touch controller
- Connexion SPI (6 pins: MOSI, MISO, CLK, CS_TFT, CS_TOUCH, DC)
- Librairies: TFT_eSPI + XPT2046_Touchscreen

### Écrans du dashboard

1. **Écran principal** — Vue d'ensemble
   - Humidité zone A (balcon) + zone B (intérieur)
   - Niveaux réservoirs (barres)
   - État pompes (ON/OFF/bloquée)
   - T° extérieur + intérieur
   - Heure + lever/coucher soleil
   - État communication esclave (OK/perdu)

2. **Écran config WiFi** (premier boot ou bouton)
   - Scan réseaux disponibles (liste tactile)
   - Clavier virtuel pour SSID + mot de passe
   - Bouton "Connecter"

3. **Écran config arrosage**
   - Mode (AUTO/SCHEDULED/SOLAR/MANUAL)
   - Seuils humidité min/max (slider tactile)
   - Durée pompe (ou AUTO si profils configurés)
   - Horaires schedule

4. **Écran sécurité**
   - État SafetyManager
   - Bouton unlock (si hard lockout)
   - T° interne boîtier esclave (BME280)
   - Compteur boot crashes (maître + esclave)

5. **Écran capteurs détail**
   - Liste des 20 capteurs avec valeur individuelle
   - Alertes pots chroniquement secs
   - Taux d'assèchement appris par pot

6. **Écran profils hydriques**
   - Liste des plantes par zone avec catégorie, volume pot, goutteur
   - Coefficient saisonnier mois courant (barre visuelle)
   - Volume eau calculé pour le cycle en cours
   - Durée de cycle par zone

7. **Écran autonomie**
   - Sélection durée absence (jours, slider tactile)
   - Consommation estimée par zone (barre vs stockage)
   - Indicateur ✅/❌ suffisant + marge %
   - Autonomie max avec stockage actuel

## Gestion hydrique intelligente

### PlantProfile — Profil par plante
Chaque pot (0-19) possède un profil hydrique stocké en NVS:
- **Catégorie** (7 prédéfinies): CITRUS, AROMATIC, SUCCULENT, TROPICAL, MEDITERRANEAN, FLOWERING, CUSTOM
- **Coefficients saisonniers** (12 mois, calibrés Mougins 43.61°N):
  - Citrus: Jan=0.10, Avr=0.40, Jul=0.95, Aoû=1.00, Nov=0.20
  - Succulent: Jan=0.05, Jul=0.40, Aoû=0.40 (×10 moins qu'un citrus)
  - Tropical (intérieur): Jan=0.50, Aoû=1.00 (plus constant, T° stable)
- **Volume pot** (litres): scaling non-linéaire (√ ratio vs 10L référence)
- **Débit goutteur** (L/h): 2, 4, ou 8 L/h selon installation
- **Seuil humidité override**: certaines plantes ont besoin d'un seuil différent
- **Taux d'assèchement appris** (%/h): régression linéaire sur 24 échantillons

### AutonomyCalculator — Prédiction consommation
Calcul jour par jour avec changement de mois pour précision saisonnière:
- Entrée: durée absence (jours), mois de départ, volume stockage par zone
- Sortie par zone: consommation totale, conso/jour, cycles/jour, autonomie max
- Si taux d'assèchement appris disponible → estimation précise basée terrain
- Sinon → estimation saisonnière basée sur les coefficients catégoriels
- Commande Telegram: `/autonomy 21` → rapport complet texte

### Durée de cycle adaptative
`PumpController` interroge `PlantProfile.computeZoneCycleDurationS(zone, mois)`:
- Durée = MAX des durées individuelles de la zone (pompe partagée)
- Durée individuelle = volume_eau_nécessaire / débit_goutteur
- Volume = base_catégorie × √(pot/10L) × coeff_saisonnier
- Le mois courant est fourni par TimeManager (DS3231 + NTP, calcul solaire algorithme NOAA)
- Exemples Mougins: citronnier 30L avec goutteur 8 L/h:
  - Août: 500mL → 225s (3m45)
  - Janvier: 50mL → 22s
  - Succulente 3L avec goutteur 2 L/h: Août: 25mL → 45s, Janvier: 3mL → 5s (plancher)

## Couche client mobile

Le système v4 introduit une couche client mobile **au-dessus** du master, à utiliser depuis un téléphone connecté au même réseau WiFi (ou via un broker MQTT public).

### Statut actuel — prototype HTML

`mobile/balcony-hydra-mobile.html` : **prototype haute fidélité** mobile-first, autonome.
- 14 écrans (dashboard, pots, tanks, stats, system, profiles, configurator, wizards…)
- 4 834 lignes / 243 KB, zéro dépendance JS (uniquement Google Fonts)
- Données simulées par boucle `setInterval(3000)` → mock MQTT/ESP-NOW
- Voir `mobile/README.md` pour l'inventaire complet et la roadmap

### Architecture cible

```
┌──────────────────────────────────────────────┐
│         MOBILE APP (PWA)                      │
│  ┌────────────────────────────────────────┐  │
│  │ UI : 14 écrans React/Vanilla           │  │
│  │ State : POTS, TANKS, PROFILES, SYSTEM  │  │
│  └──────────┬───────────────────┬─────────┘  │
│             │                   │            │
│  ┌──────────▼───────┐  ┌────────▼─────────┐  │
│  │ MQTT.js client    │  │ REST client      │  │
│  │ (sub topics live) │  │ (commandes)      │  │
│  └──────────┬────────┘  └────────┬─────────┘  │
└─────────────┼─────────────────────┼───────────┘
              │ WebSocket/TCP        │ HTTPS
              ▼                      ▼
        Broker MQTT          ESP32 Master Web API
        (Mosquitto)          AsyncWebServer
              ▲                      │
              │ publish               │
              └──────── ESP32 Master ──┘
```

### Topics MQTT consommés

| Topic | Direction | Usage |
|-------|-----------|-------|
| `hydra/sensors` | sub | KPIs dashboard, grille pots, graphs |
| `hydra/pump` | sub | État pompes (idle/running/blocked) |
| `hydra/alerts` | sub | Bannières alertes, log live |
| `hydra/cmd/water` | pub | Déclenche arrosage (modal water) |
| `hydra/cmd/stop` | pub | Arrêt pompe |
| `hydra/cmd/reset` | pub | Reset failsafe |

> **Note** : l'app de production `mobile-app/` consomme les **topics canoniques** ci-dessus (`hydra/sensors|pump|alerts`, cf. `mqtt-bridge.ts`). Les topics fictifs `/hydra/state` et `/hydra/p07/+` n'existent **que** dans le prototype legacy `mobile/balcony-hydra-mobile.html` (figé comme référence UX) — aucun écart côté production.

### API REST consommée

| Méthode | Route | Action UI |
|---------|-------|-----------|
| GET | `/api/status` | Refresh dashboard (poll si MQTT KO) |
| GET | `/api/sensors` | Drill-down détail capteurs |
| GET | `/api/config` | Charger configuration éditable |
| POST | `/api/config` | Sauvegarder modifs settings |
| POST | `/api/pump/start` | Bouton "ARROSER xxxml" |
| POST | `/api/pump/stop` | Bouton "STOP" |
| POST | `/api/pump/reset` | Bouton "Reset failsafe" |
| GET | `/api/safety/status` | Écran sécurité (à ajouter au proto) |
| POST | `/api/safety/unlock` | Bouton "/unlock" (à ajouter au proto) |
| POST | `/api/reboot` | Action "Reboot master" |

### Phases d'intégration

- **Phase 1 — Alignement design** : corriger 8 écarts (slaves, MUX, modes, safety, pairing, GPIO, pompes). Détaillé dans `mobile/README.md`.
- **Phase 2 — Connexion live** : MQTT.js + fetch API REST, auth à définir (token, JWT, ou mDNS-only ?).
- **Phase 3 — Distribution** : PWA (manifest + service worker) recommandée, OU Capacitor / React Native si besoin de notif push natives.

## Structure repo

```
balcony-hydra/
├── CLAUDE.md
├── README.md
├── TODO.md
├── DECISIONS.md
├── LICENSE
├── docs/
│   ├── BOM_v4_secteur.xlsx         (BOM canonique — solution figée)
│   ├── sourcing_consolidation_v4.md
│   ├── architecture_v4.md          (ce fichier)
│   ├── safety_analysis.md
│   ├── PAIRING.md
│   ├── test_matrix.md
│   ├── wiring_master.svg
│   ├── wiring_slave.svg
│   ├── firmware_architecture.svg
│   └── legacy/                     # v2/v3 archivés
├── hardware/
│   ├── pin_assignment_master.md
│   └── pin_assignment_slave.md
├── firmware/
│   ├── common/                     # Code partagé maître+esclave
│   │   ├── Protocol.h              # Messages ESP-NOW, CmdType/DataType, structs packed
│   │   └── config_common.h         # Constantes partagées (seuils, timing, coords)
│   ├── master/                     # Firmware maître (intérieur)
│   │   ├── platformio.ini
│   │   ├── src/main.cpp
│   │   ├── include/config_master.h
│   │   └── lib/
│   │       ├── ConfigManager/
│   │       ├── SensorManager/
│   │       ├── PumpController/     # Zone B uniquement (filaire)
│   │       ├── SafetyManager/
│   │       ├── WifiManager/
│   │       ├── EspNowMaster/       # ESP-NOW maître + MQTT fallback
│   │       ├── WebPortal/
│   │       ├── TftDashboard/       # Écran TFT tactile ILI9341 (7 écrans)
│   │       ├── MqttClient/
│   │       ├── TelegramBot/
│   │       ├── TimeManager/
│   │       ├── PlantProfile/       # Profil hydrique par plante (NVS)
│   │       ├── AutonomyCalculator/ # Prédiction consommation / autonomie
│   │       ├── WiFiGeolocation/    # Géoloc par scan WiFi → lat/lon NVS
│   │       ├── StatusLED/
│   │       └── SleepManager/
│   └── slave/                      # Firmware esclave (balcon)
│       ├── platformio.ini
│       ├── src/main.cpp
│       ├── include/config_slave.h
│       └── lib/
│           ├── SensorManager/      # Zone A uniquement
│           ├── PumpController/     # Zone A uniquement (locale)
│           ├── EspNowSlave/        # ESP-NOW esclave + MQTT fallback
│           ├── SafetyLocal/        # Failsafes locaux (pas de relay)
│           ├── StatusLED/
│           └── DegradedMode/       # Arrosage autonome si maître perdu
├── mobile/                         # ← Nouveau v4
│   ├── balcony-hydra-mobile.html   # Prototype haute fidélité 14 écrans
│   └── README.md                   # Inventaire + écarts + roadmap PWA
└── tools/
```

## Pin assignments

### ESP32 Maître (intérieur)

| GPIO | Fonction | Notes |
|------|----------|-------|
| 36 | MUX SIG (10 capteurs Zone B) | ADC1_CH0, input only |
| 34 | US#1 ECHO (réservoir intérieur) | Input only |
| 14 | US#1 TRIGGER | — |
| 32,33,25,26 | MUX S0-S3 | Adresse partagée |
| 4 | MUX EN | Active LOW |
| 27 | Pompe B MOSFET | Pull-down 10kΩ |
| 18 | Relay sécurité | Coupe pompe B (seul sur 18) |
| 21,22 | I2C (DS3231 0x68) | Pull-up 4.7kΩ |
| 5 | Bouton poussoir | INPUT_PULLUP, ISR |
| 16 | LED R | LEDC PWM |
| 17 | LED G | LEDC PWM |
| 2 | LED B | LEDC PWM |
| 13 | TFT CS | SPI |
| 12 | TFT DC | SPI (strapping — état safe au boot) |
| 15 | TOUCH CS | SPI |
| 23 | SPI MOSI | TFT + Touch |
| 35 | SPI MISO | input only (valide pour MISO) |
| 19 | SPI CLK | remappé depuis 18 |

**✅ Conflit SPI/relay résolu (2026-05-29) :** la LED RGB est sur GPIO 16/17/2 (hors bus SPI) et le bus SPI TFT a été remappé (CLK 18→19, MISO 19→35) pour que le **relay sécurité reste seul sur GPIO 18**. Plus aucune double affectation. Détail dans `DECISIONS.md 2026-05-29` et `CLAUDE.md` §Table Maître. Reste à valider l'init TFT au 1er flash HW (`docs/hardware_bringup_checklist.md §0`).

### ESP32 Esclave (balcon)

| GPIO | Fonction | Notes |
|------|----------|-------|
| 36 | MUX SIG (10 capteurs balcon) | ADC1_CH0 |
| 34 | US#1 ECHO (réservoir balcon) | Input only |
| 32,33,25,26 | MUX S0-S3 | |
| 4 | MUX EN | |
| 27 | Pompe A MOSFET | Pull-down 10kΩ |
| 14 | US#1 TRIGGER | |
| 21,22 | I2C (BME280 + INA219) | |
| 17 | LED R | PWM |
| 19 | LED G | PWM |
| 23 | LED B | PWM |
| 2 | LED onboard (heartbeat) | |
