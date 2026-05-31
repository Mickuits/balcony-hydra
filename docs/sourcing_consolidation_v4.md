# Sourcing & consolidation des achats — Balcony Hydra v4

> Objectif : réduire le nombre de composants achetés à l'unité en regroupant en
> modules / shields / lots, **sans changer le firmware** (ESP32 WROOM-32, pinout
> figé dans `config_master.h` / `config_slave.h`). Sourcing prioritaire **EU/France**
> (Amazon.fr, AZ-Delivery, Berrybase, Mouser). Recherche multi-sources, mai 2026.

> ✅ **SOLUTION FIGÉE (2026-05-31) — Option A** pour les deux nœuds : ESP32 DevKit
> WROOM-32 **30 pins** + shield à borniers à vis 30P + module **CD74HC4067** + module
> **MOSFET D4184** (pompe) ; le maître ajoute l'écran ILI9341 séparé + un module
> **relais 3,3 V** opto. Capteurs : capacitif **v1.2**, LED **KY-016**. La carte
> intégrée KC868 (**Option B**) est **écartée** — voir §2.2. BOM canonique :
> `BOM_v4_secteur.xlsx` (246,56 € marge incluse).

## ⚠️ Conclusion structurante (à lire en premier)

**Aucune carte « tout-en-un » ne peut remplacer l'ensemble du montage.** C'est une
limite **matérielle** de l'ESP32, pas un défaut de recherche :

> L'ESP32 n'a que **4 entrées analogiques utilisables avec le WiFi actif**
> (ADC1 = GPIO 32-39, dont 4 réellement câblables : 34/35/36/39 ; ADC2 interdit
> avec WiFi). Or chaque nœud lit **10 capteurs d'humidité**. **Aucune** carte du
> marché (Kincony, LC, Dingtian, CYD…) ne dépasse 4 voies analogiques.
> **➜ Le multiplexeur CD74HC4067 reste obligatoire sur les deux nœuds.**

La consolidation se joue donc sur **2 leviers réels** :
1. **Réduire le câblage** → shield à borniers à vis (zéro Dupont, cohérent Wago/zéro-soudure).
2. **Regrouper en modules + acheter en lots** → MUX, driver pompe, relais, capteurs.

---

## 1. Maître (intérieur) — nœud ultra-contraint

Le TFT ILI9341 + tactile XPT2046 consomme 6 GPIO SPI ; avec le MUX (6), l'US (2),
l'I2C (2), le relais, le MOSFET pompe, le bouton et la LED RGB (3), **tous les GPIO
du DevKit 30 pins sont occupés**. Aucune marge.

### 1.1 Carte écran intégrée (type CYD) — ❌ DISQUALIFIÉE

| Carte | GPIO libres exposés | ADC1 libre | Verdict |
|---|---|---|---|
| **CYD ESP32-2432S028R** | **3** (GPIO 22 & 27 = ADC2 inutilisables ; 35 = ADC1 mais *input-only*) | quasi nul | ❌ **Incompatible** — besoin de ~16 lignes I/O dont 1 sortie + 1 ADC1 libre |
| Makerfabs MaTouch S3 3.5" | ~11 (à confirmer) | oui (S3) | ⚠️ Marge nulle, ~45 €+port, dispo EU faible |
| LilyGo T-Display-S3 | ~12 | oui | ❌ Écran 1.9" non tactile |
| LilyGo T-HMI | ~6 (Grove) | — | ❌ Trop peu de GPIO |

**➜ Le maître conserve : DevKit WROOM-32 30 pins + écran ILI9341 2.4" séparé.**

### 1.2 Modules qui consolident réellement le maître

| Besoin | Produit | Prix EU indicatif | Verdict pinout |
|---|---|---|---|
| Câblage | **Shield à borniers à vis ESP32 30P** (OSOYOO 30P, czh-labs) | ~6-12 € | ✅ ⚠️ **version 30 PINS** (pas 38) |
| 10 capteurs | **Module CD74HC4067 16ch** | ~2-3 €/u (lot 5) | ✅ SIG→ADC1 GPIO36, S0-S3 (32/33/25/26), EN (4) |
| Pompe B | **Module MOSFET isolé AOD4184 / D4184** | ~1,5-2 €/u (lot 5) | ✅ pull-down 4,7 kΩ + opto intégrés = failsafe pompe OFF au reset |
| Relais sécurité | **Module relais 1ch 3,3 V opto** (bobine SRD-**03**VDC) | ~2-3 € | ✅ ⚠️ **3,3 V**, pas 5 V |

---

## 2. Esclave (balcon) — plus de marge GPIO

### 2.1 Cartes ESP32 « industrielles » tout-en-un

| Carte | Relais | Entrées analogiques | ≥10 AI ? | Prix EU |
|---|---|---|---|---|
| **KC868-A16** | 16 | **4** (sur GPIO 34/35/36/39, ADC direct) | ❌ | 65-95 € |
| HomeMaster MiniPLC | 6 | 4 (ADS1115 16 bits) | ❌ | 80-150 € |
| LC Tech Relay X8 | 8 | **0** (header à souder) | ❌ | 15-25 € |
| Dingtian DT-R | 8-32 | **0** (digital only) | ❌ | 20-40 € |
| Olimex ESP32-EVB | 2 | 0 | ❌ | ~20 € |

Aucune ne supprime le MUX. Les entrées analogiques Kincony sont câblées sur
**les mêmes GPIO ADC1 (34/35/36/39)** que le firmware utilise déjà → **zéro gain net** en voies analogiques.

### 2.2 Deux scénarios

#### ✅ Option A — DevKit 30P + shield borniers (RECOMMANDÉE)
Cohérente avec le firmware existant (**zéro remap**), zéro soudure, le moins cher,
et garde **2 ESP32 identiques** (stock de rechange commun maître/esclave).

| Besoin | Produit | Prix EU |
|---|---|---|
| MCU | ESP32 DevKit WROOM-32 **30 pins** | ~6-8 € |
| Câblage | **Shield borniers 30P** ⚠️ *30 pins* | ~6-12 € |
| 10 capteurs | **Module CD74HC4067** | ~2-3 € |
| Pompe A | **Module D4184** (failsafe intégré) | ~1,5-2 € |
| Env. | BME280 (vrai, ID 0x60) + INA219 + KY-016 | ~13-18 € |

#### ❌ Option B — KC868-A16 industrielle (ÉCARTÉE, archivée)
> Non retenue. Le BOM qui l'encodait est archivé dans
> `docs/legacy/BOM_v4.1_simplifiee_secteur_OPTION-B_ARCHIVE.xlsx`.

Apporte **alim 12 V mono-prise + relais matériel + boîtier industriel + borniers**
en un seul PCB. Mais :
- **+60-90 €** vs option A ;
- **MUX toujours requis** (branché sur une entrée 0-5 V) ;
- **remap firmware nécessaire** (GPIO en partie pris par relais/PCF8574 internes) ;
- ⚠️ exiger la **révision WROOM-32** (les « v3 » passent en ESP32-S3 → casse les
  tâches FreeRTOS dual-core du firmware).

À ne retenir que si l'objectif prioritaire est **une seule prise 12 V + un boîtier
industriel propre**, et que le remap firmware est accepté.

---

## 3. Modules & capteurs — lots EU et pièges qualité

| Composant | Reco | Lot / Prix EU | Piège à éviter |
|---|---|---|---|
| **MOSFET pompe** | **D4184 / AOD4184 isolé** | lot 5 ~8-10 € (AliExpress FR) ou unité Amazon.fr | ❌ **Module IRF520** : seuil de grille ~4 V, ne sature pas en 3,3 V (documenté) |
| **Relais 3,3 V** | SRD-**03**VDC opto (Elecbee 1ch / APKLVSR pack 5 Amazon.fr) | ~2-3 €/u | ❌ Modules « 5 V » (ne déclenchent pas fiablement en 3,3 V) |
| **MUX 16ch** | CD74HC4067 générique | lot 5, ~2-3 €/u (Amazon.fr/.de) | — |
| **Shield borniers** | OSOYOO **30P** / czh-labs | ~6-12 € | ❌ **30 vs 38 pins** (beaucoup de listings = 38P par défaut) |
| **Humidité capacitif** | **v1.2** (pas v2.0) | lots x5/x6, ~2-5 €/u | ❌ v2.0 défaut R4-GND ; ❌ NE555 non régulé → exiger **TLC555** (3,3 V). Tester chaque unité. |
| **JSN-SR04T** | v2.0 | ×2 unités, ~16-20 € | ⚠️ zone aveugle ~25 cm sur réservoir peu profond |
| **BME280** | vrai BME280 (×1) | ~7-9 € (AZ-Delivery) | ❌ **BMP280 vendu comme BME280** → vérifier chip ID **0x60** (pas 0x58) au boot |
| **INA219** | ×1 (lot x2 pour spare) | ~4-5 €/u | — |
| **DS3231** | ×1 | ~3,90-6 € (Berrybase 3,90 €) | ⚠️ ZS-042 : CR2032 sur circuit de charge → fuite (mettre LIR2032) |
| **LED RGB** | module **KY-016** (cathode commune) | lot x3 | vérifier cathode vs anode commune (logique PWM LEDC) |

---

## 4. Listes d'achat consolidées — AVANT → APRÈS

### Maître
| AVANT (unitaire) | APRÈS (consolidé) |
|---|---|
| ESP32 nu + breadboard + Dupont + MOSFET discret + résistances + relais 5 V + MUX nu | 1× ESP32 DevKit **30P** · 1× **shield borniers 30P** · 1× ILI9341 2.4" (inchangé) · 1× **CD74HC4067** · 1× **D4184** · 1× **relais 3,3 V** · 1× DS3231 · 1× KY-016 |
| ~8-10 réfs + breadboard | **~7 réfs, zéro Dupont/breadboard** |

### Esclave (Option A)
| AVANT | APRÈS |
|---|---|
| ESP32 nu + breadboard + Dupont + MOSFET discret + MUX nu | 1× ESP32 DevKit **30P** · 1× **shield borniers 30P** · 1× **CD74HC4067** · 1× **D4184** · 1× BME280 · 1× INA219 · 1× KY-016 |
| ~7-9 réfs + breadboard | **~7 réfs, zéro soudure** |

### Lot commun aux deux nœuds
- **24× capteurs humidité capacitifs v1.2** (20 utiles + 4 spares ; tester chacun à réception)
- **2× JSN-SR04T v2.0**

**Gain net** : passage d'un assemblage breadboard/Dupont multi-références à **~7 références
par nœud sur borniers à vis**, avec les *failsafes* (pull-down pompe, relais 3,3 V)
**intégrés aux modules** au lieu d'être câblés à la main.

---

## 5. Points de vérification avant commande (checklist)

- [ ] Shield borniers : bien **30 pins** (entraxe 0.9"-1.1"), pas 38 pins.
- [ ] Module pompe : **D4184/AOD4184** (pas IRF520) ; vérifier câblage entrée opto (V+ load) et sens du trigger.
- [ ] Relais : bobine **SRD-03VDC** (3,3 V), opto-isolé, sens trigger = **relais ouvert ⇒ pompe OFF au boot**.
- [ ] BME280 : exiger la **vraie** réf BME280 (humidité), vérifier chip ID 0x60 au boot.
- [ ] Capteurs capacitifs : **v1.2**, puce **TLC555**, tester chaque unité (calibration individuelle prévue au TODO firmware).
- [ ] KC868-A16 (si Option B) : exiger la **rév. WROOM-32** (pas ESP32-S3).

## Sources principales
- CYD pinout : github.com/witnessmenow/ESP32-Cheap-Yellow-Display · randomnerdtutorials.com/esp32-cheap-yellow-display-cyd-pinout-esp32-2432s028r
- Kincony KC868 : kincony.com (hardware design A6/A8/A16) · devices.esphome.io/devices/kincony-kc868-a16 · YAML ADC GPIO 34/35/36/39 (github Roving-Ronin)
- D4184/IRF520 : protosupplies.com/product/d4184-mosfet-control-module · arduinodiy.wordpress.com/2020/11/22/the-irf520-fet-switching-module
- MUX / shield : berrybase.de (SparkFun BOB-09056) · osoyoo.com/2025/02/07/osoyoo-breakout-board-for-30p-esp32-esp8266
- Capteurs : az-delivery.de · berrybase.de · randomnerdtutorials.com/solved-could-not-find-a-valid-bme280-sensor
