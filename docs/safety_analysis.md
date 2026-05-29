# Analyse de Sécurité — Balcony Hydra v4

> Système autonome sans surveillance · 2× USB secteur (maître intérieur + esclave balcon) · Eau + électricité
> Approche: **défense en profondeur** — chaque risque couvert par au moins 2 couches indépendantes
> Architecture distribuée: 2× ESP32 communiquant par ESP-NOW + MQTT fallback

## Architecture de Sécurité en Couches

```
COUCHE 6 — PRÉDICTION (AutonomyCalculator, PlantProfile)
    ↑ anticipe les problèmes avant qu'ils arrivent
COUCHE 5 — MONITORING (Telegram alertes, dashboard TFT 7 écrans, Web API)
    ↑ détecte anomalies, notifie l'humain, permet /unlock distant
COUCHE 4 — FIRMWARE (SafetyManager maître + SafetyLocal esclave, failsafes PumpController)
    ↑ 6 failsafes actifs, max runtime, seuils par pot, boot crash detection
COUCHE 3 — RELAIS SÉCURITÉ (double verrou MAÎTRE uniquement)
    ↑ coupe pompe B si MCU non-responsive. ABSENT côté esclave.
COUCHE 2 — PROTECTION PASSIVE (fusible 3A, pull-down 10kΩ MOSFET)
    ↑ pompe OFF au boot/crash, protection surintensité — maître ET esclave
COUCHE 1 — ALIMENTATION (USB 5V secteur × 2, chargeurs protégés)
    ↑ pas de batterie = pas de risque thermique/emballement (risque majeur v3 éliminé)
```

## Seuils chiffrés SafetyManager / SafetyLocal

Toutes les valeurs proviennent de `firmware/common/config_common.h` et `config_master.h` / `config_slave.h`.

| Paramètre | Valeur | Comportement | Source |
|-----------|--------|--------------|--------|
| Thermal WARNING | 50 °C | LED jaune + alerte Telegram (non-bloquant) | `SAFETY_TEMP_WARNING_C` |
| Thermal CRITICAL (lockout) | 58 °C | Relay désarmé, pompe OFF, LED rouge, Telegram 🔴 | `SAFETY_TEMP_CRITICAL_C` |
| Thermal RESUME | 45 °C pendant **5 min stable** | Auto-réarm + Telegram ✅. Si T° remonte pendant cooling → timer reset | `SAFETY_TEMP_RESUME_C` + `SAFETY_COOLDOWN_MS` |
| Overcurrent pompe | > 3 A | STOP + **hard lockout** (nécessite `/unlock` Telegram ou bouton) | `PUMP_OVERCURRENT_MA=3000` |
| Dry-run pompe | < 50 mA après 3 s | STOP + **hard lockout** | `PUMP_DRY_RUN_MA=50`, `PUMP_DRY_RUN_DELAY_MS=3000` |
| Runtime max par cycle | 300 s | STOP (anti-inondation, pas de lockout) | `PUMP_MAX_RUNTIME_S=300` |
| Tank critique | < 10 % | STOP + failsafe zone concernée — auto-recovery si niveau remonte > 10 % | `TANK_CRITICAL_PCT=10` |
| Cooldown AUTO | 2 h | Min entre 2 cycles en mode automatique | `AUTO_COOLDOWN_S=7200` |
| Max cycles / 24 h | 4 | Anti-spam mode AUTO, reset toutes les 24 h | `AUTO_MAX_CYCLES_PER_DAY=4` |
| Boot crash threshold | 3 | Safe mode au 3ᵉ crash en < 60 s de boot stable | `SAFETY_MAX_BOOT_CRASHES=3` |
| Boot stable timeout | 60 s | Compteur crash reset après 60 s de marche nominale | `SAFETY_STABLE_BOOT_MS=60000` |

> **Divergence US > 15 %** : failsafe de l'ère v3 (2 capteurs US par zone) — **retiré en v4** et non applicable. L'architecture v4 n'a qu'**un seul capteur US par zone** (Zone A : 1 US sur le bidon de tête des 2×25 L en vases communicants ; Zone B : 1 US sur le réservoir 25 L). Plus aucune mention dans `CLAUDE.md` ni dans le firmware. Aucune action requise.

## Asymétrie Maître / Esclave

Les deux ESP32 n'ont **pas** la même défense en profondeur. Distinction explicite :

| Couche | Maître (intérieur) | Esclave (balcon) |
|--------|--------------------|--------------------|
| 1 — Alimentation | USB 5V secteur, chargeur protégé | USB 5V secteur (prise balcon), chargeur protégé |
| 2 — Protection passive | Fusible 3A pompe B + pull-down 10kΩ MOSFET GPIO 27 | Fusible 3A pompe A + pull-down 10kΩ MOSFET GPIO 27 |
| 3 — Relais sécurité | ✅ Relay GPIO 18 arme la pompe B (double verrou SafetyManager + PumpController) | ❌ **AUCUN relay** — protection pompe A = MOSFET + fusible + firmware uniquement |
| 4 — Firmware | `SafetyManager` complet : thermal, boot crash, overcurrent, dry-run, unlock | `SafetyLocal` : boot crash, runtime, overcurrent, dry-run. **PAS de thermal lockout** (pas de BME280 sur maître) |
| 5 — Monitoring | Telegram bot + WebPortal + MQTT + TFT 7 écrans + LED RGB | LED RGB + remontée DATA_* vers maître |
| 6 — Prédiction | PlantProfile + AutonomyCalculator + WiFiGeolocation | — |

> **Implication opérationnelle :** la pompe balcon (zone A) ne peut être coupée à distance que par le **firmware** esclave. En cas de crash firmware esclave, seuls le pull-down MOSFET (reboot) et le fusible 3A (surintensité) protègent. Pas de filet de sécurité matériel équivalent au relay maître.

## Politique de Réarmement

Système autonome sans surveillance → politique explicite en 3 niveaux.

### Auto-recovery (le système se réarme seul)
| Événement | Condition de recovery | Notification |
|-----------|----------------------|--------------|
| Thermal lockout (T° > 58 °C) | T° < 45 °C **stable pendant 5 min** | Telegram ✅🌡 |
| Tank critique (< 10 %) | Niveau remonte > 10 % | Telegram ✅💧 |
| WiFi perdu | Reconnexion backoff exponentiel 10→60 s, retry depuis AP toutes les 2 min | Log série |
| 1-2 boot crashes | Reboot propre, compteur incrémenté, reset à 0 après 60 s stable | Log série |

### Hard lockout (nécessite `/unlock` Telegram OU bouton physique)
| Événement | Raison | Recovery |
|-----------|--------|----------|
| Overcurrent pompe (> 3 A) | Problème mécanique probable (pompe bloquée) | `/unlock` Telegram ou POST `/api/safety/unlock` |
| Dry-run pompe (< 50 mA après 3 s) | Problème hydraulique probable (marche à sec) | `/unlock` Telegram |
| 3+ boot crashes | Safe mode — WiFi + Telegram restent actifs pour `/unlock` distant | `/unlock` Telegram |

### Irréversible (remplacement physique)
| Composant | Condition |
|-----------|-----------|
| Fusible 3A pompe (maître ou esclave) | Grillé → à remplacer |

## Matrice de Risques

### R1 — INONDATION (pompe bloquée ON)
| Cause | Gravité | Probabilité | Mitigation |
|-------|---------|-------------|------------|
| Firmware freeze (watchdog fail) | CRITIQUE | Faible | **L1** Pull-down HW 10kΩ (pompe OFF si MCU reset) — maître ET esclave |
| | | | **L2** Max runtime firmware 300s → coupure auto |
| | | | **L3** Watchdog HW 30s → reset MCU → pompe OFF (pull-down) |
| | | | **L4** Relais sécurité coupe 12V pompe B (maître uniquement — **pas de L4 côté esclave**) |
| GPIO 27 court-circuit HIGH | CRITIQUE | Très faible | **L1** Pull-down HW 10kΩ force LOW |
| | | | **L2** Fusible 3A sur ligne pompe |
| MOSFET claqué passant | CRITIQUE | Très faible | **L1** Fusible 3A coupe le courant |
| | | | **L2** (maître) Relay sécurité en série avec MOSFET |
| Overcurrent mécanique | CRITIQUE | Faible | **L1** Hard lockout firmware à > 3 A (nécessite `/unlock`) |

### R2 — ALIMENTATION (perte secteur)
| Cause | Gravité | Probabilité | Mitigation |
|-------|---------|-------------|------------|
| Coupure secteur prise balcon ou intérieur | MODÉRÉ | Occasionnel | **L1** NVS conserve toute la config (survit power cycle) |
| | | | **L2** Esclave reprend en `DegradedMode` au retour secteur (arrosage continue sur schedule NVS) |
| | | | **L3** DS3231 pile CR2032 conserve l'heure (maître) |
| | | | **L4** Pull-down 10kΩ MOSFET → pompe OFF au reboot |
| Surtension secteur | FAIBLE | Très faible | **L1** Chargeur USB 5V 2A avec protection intégrée |

### R3 — DÉGÂT DES EAUX (fuite hydraulique)
| Cause | Gravité | Probabilité | Mitigation |
|-------|---------|-------------|------------|
| Tube déconnecté | MODÉRÉ | Moyenne | **L1** Colliers inox sur tous les raccords |
| | | | **L2** Max runtime pompe 300s |
| | | | **L3** Volume max par cycle ≤ 1 L (pompe péristaltique 4-8 L/h × 300s = 0.33-0.67 L) |
| Raccord bidon fuit | MODÉRÉ | Faible | **L1** Joints EPDM + serrage |
| | | | **L2** Volume total limité à 75 L (pas raccordé au réseau) |
| Goutteur bouché → pression | FAIBLE | Moyenne | **L1** Goutteurs auto-compensants (soupape naturelle) |
| | | | **L2** Pompe basse pression (0.5-1 bar max) |

### R4 — INCENDIE ÉLECTRIQUE
| Cause | Gravité | Probabilité | Mitigation |
|-------|---------|-------------|------------|
| Court-circuit câblage pompe | GRAVE | Très faible | **L1** Fusible 3A inline ligne pompe (maître et esclave) |
| | | | **L2** Boîtier ABS (intérieur) / ABS IP65 (esclave) |
| | | | **L3** Câbles silicone haute température sur lignes 12V |
| Échauffement connecteur | MODÉRÉ | Faible | **L1** Wago 221 certifiés 20A / 85°C |
| | | | **L2** Sections câble adaptées (22AWG signal, 18AWG puissance) |

> Risques batterie/solaire (BMS, MPPT, emballement thermique LiFePO4, fusible thermique 72°C) **éliminés** par l'architecture v4 USB secteur. Voir `docs/legacy/` pour l'analyse v3.

### R5 — PANNE FIRMWARE / SOFTWARE
| Cause | Gravité | Probabilité | Mitigation |
|-------|---------|-------------|------------|
| Crash firmware | MODÉRÉ | Moyenne | **L1** Watchdog HW 30s → auto-reset |
| | | | **L2** Pull-down HW pompe → OFF au reset |
| | | | **L3** Safe mode si 3 crashes en < 60 s de boot stable (WiFi + Telegram restent actifs pour `/unlock`) |
| WiFi routeur perdu | FAIBLE | Fréquent | **L1** Reconnexion backoff exponentiel 10→60 s |
| | | | **L2** Retry STA depuis AP mode toutes les 2 min |
| | | | **L3** `ESP-NOW` peer-to-peer continue indépendamment du routeur |
| | | | **L4** Mode dégradé local esclave (arrosage continue) |
| Lien maître ↔ esclave perdu | MODÉRÉ | Faible | **L1** Fallback MQTT si ESP-NOW échoue |
| | | | **L2** `DegradedMode` esclave si les deux canaux perdus |
| | | | **L3** Alerte Telegram maître "Esclave non-responsive" après 3 PING sans PONG |
| NVS corrompue | MODÉRÉ | Très faible | **L1** Defaults safe si lecture NVS échoue |
| | | | **L2** Factory reset via bouton (appui long 10s) ou CLI série slave |

### R6 — SOUS-ARROSAGE / PERTE DE PLANTES (absence prolongée)
| Cause | Gravité | Probabilité | Mitigation |
|-------|---------|-------------|------------|
| Stockage eau insuffisant | MODÉRÉ | Moyenne | **L1** AutonomyCalculator: `/autonomy N` avant départ |
| | | | **L2** Alerte Telegram si déficit détecté |
| | | | **L3** Durée cycle adaptative (optimise la consommation) |
| | | | **L4** Cooldown 2 h + max 4 cycles/24 h évitent le gaspillage |
| Profil hydrique incorrect | MODÉRÉ | Moyenne | **L1** 7 catégories prédéfinies calibrées Mougins (43.61°N) |
| | | | **L2** Apprentissage taux assèchement (auto-correction) |
| Goutteur bouché | MODÉRÉ | Moyenne | **L1** Alerte pot chroniquement sec (6 lectures consécutives) |
| | | | **L2** Telegram nomme le pot exact à vérifier |
| Capteur HS (valeur fixe) | FAIBLE | Faible | **L1** Capteur marqué invalid si hors range |
| | | | **L2** Exclu de la moyenne zone |

## Composants de Sécurité

| Composant | Fonction | Indépendant du firmware | Localisation |
|-----------|----------|------------------------|--------------|
| Fusible 3A (ligne pompe) × 2 | Protection pompe bloquée / court-circuit | ✅ OUI | Boîtier maître + boîtier esclave |
| Pull-down 10kΩ MOSFET × 2 | Pompe OFF si MCU crash/reset | ✅ OUI | Boîtier maître + boîtier esclave |
| Relay sécurité (GPIO 18) | Coupe 12V pompe B, double verrou | ⚠ Piloté firmware | Boîtier maître uniquement |
| LED RGB × 2 | État visuel du système | Non (informatif) | Boîtier maître + boîtier esclave |
| Bouton physique IP67 | Feedback local + unlock + factory reset | Non (firmware) | Boîtier maître |

## Disposition Physique — Deux Boîtiers USB Secteur

### Boîtier 1 — Maître (intérieur appartement)
- Dimensions: 200×150×85mm, ABS (pas IP65 — intérieur)
- Contenu: ESP32 maître + breakout, MUX, MOSFET D4184 (pompe B), relay sécurité, LED RGB (GPIO 16/17/2), bouton, LCD TFT 2.4" ILI9341 + XPT2046, DS3231
- Alimenté: USB 5V secteur (chargeur standard)
- Réservoir intérieur 25 L à proximité

### Boîtier 2 — Esclave (balcon IP65 blanc)
- Dimensions: 200×150×85mm, ABS BLANC, IP65
- Contenu: ESP32 esclave + breakout, MUX, MOSFET D4184 (pompe A), LED RGB (GPIO 17/19/23), BME280, INA219
- Presse-étoupes: PG7 (capteurs), PG9 (pompe), PG11 (USB)
- Alimenté: USB 5V secteur via prise balcon
- Fusible 3A inline sur ligne pompe
- Réservoirs balcon 2×25 L en vases communicants à proximité
- **Pas de relay sécurité** (voir Asymétrie maître/esclave)

### Boîtier énergie : SUPPRIMÉ
Architecture v4 = USB secteur × 2. Plus besoin de boîtier énergie séparé : pas de batterie, pas de solaire, pas de MPPT.
**Risque thermique batterie éliminé** — c'était le risque principal du projet v3.

## Code Couleur LED RGB

| Couleur | Pattern | Signification |
|---------|---------|---------------|
| Vert fixe | Allumé continu | Système OK, idle |
| Vert pulse | Respiration lente (2s) | Système OK |
| Bleu fixe | Allumé continu | WiFi AP mode (config) OU esclave en attente de pairing |
| Bleu clignotant | 500ms on/off | Connexion WiFi en cours |
| Cyan fixe | Allumé continu | Arrosage en cours (pompe ON) |
| Jaune clignotant | 1s on/off | Alerte (réservoir bas, capteur HS, T° haute 50°C, lien maître perdu côté esclave) |
| Rouge fixe | Allumé continu | Failsafe actif (pompe bloquée) |
| Rouge clignotant rapide | 200ms on/off | Erreur critique (T° > 58°C, hard lockout, 3+ boot crashes) |
| Blanc flash | 3× 100ms | Bouton pressé (feedback) |
| Éteinte | OFF | MCU non alimenté |
