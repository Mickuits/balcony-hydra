# Test Matrix — Balcony Hydra v4

> Matrice de tests dérivée des diagrammes SysML/UML (docs/hydra-sysml-diagrams.jsx)
> Chaque test référence le diagramme source pour traçabilité
> Status: 🔲 à faire | ✅ passé | ❌ échoué | ⏭ non applicable

## T1 — Communication Maître ↔ Esclave
> Source: diagramme Séquence (seq) + IBD (ibd)

| ID | Test | Préconditions | Étapes | Résultat attendu | Status |
|----|------|---------------|--------|-------------------|--------|
| T1.01 | Pairing ESP-NOW au boot | 2 ESP32 flashés, MAC configuré | Boot maître → boot esclave → CMD_PING | DATA_PONG reçu <5s, RSSI affiché | 🔲 |
| T1.02 | Cycle capteurs normal 30s | Comm ESP-NOW établie | Attendre 60s | ≥2 DATA_SENSORS reçus, JSON valide | 🔲 |
| T1.03 | Heartbeat PING/PONG 60s | Comm établie | Attendre 3 min | ≥3 PING envoyés, ≥3 PONG reçus | 🔲 |
| T1.04 | Commande pompe distante | Comm établie | Maître → CMD_PUMP_START {60s} | Esclave démarre pompe A, DATA_ACK reçu | 🔲 |
| T1.05 | Stop pompe distant | Pompe A en marche | Maître → CMD_PUMP_STOP | Pompe A s'arrête, DATA_PUMP_STATUS reçu | 🔲 |
| T1.06 | Fallback MQTT quand ESP-NOW échoue | Routeur WiFi actif | Brouiller ESP-NOW (distance/obstacle) | Bascule MQTT, commandes passent via broker | 🔲 |
| T1.07 | Double perte (ESP-NOW + MQTT) | Les deux comm coupées | Couper routeur + éloigner esclave | Maître alerte Telegram "non-responsive" | 🔲 |
| T1.08 | Recovery après perte comm | Mode dégradé actif | Rétablir ESP-NOW | DATA_PONG reçu, données accumulées sync | 🔲 |
| T1.09 | Chiffrement ESP-NOW | Comm établie | Sniffer WiFi 2.4GHz | Payload chiffré, pas lisible en clair | 🔲 |
| T1.10 | Latence ESP-NOW | Comm établie | Mesurer RTT PING→PONG ×100 | Moyenne <10ms, max <50ms | 🔲 |

## T2 — Mode Dégradé Esclave
> Source: diagramme Séq. Dégradé (seq-degrade) + STM Safety (stm-safety)

| ID | Test | Préconditions | Étapes | Résultat attendu | Status |
|----|------|---------------|--------|-------------------|--------|
| T2.01 | Entrée mode dégradé | Comm active | Couper maître (débrancher) | Après 3 PING manqués (180s), LED jaune clignotant | 🔲 |
| T2.02 | Arrosage local NVS | Mode dégradé, config NVS valide | Sol sec (humidité < seuil NVS) | Pompe A s'active selon config NVS | 🔲 |
| T2.03 | Cooldown respecté en dégradé | Mode dégradé | 2 arrosages consécutifs | 2ème arrosage refusé si <2h | 🔲 |
| T2.04 | Max cycles en dégradé | Mode dégradé | Déclencher 5 cycles | 5ème cycle refusé (max 4/24h) | 🔲 |
| T2.05 | Failsafes locaux en dégradé | Mode dégradé, pompe A en marche | Vider réservoir pendant pompage | Pompe A s'arrête (tank <10%), BLOCK | 🔲 |
| T2.06 | Recovery et resync | Mode dégradé depuis >1h | Rebrancher maître | PONG envoyé, buffer données remontées | 🔲 |
| T2.07 | NVS config invalide/vide | NVS vierge | Couper comm avant 1er CMD_SET_CONFIG | Esclave utilise defaults safe (pas d'arrosage) | 🔲 |

## T3 — Arrosage Mode AUTO
> Source: diagramme Activité (act) + STM Pompe (stm-pump)

| ID | Test | Préconditions | Étapes | Résultat attendu | Status |
|----|------|---------------|--------|-------------------|--------|
| T3.01 | Déclenchement zone A seule | Mode AUTO, zone B hum OK | Zone A hum < seuil min | Pompe A démarre, pompe B reste OFF | 🔲 |
| T3.02 | Déclenchement zone B seule | Mode AUTO, zone A hum OK | Zone B hum < seuil min | Pompe B démarre, pompe A reste OFF | 🔲 |
| T3.03 | Deux zones simultanées | Mode AUTO, les 2 zones sèches | Les 2 hum < seuil | Les 2 pompes démarrent indépendamment | 🔲 |
| T3.04 | Pas de déclenchement si hum OK | Mode AUTO, hum 50% | Attendre 5 min | Aucune pompe ne démarre | 🔲 |
| T3.05 | Cooldown 2h respecté | Mode AUTO | Arrosage zone A → attendre 1h → sol sec | Pas d'arrosage (cooldown actif, log série) | 🔲 |
| T3.06 | Cooldown expiré | Mode AUTO | Arrosage → attendre 2h01 → sol sec | Arrosage déclenché | 🔲 |
| T3.07 | Max 4 cycles/24h | Mode AUTO | Déclencher 4 cycles zone A en 24h | 5ème cycle refusé, log "max cycles atteint" | 🔲 |
| T3.08 | Reset compteur 24h | Mode AUTO, 4 cycles atteints | Attendre 24h | Compteur remis à 0, arrosage possible | 🔲 |
| T3.09 | Durée cycle correcte | Mode AUTO, duration=60s | Déclencher arrosage | Pompe tourne exactement 60s ±2s | 🔲 |
| T3.10 | Telegram notifie arrosage | Mode AUTO | Arrosage zone A déclenché | Telegram reçoit "🌱 AUTO Balcon: hum XX%" | 🔲 |

## T4 — Arrosage Modes SCHEDULED / SOLAR / MANUAL
> Source: diagramme Activité (act) + Use Cases (uc)

| ID | Test | Préconditions | Étapes | Résultat attendu | Status |
|----|------|---------------|--------|-------------------|--------|
| T4.01 | SCHEDULED: heure correcte | Mode SCHEDULED, schedule 07:00 | Attendre 07:00 | Les 2 pompes démarrent | 🔲 |
| T4.02 | SCHEDULED: hors horaire | Mode SCHEDULED | Vérifier hors schedule | Pas d'arrosage | 🔲 |
| T4.03 | SOLAR: coucher + offset | Mode SOLAR, offset +30min | Coucher 20:45 → attendre 21:15 | Arrosage déclenché | 🔲 |
| T4.04 | SOLAR: lever du soleil | Mode SOLAR, sunrise enabled | Lever 06:12 → vérifier | Arrosage déclenché à 06:12 | 🔲 |
| T4.05 | SOLAR: calcul NOAA correct | TimeManager, Mougins coords | Comparer vs éphéméride en ligne | Écart < 3 min lever/coucher | 🔲 |
| T4.06 | SOLAR: recalcul quotidien | TimeManager | Laisser tourner 48h | Lever/coucher change chaque jour | 🔲 |
| T4.07 | MANUAL: pas d'auto-arrosage | Mode MANUAL | Sol sec, attendre 1h | Aucun arrosage | 🔲 |
| T4.08 | MANUAL: bouton physique | Mode MANUAL | Presser bouton | Pompe démarre, LED cyan, feedback blanc ×3 | 🔲 |
| T4.09 | MANUAL: Telegram /water | Mode MANUAL | Envoyer /water | Les 2 pompes démarrent | 🔲 |
| T4.10 | Fallback sans NTP | WiFi jamais connecté | Boot sans routeur | Arrosage millis() fallback (SCHED/SOLAR ignorés) | 🔲 |

## T5 — Sécurité SafetyManager
> Source: diagramme STM Safety (stm-safety) + IBD (ibd)

| ID | Test | Préconditions | Étapes | Résultat attendu | Status |
|----|------|---------------|--------|-------------------|--------|
| T5.01 | Thermal warning 50°C | BME280 branché | Chauffer à 50°C (sèche-cheveux) | LED jaune, alerte Telegram ⚠🌡 | 🔲 |
| T5.02 | Thermal lockout 58°C | T° montante | Chauffer à 58°C | Relay désarmé, pompe OFF, LED rouge, Telegram 🔴🌡 | 🔲 |
| T5.03 | Thermal auto-recovery | T° redescend < 45°C | Laisser refroidir | Timer 5 min → auto-réarm → Telegram ✅🌡 | 🔲 |
| T5.04 | Thermal recovery reset si T° remonte | Cooling down (timer 5 min) | Réchauffer à 47°C pendant cooling | Timer 5 min repart de zéro | 🔲 |
| T5.05 | Overcurrent hard lockout | Pompe en marche | Simuler >3A (résistance faible) | STOP + hard lockout + Telegram ⚡ | 🔲 |
| T5.06 | Dry-run hard lockout | Pompe en marche, pas d'eau | Réservoir vide + pas de tube | <50mA après 3s → STOP + hard lockout | 🔲 |
| T5.07 | Remote unlock Telegram | Hard lockout actif | Envoyer /unlock | Lockout levé, Telegram ✅ Déverrouillé | 🔲 |
| T5.08 | Remote unlock refusé si auto | Lockout AUTO (thermal) | Envoyer /unlock | "Lockout auto-recovery en cours" | 🔲 |
| T5.09 | Boot crash detection | ESP32 opérationnel | Reset 3× en 30s (bouton reset) | Safe mode, LED rouge clignotant rapide | 🔲 |
| T5.10 | Safe mode WiFi+TG actifs | Safe mode | Vérifier WiFi + envoyer /status | WiFi connecté, Telegram répond | 🔲 |
| T5.11 | Safe mode unlock distant | Safe mode | Envoyer /unlock | Sort du safe mode, pompes opérationnelles | 🔲 |
| T5.12 | Boot stable reset compteur | Boot normal | Laisser tourner 60s | Compteur crash NVS remis à 0 | 🔲 |
| T5.13 | Tank auto-recovery | Tank failsafe actif (zone A) | Remplir réservoir > 10% | Auto-reset failsafe, Telegram ✅💧 | 🔲 |
| T5.14 | Double verrou pompe | SafetyManager + PumpController | Essayer start() sans armPump() | Pompe ne démarre pas | 🔲 |
| T5.15 | Relay fail-safe MCU crash | Relay armé, pompe en marche | Reset ESP32 (bouton reset) | Relay retombe ouvert → pompe OFF | 🔲 |

## T6 — Hardware & Sécurité Passive
> Source: diagramme Déploiement (deploy) + Safety Analysis

| ID | Test | Préconditions | Étapes | Résultat attendu | Status |
|----|------|---------------|--------|-------------------|--------|
| T6.01 | Pull-down 10kΩ au boot | MOSFET wired avec pull-down | Power cycle ESP32 | Pompe reste OFF pendant boot (0V gate) | 🔲 |
| T6.02 | Fusible 3A pompe | Pompe branchée | Court-circuiter sortie pompe | Fusible 3A grille, pompe coupée | 🔲 |
| T6.03 | ~~SUPPRIMÉ~~ (pas de batterie) | — | — | — | ⏭ |
| T6.04 | ~~SUPPRIMÉ~~ (pas de batterie) | — | — | — | ⏭ |
| T6.05 | Boîtier IP65 étanchéité | Boîtier esclave fermé | Arroser au jet (simulation pluie) | Pas d'infiltration d'eau | 🔲 |
| T6.06 | ~~SUPPRIMÉ~~ (pas de boîtier énergie) | — | — | — | ⏭ |
| T6.07 | ~~SUPPRIMÉ~~ (pas de boîtier énergie) | — | — | — | ⏭ |
| T6.08 | Wago 221 tenue mécanique | Câbles connectés | Tirer sur chaque fil | Aucun fil ne se déconnecte | 🔲 |

## T7 — Interface Utilisateur
> Source: diagramme Use Cases (uc) + BDD (bdd)

| ID | Test | Préconditions | Étapes | Résultat attendu | Status |
|----|------|---------------|--------|-------------------|--------|
| T7.01 | TFT dashboard boot | Premier boot maître | Observer écran | Écran principal affiché (hum, tank, T°, heure) | 🔲 |
| T7.02 | Config WiFi écran tactile | Pas de WiFi configuré | Boot → écran config WiFi | Scan réseaux, clavier virtuel, connexion | 🔲 |
| T7.03 | Navigation tactile entre écrans | TFT actif | Swipe ou boutons navigation | 5 écrans accessibles sans bug | 🔲 |
| T7.04 | Portail web accessible | WiFi STA connecté | Naviguer http://hydra.local | Dashboard web s'affiche, données live | 🔲 |
| T7.05 | API REST /api/sensors | WiFi connecté | GET /api/sensors | JSON 200 OK, données 2 zones | 🔲 |
| T7.06 | API REST /api/safety | WiFi connecté | GET /api/safety/status | JSON SafetyManager complet | 🔲 |
| T7.07 | API POST /api/safety/unlock | Hard lockout actif | POST /api/safety/unlock | Lockout levé, 200 OK | 🔲 |
| T7.08 | Telegram /status | Bot configuré | Envoyer /status | Réponse complète 2 zones + sécurité | 🔲 |
| T7.09 | Telegram /safety | Bot configuré | Envoyer /safety | JSON SafetyManager détaillé | 🔲 |
| T7.10 | Telegram /unlock | Hard lockout | Envoyer /unlock | Lockout levé + confirmation | 🔲 |
| T7.11 | Telegram heartbeat 12h | Bot configuré | Attendre 12h | Heartbeat reçu avec résumé système | 🔲 |
| T7.12 | OTA firmware update | WiFi connecté | pio run -t upload --upload-port hydra.local | Flash OK, pompe OFF pendant update, reboot | 🔲 |
| T7.13 | LED RGB 10 états | Système actif | Provoquer chaque état | Couleur/pattern correct pour chaque état | 🔲 |
| T7.14 | Bouton feedback | Système idle | Presser bouton | Flash blanc ×3 + pompe toggle | 🔲 |
| T7.15 | Bouton en lockout | Hard lockout actif | Presser bouton | Flash rouge erreur, pas de pompe | 🔲 |

## T8 — Capteurs & Alertes par Pot
> Source: diagramme IBD (ibd) + BDD (bdd)

| ID | Test | Préconditions | Étapes | Résultat attendu | Status |
|----|------|---------------|--------|-------------------|--------|
| T8.01 | 20 capteurs humidité lus | MUX1 + MUX2 branchés | Lire tous les capteurs | 20 valeurs 0-100%, JSON valide | 🔲 |
| T8.02 | Moyenne par zone correcte | 10 capteurs/zone | Varier humidité par zone | Moyennes zone A ≠ zone B | 🔲 |
| T8.03 | Capteur déconnecté détecté | 1 capteur débranché | Lecture cycle | Capteur marqué invalid, exclu de la moyenne | 🔲 |
| T8.04 | Alerte pot chroniquement sec | 1 pot sec, goutteur bouché | 6 lectures consécutives < seuil | Telegram "⚠ Pot #7 chroniquement sec" | 🔲 |
| T8.05 | Alerte reset après arrosage | Pot alerté, puis arrosé | Humidité remonte > seuil | alertSent reset, plus d'alerte | 🔲 |
| T8.06 | Capteur US niveau réservoir | Bidon rempli à 50% | Lire US | Niveau affiché 45-55% (±5%) | 🔲 |
| T8.07 | US médiane anti-bruit | Capteur US | 5 lectures rapides | Valeur médiane stable, pas de spike | 🔲 |
| T8.08 | BME280 T° HR pression | BME280 branché I2C | Lecture | T° ±1°C vs thermomètre référence | 🔲 |
| T8.09 | INA219 courant pompe | Pompe en marche | Lecture INA219 | Courant 200-800mA (pompe péristaltique) | 🔲 |
| T8.10 | DS3231 survit power cycle | Heure synchronisée | Power cycle ESP32 | Heure correcte au reboot (pile CR2032) | 🔲 |

## T9 — Robustesse WiFi & Réseau
> Source: diagramme Séquence (seq) + STM Safety (stm-safety)

| ID | Test | Préconditions | Étapes | Résultat attendu | Status |
|----|------|---------------|--------|-------------------|--------|
| T9.01 | Reconnexion WiFi après coupure | WiFi STA connecté | Couper routeur 5 min → rallumer | Reconnexion auto <60s (backoff exp.) | 🔲 |
| T9.02 | AP mode retry STA 2 min | Mode AP (routeur jamais vu) | Allumer routeur | Connexion STA depuis AP en <2 min | 🔲 |
| T9.03 | Arrosage sans WiFi | WiFi non disponible | Sol sec, mode AUTO | Arrosage fonctionne (capteurs filaires) | 🔲 |
| T9.04 | Telegram après reconnexion | WiFi perdu puis retrouvé | Provoquer alerte | Alerte Telegram envoyée normalement | 🔲 |
| T9.05 | MQTT reconnexion broker | Broker temporairement down | Attendre broker up | Auto-reconnexion, publish reprend | 🔲 |
| T9.06 | NTP sync après WiFi | WiFi se connecte | Boot sans WiFi → WiFi connect | NTP sync → DS3231 mis à jour | 🔲 |
| T9.07 | mDNS hydra.local | WiFi STA connecté | ping hydra.local | Résolution OK | 🔲 |
| T9.08 | WiFi + ESP-NOW coexistence | Les deux actifs | WiFi STA + ESP-NOW simultanés | Pas de conflit, les deux fonctionnent | 🔲 |

## T10 — Profils Hydriques & Durée Cycle Adaptative
> Source: diagramme BDD (bdd) + Activité (act)

| ID | Test | Préconditions | Étapes | Résultat attendu | Status |
|----|------|---------------|--------|-------------------|--------|
| T10.01 | Création profil citronnier | Portail web ou API | Créer profil: CITRUS, pot 30L, goutteur 8L/h | Profil sauvé NVS, visible /profiles | 🔲 |
| T10.02 | Création profil succulente | Portail web ou API | Créer profil: SUCCULENT, pot 3L, goutteur 2L/h | Profil sauvé NVS | 🔲 |
| T10.03 | Coefficient saisonnier correct | Profil CITRUS créé | Interroger coeff pour janvier vs août | Jan≈0.10, Aoû≈1.00 | 🔲 |
| T10.04 | Volume eau calculé été | Profil CITRUS 30L, mois=août | computeWaterVolumeML() | ≈500mL (base 500 × √3 × 1.0) | 🔲 |
| T10.05 | Volume eau calculé hiver | Profil CITRUS 30L, mois=janvier | computeWaterVolumeML() | ≈50mL (base 500 × √3 × 0.10) | 🔲 |
| T10.06 | Durée cycle été citronnier | Profil CITRUS 30L goutteur 8L/h, août | computeCycleDurationS() | ≈225s (500mL ÷ 2.22mL/s) | 🔲 |
| T10.07 | Durée cycle hiver citronnier | Même profil, janvier | computeCycleDurationS() | ≈22s (50mL ÷ 2.22mL/s) | 🔲 |
| T10.08 | Durée zone = MAX des pots | 10 profils variés zone A | computeZoneCycleDurationS() | = durée du pot le plus long | 🔲 |
| T10.09 | Plancher durée 5s | Succulente hiver, très peu d'eau | computeCycleDurationS() | ≥ 5s (plancher) | 🔲 |
| T10.10 | Plafond durée 300s | Gros pot, gros besoin | computeCycleDurationS() | ≤ 300s (PUMP_MAX_RUNTIME_S) | 🔲 |
| T10.11 | Seuil override par pot | Profil citronnier moistureMin=40 | effectiveMinThreshold(zone, pot, 30) | Retourne 40 (pas 30 global) | 🔲 |
| T10.12 | NVS persistence profils | Profils créés | Power cycle ESP32 | Profils rechargés identiques | 🔲 |
| T10.13 | Factory reset profils | Profils existants | factoryReset() | NVS vidée, 0 profils | 🔲 |
| T10.14 | Apprentissage taux assèchement | 24 mesures humidité (12h) | updateDryingRate() | dryingRatePctPerHour calculé [0.1-20] | 🔲 |
| T10.15 | Taux assèchement réaliste | Pot citronnier été, plein soleil | Observer taux après 24h | ~2-5 %/h (cohérent avec évaporation) | 🔲 |
| T10.16 | PumpController utilise durée profil | Mode AUTO, profils configurés | Arrosage AUTO zone A | Durée = computeZoneCycleDurationS(), pas fixe | 🔲 |

## T11 — Autonomie & Prédiction Consommation
> Source: diagramme Activité (act) + Use Cases (uc)

| ID | Test | Préconditions | Étapes | Résultat attendu | Status |
|----|------|---------------|--------|-------------------|--------|
| T11.01 | Calcul autonomie été | Profils configurés | /autonomy 21 (en août) | Report: conso estimée, ✅/❌, marge % | 🔲 |
| T11.02 | Calcul autonomie hiver | Profils configurés | /autonomy 21 (en janvier) | Conso << été, grande marge | 🔲 |
| T11.03 | Détection déficit | 2 profils gros buveurs | /autonomy 60 (été) | ❌ INSUFFISANT + déficit en litres | 🔲 |
| T11.04 | Transition multi-mois | Profils configurés | /autonomy 45 depuis août | Calcul août (×1.0) puis sept (×0.75) | 🔲 |
| T11.05 | Conso journalière avec taux appris | Taux assèchement appris | dailyConsumptionML(zone, août) | Estimation basée terrain (pas théorique) | 🔲 |
| T11.06 | Conso journalière sans taux appris | Pas de taux appris | dailyConsumptionML(zone, août) | Estimation saisonnière par défaut | 🔲 |
| T11.07 | Autonomie max jours | Stockage 50L, zone A été | maxAutonomyDays() | Nombre de jours réaliste (15-25j été) | 🔲 |
| T11.08 | Telegram /autonomy format | Bot actif | /autonomy 14 | Résumé FR lisible avec ✅/❌ par zone | 🔲 |
| T11.09 | TFT écran autonomie | TFT actif | Naviguer écran autonomie | Barres visuelles conso vs stockage | 🔲 |
| T11.10 | Stockage zone B correct | Zone B = 25L (1 bidon) | Calcul autonomie | storageCapacityML = 25000 (pas 50000) | 🔲 |

## T12 — Géolocalisation WiFi
> Source: WiFiGeolocation module

| ID | Test | Préconditions | Étapes | Résultat attendu | Status |
|----|------|---------------|--------|-------------------|--------|
| T12.01 | Scan WiFi détecte ≥3 réseaux | ESP32 en zone urbaine | geoLoc.locate() | ≥3 BSSID scannés, payload JSON construit | 🔲 |
| T12.02 | API Mozilla retourne position | WiFi STA connecté, Internet | geoLoc.locate() | lat/lon reçus, accuracy < 200m | 🔲 |
| T12.03 | Position cohérente | À Mougins le Haut | Comparer résultat vs 43.61/6.99 | Écart < 0.01° (~1km) | 🔲 |
| T12.04 | Sauvegarde NVS | Géoloc réussie | Vérifier NVS après locate() | lat/lon/accuracy en NVS | 🔲 |
| T12.05 | Chargement NVS au reboot | NVS avec position | Power cycle → loadFromNVS() | Position restaurée, pas de re-scan | 🔲 |
| T12.06 | Fallback si <3 réseaux | Zone sans WiFi (blindage) | geoLoc.locate() | Échec gracieux, defaults Mougins | 🔲 |
| T12.07 | Fallback si pas Internet | WiFi AP sans Internet | geoLoc.locate() | Connexion échouée, defaults Mougins | 🔲 |
| T12.08 | TimeManager reçoit coordonnées | Géoloc réussie | Vérifier timeMgr._lat/_lon | = coordonnées géoloc (pas defaults) | 🔲 |
| T12.09 | clearNVS force re-géoloc | Position en NVS | clearNVS() → reboot | Re-scan WiFi au boot | 🔲 |

## Résumé

| Catégorie | Tests | Criticité |
|-----------|-------|-----------|
| T1 Communication M↔S | 10 | 🔴 Critique |
| T2 Mode dégradé | 7 | 🔴 Critique |
| T3 Arrosage AUTO | 10 | 🟡 Haute |
| T4 SCHEDULED/SOLAR/MANUAL | 10 | 🟡 Haute |
| T5 Sécurité SafetyManager | 15 | 🔴 Critique |
| T6 Hardware sécurité passive | 8 | 🔴 Critique |
| T7 Interface utilisateur | 15 | 🟢 Moyenne |
| T8 Capteurs & alertes | 10 | 🟡 Haute |
| T9 Robustesse WiFi | 8 | 🟡 Haute |
| T10 Profils hydriques & cycle | 16 | 🟡 Haute |
| T11 Autonomie & prédiction | 10 | 🟢 Moyenne |
| T12 Géolocalisation WiFi | 9 | 🟢 Moyenne |
| **TOTAL** | **128** | |

### Ordre d'exécution recommandé
1. **T6** Hardware (avant firmware — vérifier le câblage)
2. **T8.01-T8.09** Capteurs (vérifier que les lectures sont bonnes)
3. **T5.01, T5.14, T5.15** Sécurité de base (relay, double verrou)
4. **T12** Géolocalisation WiFi (nécessite WiFi, configure le reste)
5. **T1.01-T1.05** Communication (pairing, cycle normal)
6. **T3** Arrosage AUTO (le mode principal)
7. **T10** Profils hydriques + durée cycle (calibration)
8. **T2** Mode dégradé (couper le maître, vérifier l'esclave)
9. **T5** Reste sécurité
10. **T11** Autonomie (nécessite profils configurés T10)
11. **T4, T7, T9** Interface, modes secondaires, robustesse
