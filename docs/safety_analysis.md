# Analyse de Sécurité — Balcony Hydra v3

> Système autonome sans surveillance · Balcon plein soleil · Eau + Électricité + Lithium
> Approche: défense en profondeur — chaque risque couvert par au moins 2 couches indépendantes

## Matrice de Risques

### R1 — INONDATION (pompe bloquée ON)
| Cause | Gravité | Probabilité | Mitigation |
|-------|---------|-------------|------------|
| Firmware freeze (watchdog fail) | CRITIQUE | Faible | **L1** Pull-down HW 10kΩ (pompe OFF si MCU reset) |
| | | | **L2** Max runtime firmware 300s → coupure auto |
| | | | **L3** Watchdog HW 30s → reset MCU → pompe OFF (pull-down) |
| | | | **L4** Relais de sécurité coupe 12V pompe si MCU non-responsive |
| GPIO 27 court-circuit HIGH | CRITIQUE | Très faible | **L1** Pull-down HW 10kΩ force LOW |
| | | | **L2** Fusible 3A sur ligne pompe |
| MOSFET claqué passant | CRITIQUE | Très faible | **L1** Fusible 3A coupe le courant |
| | | | **L2** Relais de sécurité en série avec MOSFET |

### R2 — BATTERIE LITHIUM (emballement thermique)
| Cause | Gravité | Probabilité | Mitigation |
|-------|---------|-------------|------------|
| Surcharge solaire | CATASTROPHIQUE | Faible | **L1** BMS intégré LiFePO4 (coupure charge 14.6V) |
| | | | **L2** MPPT contrôleur avec protection surcharge |
| | | | **L3** Fusible thermique 72°C sur câble batterie |
| Surchauffe (soleil été >50°C) | GRAVE | Moyenne | **L1** LiFePO4 stable jusqu'à 60°C (vs 45°C LiPo) |
| | | | **L2** Fusible thermique 72°C (auto-coupure irréversible) |
| | | | **L3** Capteur BME280 monitore T° ambiante → alerte |
| | | | **L4** Firmware coupe charge si T° > 55°C (via relais) |
| Court-circuit | CATASTROPHIQUE | Très faible | **L1** BMS intégré (protection court-circuit) |
| | | | **L2** Fusible 5A sur sortie batterie |
| | | | **L3** LiFePO4 = chimie la plus stable (pas d'emballement) |

### R3 — DÉGÂT DES EAUX (fuite hydraulique)
| Cause | Gravité | Probabilité | Mitigation |
|-------|---------|-------------|------------|
| Tube déconnecté | MODÉRÉ | Moyenne | **L1** Colliers inox sur tous les raccords |
| | | | **L2** Max runtime pompe 300s (limite volume max ~10L) |
| Raccord bidon fuit | MODÉRÉ | Faible | **L1** Joints EPDM + serrage |
| | | | **L2** Volume max limité à 75L (pas raccordé au réseau) |
| Goutteur bouché → pression | FAIBLE | Moyenne | **L1** Goutteurs réglables (soupape naturelle) |
| | | | **L2** Pompe basse pression (0.5-1 bar max) |

### R4 — INCENDIE ÉLECTRIQUE
| Cause | Gravité | Probabilité | Mitigation |
|-------|---------|-------------|------------|
| Court-circuit câblage | CATASTROPHIQUE | Très faible | **L1** Fusible 5A sortie batterie |
| | | | **L2** Fusible 3A ligne pompe |
| | | | **L3** Boîtier ABS ignifugé (UL94 V-0 si possible) |
| | | | **L4** Câbles silicone haute température |
| Échauffement connecteur | GRAVE | Faible | **L1** Wago 221 certifiés 20A / 85°C |
| | | | **L2** Sections câble adaptées (22AWG signal, 18AWG puissance) |
| | | | **L3** Fusible thermique 72°C |

### R5 — PANNE FIRMWARE / SOFTWARE
| Cause | Gravité | Probabilité | Mitigation |
|-------|---------|-------------|------------|
| Crash firmware | MODÉRÉ | Moyenne | **L1** Watchdog HW 30s → auto-reset |
| | | | **L2** Pull-down HW pompe → OFF au reset |
| | | | **L3** Boot en mode safe si 3 resets consécutifs |
| WiFi perdu | FAIBLE | Fréquent | **L1** Mode dégradé local (arrosage continue) |
| | | | **L2** Absence heartbeat Telegram = alerte implicite |
| NVS corrompue | MODÉRÉ | Très faible | **L1** Defaults safe si lecture NVS échoue |
| | | | **L2** Factory reset via bouton (appui long 10s) |

## Architecture de Sécurité en Couches

```
COUCHE 5 — MONITORING (Telegram alertes, dashboard)
    ↑ détecte anomalies, notifie l'humain
COUCHE 4 — FIRMWARE (failsafes logiciels, watchdog)
    ↑ 6 failsafes actifs, max runtime, seuils
COUCHE 3 — RELAIS SÉCURITÉ (coupure HW indépendante)
    ↑ coupe 12V pompe si MCU non-responsive
COUCHE 2 — PROTECTION PASSIVE (fusibles, pull-down)
    ↑ fusible 5A batterie, 3A pompe, pull-down MOSFET
COUCHE 1 — CHIMIE & PHYSIQUE (LiFePO4, fusible thermique)
    ↑ batterie intrinsèquement safe, auto-coupure température
```

## Composants de Sécurité Ajoutés

| Composant | Fonction | Indépendant du firmware | Boîtier |
|-----------|----------|------------------------|---------|
| Fusible 5A (sortie batterie) | Protection court-circuit global | ✅ OUI | Énergie |
| Fusible 3A (ligne pompe) | Protection pompe bloquée | ✅ OUI | Électronique |
| Fusible thermique 72°C | Auto-coupure si surchauffe batterie | ✅ OUI | Énergie |
| Relais sécurité (GPIO 18) | Coupe 12V pompe, double verrou | ⚠ Piloté firmware | Électronique |
| Pull-down 10kΩ MOSFET | Pompe OFF si MCU crash/reset | ✅ OUI | Électronique |
| LED RGB (GPIO 17/19/23) | État visuel du système | Non (informatif) | Électronique |
| BMS intégré LiFePO4 | Surcharge/décharge/court-circuit | ✅ OUI | Énergie |
| MPPT avec protections | Surcharge/inversion polarité | ✅ OUI | Énergie |

## Disposition Physique — Deux Boîtiers

### Boîtier 1 — Électronique (IP65, blanc, fixé au mur)
- Dimensions: 200×150×85mm, ABS blanc
- Contenu: ESP32 + breakout, MUX ×2, module MOSFET D4184, module relais sécurité, fusible 3A inline, LED RGB, bouton poussoir
- Presse-étoupes: PG7 (capteurs), PG9 (signal), PG11 (alimentation 12V inter-boîtiers)
- Dissipation thermique faible (~0.5W max)
- BLANC obligatoire (réflexion solaire)

### Boîtier 2 — Énergie (IP65, blanc, ventilé, au sol derrière les bidons)
- Dimensions: 250×200×120mm, ABS blanc
- Contenu: Batterie LiFePO4 12V 6Ah, MPPT 10A, LM2596 DC-DC, fusible 5A inline, fusible thermique 72°C
- Ventilation: 4 grilles inox (2 bas + 2 haut) avec moustiquaire anti-insectes → convection naturelle
- Isolation: feuille alu/bulle sur couvercle (réflexion rayonnement direct)
- Position: au sol, DERRIÈRE les bidons 25L (écran thermique naturel — l'eau absorbe la chaleur)
- Câble inter-boîtiers: silicone 18AWG 1.5m, Wago 221 chaque extrémité

### Protection Thermique Passive (balcon plein sud, Cogolin, 0 ombre)
```
    ☀ SOLEIL DIRECT
         ↓
    ┌─────────────────┐ ← Feuille alu/bulle (réfléchit IR)
    │  BOÎTIER BLANC  │ ← ABS blanc (absorbe 30% vs 90% noir)
    │  ┌───────────┐  │
    │  │ BATTERIE  │  │ ← LiFePO4 safe jusqu'à 60°C
    │  │ LiFePO4   │  │ ← Fusible thermique 72°C en série
    │  └───────────┘  │
    │  MPPT + LM2596  │
    ├─ grille inox ───┤ ← Convection naturelle (air chaud sort en haut)
    └─────────────────┘
          ↑
    ┌─────────────────┐
    │  BIDONS 25L ×3  │ ← Écran thermique (masse d'eau)
    └─────────────────┘
         SOL BALCON
```

## Code Couleur LED RGB

| Couleur | Pattern | Signification |
|---------|---------|---------------|
| 🟢 Vert fixe | Allumé continu | Système OK, idle |
| 🟢 Vert pulse | Respiration lente (2s) | Système OK, deep sleep imminent |
| 🔵 Bleu fixe | Allumé continu | WiFi AP mode (config) |
| 🔵 Bleu clignotant | 500ms on/off | Connexion WiFi en cours |
| 🟡 Cyan fixe | Allumé continu | Arrosage en cours (pompe ON) |
| 🟡 Jaune clignotant | 1s on/off | Alerte (réservoir bas, capteur HS) |
| 🔴 Rouge fixe | Allumé continu | Failsafe actif (pompe bloquée) |
| 🔴 Rouge clignotant rapide | 200ms on/off | Erreur critique (T° haute, batterie) |
| ⚪ Blanc flash | 3× 100ms | Bouton pressé (feedback) |
| Éteinte | OFF | Deep sleep |
