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

### R2 — ALIMENTATION (perte secteur)
| Cause | Gravité | Probabilité | Mitigation |
|-------|---------|-------------|------------|
| Coupure secteur | MODÉRÉ | Occasionnel | **L1** Esclave en mode dégradé NVS (reprend au retour courant) |
| | | | **L2** DS3231 pile CR2032 conserve l'heure (maître) |
| | | | **L3** NVS conserve toute la config (survit power cycle) |
| | | | **L4** Pull-down 10kΩ MOSFET → pompe OFF au reboot |
| Surtension secteur | FAIBLE | Très faible | **L1** Chargeur USB avec protection intégrée |
| | | | **L2** Fusible 3A sur ligne pompe |

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

### R6 — SOUS-ARROSAGE / PERTE DE PLANTES (absence prolongée)
| Cause | Gravité | Probabilité | Mitigation |
|-------|---------|-------------|------------|
| Stockage eau insuffisant | MODÉRÉ | Moyenne | **L1** AutonomyCalculator: `/autonomy N` avant départ |
| | | | **L2** Alerte Telegram si déficit détecté |
| | | | **L3** Durée cycle adaptative (optimise la consommation) |
| Profil hydrique incorrect | MODÉRÉ | Moyenne | **L1** 7 catégories prédéfinies calibrées Mougins |
| | | | **L2** Apprentissage taux assèchement (auto-correction) |
| Goutteur bouché | MODÉRÉ | Moyenne | **L1** Alerte pot chroniquement sec (6 lectures) |
| | | | **L2** Telegram nomme le pot exact à vérifier |
| Capteur HS (valeur fixe) | FAIBLE | Faible | **L1** Capteur marqué invalid si hors range |
| | | | **L2** Exclu de la moyenne zone |

## Architecture de Sécurité en Couches

```
COUCHE 6 — PRÉDICTION (AutonomyCalculator, PlantProfile)
    ↑ anticipe les problèmes avant qu'ils arrivent
COUCHE 5 — MONITORING (Telegram alertes, dashboard TFT 7 écrans)
    ↑ détecte anomalies, notifie l'humain
COUCHE 4 — FIRMWARE (failsafes logiciels, watchdog, durée adaptative)
    ↑ 6 failsafes actifs, max runtime, seuils par pot
COUCHE 3 — RELAIS SÉCURITÉ (coupure HW maître)
    ↑ coupe pompe B si MCU non-responsive
COUCHE 2 — PROTECTION PASSIVE (fusible 3A, pull-down 10kΩ)
    ↑ pompe OFF au boot/crash, protection surintensité
COUCHE 1 — ALIMENTATION (USB secteur, chargeur protégé)
    ↑ pas de batterie = pas de risque thermique/emballement
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

## Disposition Physique — Deux Boîtiers USB Secteur

### Boîtier 1 — Maître (intérieur appartement)
- Dimensions: 200×150×85mm, ABS (pas IP65 — intérieur)
- Contenu: ESP32 maître + breakout, MUX, MOSFET D4184, relais sécurité, LED RGB, bouton, LCD TFT 2.4"
- Alimenté: USB 5V secteur (chargeur standard)
- Réservoir intérieur 25L à proximité

### Boîtier 2 — Esclave (balcon IP65 blanc)
- Dimensions: 200×150×85mm, ABS BLANC, IP65
- Contenu: ESP32 esclave + breakout, MUX, MOSFET D4184, LED RGB, BME280, INA219
- Presse-étoupes: PG7 (capteurs), PG9 (pompe), PG11 (USB)
- Alimenté: USB 5V secteur via prise balcon
- Fusible 3A inline sur ligne pompe
- Réservoirs balcon 2×25L à proximité

### ~~Boîtier énergie~~ SUPPRIMÉ
Plus besoin de boîtier énergie séparé — pas de batterie, pas de solaire, pas de MPPT.
**Risque thermique batterie ÉLIMINÉ** — c'était le risque principal du projet.

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
