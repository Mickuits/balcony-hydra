# DECISIONS.md — Balcony Hydra v4

> Trace les décisions de design importantes, en particulier celles dont le **pourquoi** ne se devine pas facilement à la lecture du code. Format : date, décision, contexte, alternatives évaluées, choix retenu, conséquences.
>
> Ne pas re-documenter ce qui est évident ou déjà dans CLAUDE.md / TODO.md.

---

## 2026-05-29 — Couverture firmware gcov (env `native_cov` séparé + seuils escalier)

**Décision** : mesurer la couverture lignes des modules SIL (`lib/`) via gcov/gcovr et la passer en **hard-gate** CI, avec un env PlatformIO dédié `native_cov` (≠ `native`) et des seuils par firmware démarrés sous la baseline.

**Comment** :
- Nouvel `[env:native_cov]` qui `extends = env:native` + `--coverage -O0 -g`. Linkage : `pio test` **n'applique pas** `link_flags` au runner natif → un pre-script SCons (`coverage.py`, `env.Append(LINKFLAGS=["--coverage"])`) injecte `-lgcov` (sinon `undefined reference to __gcov_init`).
- `scripts/firmware_coverage.sh <dir> <min>` : build/run `native_cov`, puis `gcovr --filter lib/ --fail-under-line <min>` (+ XML/HTML artefact).
- Job CI `firmware-coverage` (matrix master/slave).

**Baselines mesurées (2026-05-29)** : master **68,4 %** lignes (ConfigManager 93 %, SafetyManager 77 %, SensorManager 59 %, PumpController 57 %, StatusLED 28 %), slave **100 %** (DegradedMode + SafetyLocal).

**Seuils retenus (escalier)** : master **65 %**, slave **95 %** — volontairement *sous* la baseline pour absorber un refactor trivial sans rougir, tout en bloquant l'ajout de code non testé. À **relever par paliers** quand des tests SIL sont ajoutés (cible master 70→75 quand PumpController/SensorManager/StatusLED montent).

**Alternatives écartées** :
- *Instrumenter directement `[env:native]`* : coupler couverture et exécution des tests, ralentir/polluer les jobs `build-master`/`build-slave` avec des `.gcda` inutilisés. Rejeté → env séparé.
- *Exclure StatusLED du calcul pour viser 70 %* : tentant (driver LED PWM, peu de logique SIL) mais ç'aurait été du *gaming* du chiffre. Rejeté → on mesure tout ce qui compile et on assume une baseline honnête de 65 %.
- *`link_flags = --coverage`* : ignoré par le runner de test natif (vérifié : absent de la ligne de link). Rejeté → pre-script SCons.

**Conséquences** : `[env:native]` (utilisé par `build-master`/`build-slave`) reste non instrumenté et rapide. `coverage.py` est versionné ; les rapports `coverage.*` sont gitignorés.

---

## 2026-05-29 — Remise à plat de la CI (dette cachée révélée par des dépendances flottantes)

**Décision** : corriger 5 jobs CI rouges qui étaient **tous pré-existants** (rien à voir avec le diff docs/pinout de la PR #1), causés par la dérive de dépendances à versions flottantes depuis le dernier run réellement vert (~2026-05-18).

**Constat clé** : le **build ESP32 réel** (`build-master`) et les **tests natifs** n'avaient en fait plus tourné/compilé depuis le 18/05 — seul le SIL mocké passait, ce qui masquait la dette. Les versions flottantes ont avancé : `espressif32`→7.0.1, `ArduinoJson`→7.4.3, `@eslint/js`→10, cppcheck CI plus récent.

**Corrections retenues** :
- **ESPAsyncWebServer** : `me-no-dev/ESPAsyncWebServer@^1.2.3` → `mathieucarbou/ESPAsyncWebServer@^3.0.0` (fork maintenu, ESP32Async). L'ancien est abandonné, incompatible `espressif32@7.x`, tirait le mauvais TCP (ESPAsyncTCP ESP8266) et n'a pas `collectHeaders`. Conséquences code : `req->send_P()` → `req->send()` (variantes `_P` retirées ; PROGMEM = RAM normale sur ESP32) ; suppression de l'appel `collectHeaders()` (le fork 3.x conserve **tous** les headers par défaut, donc `req->getHeader("X-Hydra-Token")` marche directement — l'auth reste opérationnelle).
- **ESLint (mobile-app)** : `@eslint/js@^10.0.1` (exigeait `eslint@10`) → `@eslint/js@^9.17.0`, aligné sur `eslint@^9.17.0`, lockfile régénéré. `npm ci` repassait en ERESOLVE sinon.
- **cppcheck (Lint)** : init des membres dans les mocks de test (`PlantProfile::_profiles{}`, `ConfigManager::_config{}`) — `uninitMemberVar` (medium) nouvellement signalé par le cppcheck CI.

**Alternatives écartées** :
- *Épingler les plateformes/libs à d'anciennes versions* : repousse le problème, garde du code mort-vivant non compilé. Rejeté au profit de la migration vers les libs maintenues.
- *Supprimer la ligne `collectHeaders` sans changer de lib* : aurait cassé l'auth au runtime sur me-no-dev (headers custom non conservés). Rejeté.

**Conséquences / leçon** :
- **5/5 jobs verts** + le build ESP32 et les tests natifs compilent réellement à nouveau.
- ⚠ **Recommandation** : épingler à terme les versions majeures critiques (`platform = espressif32@7.0.1`, `ArduinoJson@^7.4`) pour éviter que la CI ne re-dérive silencieusement. Non fait dans cette PR pour rester minimal — à considérer.
- Le diagnostic a été fait sans accès aux logs Actions (403 sur l'intégration) ni compilation locale (réseau sandbox bloquant le téléchargement plateforme) — d'où une boucle « push → log collé → fix ». Ouvrir le réseau PlatformIO du sandbox accélérerait fortement ce type de tâche.

---

## 2026-05-29 — Résolution effective du conflit GPIO 18 : remap SPI minimal (CLK→19, MISO→35)

**Décision** : conflit `GPIO 18 = Relay sécurité ET SPI CLK` résolu **en pratique** par un remap minimal du bus SPI TFT/XPT2046, et non par le pinout HSPI brut esquissé le 2026-04-24.
- **SPI CLK : 18 → 19**
- **SPI MISO : 19 → 35** (GPIO 35 est input-only, ce qui est parfaitement valide pour un MISO = entrée côté ESP32 ; libère le 19 pour le CLK)
- **SPI MOSI : 23** (inchangé) · **TFT_CS 13 / TFT_DC 12 / TOUCH_CS 15** (inchangés)
- **Relay : reste sur GPIO 18**, désormais sans collision.

**Contexte / pourquoi on dévie de la note du 2026-04-24** : le remap HSPI proposé alors (`SCLK=14, MISO=12, MOSI=13, CS=15, DC=2`) était une esquisse non vérifiée. Confronté à `config_master.h`, il **entre en collision** avec deux signaux existants :
- `TFT_SCLK=14` ⟷ `PIN_US1_TRIG=14` (trigger ultrason)
- `TFT_DC=2` ⟷ `PIN_LED_B=2` (LED RGB bleu)

Sur DevKit 30 pins, il n'existe **aucun GPIO output libre** : déplacer tout le bus créerait une cascade de conflits. Le remap retenu ne touche que 2 signaux, n'utilise qu'un pin input-only déjà libre (35), et ne déplace pas le relay. C'est la solution de moindre risque.

**Alternatives écartées** :
- *HSPI par défaut (note 04-24)* : casse US TRIG (14) + LED_B (2). Rejeté.
- *Déplacer le Relay ailleurs* : aucun pin output libre. Rejeté.
- *GPIO expander I2C* : surcoût BOM + complexité, non justifié pour 1 signal. Rejeté.

**Conséquences** :
- Pinout acté dans `firmware/master/include/config_master.h` (`PIN_TFT_SCLK=19`, `PIN_TFT_MISO=35`, source de vérité), `docs/wiring_master.svg`, `CLAUDE.md`, `architecture_v4.md`.
- Les flags TFT_eSPI (`USER_SETUP_LOADED` + pinout) sont préparés mais **gardés commentés** dans `platformio.ini` : les activer force le build à utiliser ce pinout au lieu du `User_Setup.h` embarqué, ce qui n'est **pas validable en CI** (pas d'écran) et cassait `build-master`. On les active au 1er flash (décommenter le bloc). C'est la même approche délibérée que le repo appliquait déjà.
- ⚠ **À valider au 1er flash avec TFT branché** : init écran (driver/fréquence SPI) + lecture tactile XPT2046 sur MISO=35. Procédure : `docs/hardware_bringup_checklist.md §0`.
- Aucun test SIL impacté (TftDashboard n'est pas instancié en natif, cf. `lib_ignore`).
- **Remplace** la résolution esquissée le 2026-04-24 (HSPI) ci-dessous.

---

## 2026-05-17 — Intégration prototype mobile comme couche client (PWA cible)

**Décision** : ajouter une couche client mobile à l'architecture v4, sous forme de prototype HTML autonome (`mobile/balcony-hydra-mobile.html`) servant de référence UX. Cible long-terme : **PWA** (Progressive Web App) servie depuis Vercel/GitHub Pages, consommant l'API REST + MQTT du master.

**Contexte** : le firmware est fonctionnellement complet mais l'interface utilisateur reste limitée au TFT 2.4" du master, au portail web embarqué (mobile-unfriendly) et à Telegram. Un design mobile haute fidélité de 14 écrans / 4 834 lignes a été livré 2026-05-17 — il faut décider comment l'intégrer.

**Audit du proto** : un agent a inventorié les 14 écrans, 5 wizards, ~30 modaux et identifié **8 écarts** avec le firmware réel (3 slaves vs 1, capteur ADC dédié vs MUX, pompe par pot vs pompe par zone, pas de modes AUTO/SCHEDULED, pas d'UI safety/lockout, pas d'écran pairing, pompe submersible 5V mentionnée à tort, GPIO incohérents).

**Alternatives évaluées** :
- **A — Intégrer le HTML comme web portal embarqué** (sert depuis ESP32 PROGMEM) : zéro infra externe, mais le firmware atteint déjà 80 % de la flash master avec TFT + Telegram + Web ; 243 KB de HTML/CSS/JS supplémentaires impossible.
- **B — PWA externe (Vercel/GitHub Pages)** : déploiement séparé, l'app discute en MQTT (broker public ou local) + REST direct vers le master. Indépendante du firmware, installable depuis Safari/Chrome mobile, offline-first via service worker. **Retenu**.
- **C — App native React Native / Capacitor** : meilleure UX (push natifs, biométrie) mais refactor ~80 % du HTML existant, store submission (Apple Developer 99 €/an), build pipeline lourd. Reporté à Phase 3+.

**Choix** : **B — PWA**. Le proto est déjà HTML/CSS/JS vanilla et mobile-first. Ajouter `manifest.webmanifest` + service worker + Workbox pour offline = ~50 lignes. Distribution sans store.

**Conséquences** :
- Création de `mobile/README.md` documentant inventaire des 14 écrans, écarts vs firmware, roadmap Phase 1/2/3.
- Section "Couche client mobile" ajoutée à `docs/architecture_v4.md` avec topics MQTT consommés + table API REST consommée.
- `TODO.md` reçoit une section dédiée "Mobile App" avec les 8 écarts à résoudre, les actions Phase 2 (MQTT.js + fetch), et les actions Phase 3 (PWA + push).
- `README.md` repassé en v4 (était encore v3) et mentionne le proto mobile.
- `CLAUDE.md` mis à jour : section documentation + ASCII de l'architecture avec la couche mobile au-dessus du master.
- Le proto **n'est pas connecté au firmware** — c'est un mock UI. Les écarts ne sont pas des bugs : ce sont des choix de design à trancher (le proto exprime une UX désirable, pas une spec firmware).
- Décision à venir Phase 2 : authentification (token statique côté master ? JWT ? mDNS-only sur réseau local ?).

---

## 2026-04-24 — Résolution conflit GPIO 18 côté maître : TFT en HSPI  [⚠ REMPLACÉE par l'entrée 2026-05-29]

> ⚠ **Note 2026-05-29** : le pinout HSPI esquissé ci-dessous (`SCLK=14, DC=2`)
> entrait en collision avec `PIN_US1_TRIG=14` et `PIN_LED_B=2`. Remplacé par le
> remap minimal CLK→19 / MISO→35 (voir entrée 2026-05-29). Conservée pour traçabilité.

**Décision** : le conflit `GPIO 18 = Relay sécurité ET VSPI CLK` côté maître sera résolu en passant le TFT ILI9341 + XPT2046 sur le bus **HSPI** (GPIO 14 CLK, 12 MISO, 13 MOSI — remappables). Le Relay reste sur GPIO 18. Décision **non encore implémentée** dans le firmware (pas de `TftDashboard` branché sur vrai hardware à ce jour).

**Contexte** : l'audit docs 2026-04-24 (4 agents en parallèle) a identifié que la table de pins du maître utilise GPIO 18 pour 2 fonctions simultanées — impossible physiquement. Le SVG `wiring_master.svg` a été annoté avec un warning rouge. Sur ESP32 DevKit 30 pins, une fois TFT + MUX + pompe + bouton + I2C + LED + US posés, il ne reste **aucun GPIO output libre** pour déplacer le Relay. Le seul levier est de libérer VSPI.

**Alternatives évaluées** :
- **A — Déplacer le Relay** : aucun GPIO output libre côté maître (GPIO 35, 39 sont input-only ; GPIO 0, 1, 3 sont strapping / UART ; tous les autres déjà pris). **Rejeté** faute de pins.
- **B — Supprimer le Relay** (protection uniquement MOSFET + fusible + firmware, alignement avec l'esclave) : réduit la défense en profondeur côté maître. Le relay est la COUCHE 3 de l'architecture de sécurité — sa suppression casse la symétrie du tableau safety. **Rejeté** pour conservation du double verrou.
- **C — TFT en HSPI** : libère VSPI (18, 19, 23) pour le Relay et d'autres usages futurs. ESP32 expose 2 SPI utilisables. TFT_eSPI supporte HSPI via `#define TFT_MISO/MOSI/SCLK` dans `User_Setup.h`. Demande uniquement un rebranchement (Wago) et une reconfig de `platformio.ini`. **Retenu**.

**Choix** : Option C — TFT sur HSPI.

**Conséquences** :
- Action firmware : configurer `TFT_eSPI` sur HSPI dans `platformio.ini` master (`-DTFT_SCLK=14 -DTFT_MISO=12 -DTFT_MOSI=13 -DTFT_CS=15 -DTFT_DC=2`). Attention GPIO 12 est strapping (flash voltage) — vérifier que le niveau au boot ne perturbe pas. Sinon utiliser un des autres DevKit pins sortables.
- Action hardware : sur le proto, câbler le TFT sur HSPI au lieu de VSPI. `wiring_master.svg` à mettre à jour une fois le prototype validé.
- Impact tests : aucun test SIL impacté (pas de vrai TFT instancié en natif, `TftDashboard` n'a pas de tests SIL).
- Le pin assignment `config_master.h` devra être révisé : `PIN_TFT_CS`, `PIN_TFT_DC`, `PIN_TOUCH_CS` à relocaliser, potentiellement réutiliser `PIN_US1_TRIG=14` en partageant — à bien analyser. Cette tâche est **en attente hardware réel**, pas de changement code tant qu'on ne flash pas.
- Conflit GPIO 18 documenté dans `wiring_master.svg` (warning rouge visible) jusqu'à résolution hardware.

Voir `docs/architecture_v4.md` §Pin assignments et `TODO.md` §Hardware.

---

## 2026-04-08 — `lastAutoWaterTime` sentinel `UINT32_MAX` au lieu de `0`

**Décision** : `PumpController` initialise `_zones[z].lastAutoWaterTime = UINT32_MAX` dans le constructeur, et `_isAutoCooldownOk()` teste `== UINT32_MAX` pour le cas "jamais arrosé" — au lieu de tester `== 0`.

**Contexte** : avant le fix, le check était `if (lastAutoWaterTime == 0) return true;`. Bug subtil : `0` est aussi une valeur valide quand `millis() == 0` (par exemple au tout début du boot). En production le boot prend ~100-500ms donc le bug ne se manifeste jamais sur ESP32, mais en SIL natif `MockHW::_millis = 0` au démarrage du test, ce qui faisait que le 1er `shouldAutoWater()` set `lastAutoWaterTime = 0` puis le 2e appel pensait "jamais arrosé" et bypass-ait le cooldown.

**Alternatives** :
- Garder le sentinel `0` et hacker le test (workaround `MockHW::advanceMillis(100)` avant) — fragile, ne corrige pas la cause racine.
- Ajouter un flag bool `_lastAutoSet[NUM_ZONES]` séparé — duplique l'information, plus de membres.
- Sentinel `UINT32_MAX` — explicit, idiomatique C, zéro overhead.

**Choix** : `UINT32_MAX`. Le test SIL T12_07 vérifie maintenant la VRAIE logique cooldown sans hack.

**Conséquences** : aucun impact runtime sur ESP32 (le code n'aurait jamais déclenché le bug en pratique). Le code est plus défensif et aligné avec les conventions C ("sentinel = max value of type"). Voir commit `f13da90`.

---

## 2026-04-08 — `MAX_RUNTIME` failsafe gardé comme défense en profondeur volontairement inateignable

**Décision** : ne PAS refactorer `PumpController::start()` qui clamp `_targetDuration` à `PUMP_MAX_RUNTIME_S`, et ne PAS retirer le check `_checkFailsafes()` qui détecte `runningForS >= PUMP_MAX_RUNTIME_S`. Les deux sont conservés bien que le check failsafe soit inateignable depuis l'API publique.

**Contexte** : `start()` ligne 97-99 clamp `_targetDuration` à `PUMP_MAX_RUNTIME_S`. `update()` ligne 38 stoppe avec `DURATION_DONE` quand `runningForS >= _targetDuration`. Donc `_checkFailsafes()` ligne 252 (`stop(zone, MAX_RUNTIME)`) ne peut JAMAIS se déclencher depuis un usage normal. Le test SIL T12_04 a essayé, échoué, été marqué IGNORE puis supprimé.

**Alternatives** :
- Retirer le clamp dans `start()` et garder seulement le failsafe → `MAX_RUNTIME` devient le seul point de contrôle. Inconvénient : si user demande explicitement `start(0, 600)` (10 min), pump démarre 10 min et est tuée à 5 min avec une alerte alarmiste `MAX_RUNTIME` au lieu d'un `DURATION_DONE` calme.
- Retirer le check failsafe puisqu'inateignable → perte de la défense en profondeur si `_targetDuration` est corrompu en RAM par un bug ailleurs.
- Garder les deux (état actuel) → contractuel + défense en profondeur, prix : un code path mort.

**Choix** : garder les deux. Le clamp est contractuel (prédictible pour l'utilisateur), le failsafe est sécurité (au cas où). Le test T12_04 a été supprimé entièrement avec un commentaire explicatif au-dessus de T12_03.

**Conséquences** : 1 ligne de code apparemment morte dans `_checkFailsafes()` mais qui sauve potentiellement le système si quelque chose va mal. Ne pas la "nettoyer" sans réfléchir. Voir commit `f13da90`.

---

## 2026-04-08 — Suppression complète des stubs WebPortal HTTP 501

**Décision** : supprimer `_handleApiProfiles`, `_handleApiProfileUpdate`, `_handleApiAutonomy` du WebPortal (header + cpp + wiring `_setupRoutes()` + setters main.cpp + forward declarations). Ne pas garder de stub HTTP 501.

**Contexte** : ces 3 routes étaient déclarées et wirées dans `_setupRoutes()` mais leur implémentation n'a jamais été écrite. Le commit `d274956` les avait stubbées avec HTTP 501 pour débloquer le linker. Vérification : aucun client (HTML embedded, JS, Telegram, etc.) ne les appelait jamais — code mort wireé.

**Alternatives** :
- Implémenter pour de vrai (option A) — 1-2h, valeur métier réelle, mais doublonne la fonctionnalité déjà exposée via Telegram (`/profiles`, `/autonomy N`).
- Stub HTTP 501 (option C, état avant le refactor) — sémantiquement faux (501 = "verb non supporté"), code mort, pattern "préparer le futur" qui accumule de la complexité sans valeur.
- Suppression complète (option B) — code 100% propre, zéro mensonge, état honnête. Faut tout recréer si on implémente la feature plus tard.

**Choix** : option B. Le pattern "garder du code wiré qui ne fait rien pour préparer le futur" est un anti-pattern. La fonctionnalité existe déjà via Telegram, doubler en REST n'apporte rien tant que personne ne consomme l'API REST.

**Conséquences** : -47 lignes de code mort. Si on veut un jour exposer profiles/autonomy en REST, il faudra recréer le wiring + handlers. Le commit `f75a2c9` documente le pattern de référence (`TelegramBot::_buildProfilesMessage`) à imiter.

---

## 2026-04-08 — Mock JsonObject connecté au `_d` parent du JsonDocument

**Décision** : le mock `JsonObject` n'est plus un stub vide. Il garde une référence au `_d` map du `JsonDocument` parent et un préfixe (la clé de l'objet), et écrit ses sub-fields via le pattern flat `prefix::key`. Spécialisation explicite `JsonDocument::Proxy::to<JsonObject>()` pour créer un JsonObject connecté.

**Contexte** : le mock `JsonObject` était un stub qui acceptait les writes `obj["key"] = value` mais ne stockait rien. Conséquence : `ConfigManager::toJson()` produisait un JSON contenant uniquement les fields top-level (`mode`, `pumpDuration`) et pas les nested (`schedule`, `moisture`, `tank`). Le test T13_09 ne pouvait pas vérifier la présence des nested fields.

**Alternatives** :
- Mocker un vrai JSON tree (Map<String, Variant>) — gros travail, beaucoup de cas à couvrir.
- Garder le stub et limiter les tests aux top-level — accepter une couverture moins bonne.
- Pattern flat encoding `prefix::key` — réutilise le même mécanisme que `Proxy::operator[]` qui flat-encodait déjà les nested access. Cohérent et minimal.

**Choix** : pattern flat encoding. Une seule modification du mock, restauration de tous les checks T13_09, et zéro régression sur le code production (le vrai ArduinoJson v7 sérialise correctement de toute façon).

**Conséquences** : `serializeJson()` produit `{"mode":"0","schedule::hour1":"7","schedule::min1":"0",...}` au lieu du `{"mode":"0","schedule":{...}}` réel, mais `json.indexOf("schedule")` matche le préfixe → le test passe. Voir commit `97a5dc0`.

---

## 2026-04-08 — Pattern `#ifdef HYDRA_TEST` pour exposer des injecteurs de test

**Décision** : ajouter des méthodes publiques `injectTestEnvironment()`, `injectTestPumpMetrics()` dans `SensorManager.h` sous `#ifdef HYDRA_TEST`, et définir `-DHYDRA_TEST` uniquement dans `[env:native]` de `platformio.ini`.

**Contexte** : `SafetyManager._checkTemperature()` lit `_sensorMgr.data().environment.temperature`, mais `SensorManager._bme` est privé — impossible d'appeler `_bme.setMock()` depuis les tests sans toucher au header. Pour tester les transitions thermal lockout, il fallait un moyen d'injecter une T° dans le mock.

**Alternatives** :
- `friend class TestFixture` — couple le code production au code de test, pas idiomatique en SIL.
- Setter public sans guard — pollue l'API production avec des hooks de test.
- Refactorer `SensorManager` pour exposer une interface `ISensorReader` et injecter un mock — gros travail, peu rentable.
- `#ifdef HYDRA_TEST` — bloc conditionnel uniquement compilé en native, zéro impact production.

**Choix** : `#ifdef HYDRA_TEST`. Standard en embedded SIL, mécanisme clair, garanti par le build flag.

**Conséquences** : nouveau pattern à appliquer si on a besoin d'autres injecteurs (PumpController, etc.). Le flag `HYDRA_TEST` est défini dans `[env:native]` uniquement, pas dans `[env:master]` ESP32 — vérifié dans `platformio.ini`. Voir commit `012c2a4`.

---

## 2026-04-08 — `MockINA::globalCurrent_mA` registre global pour bypass private members

**Décision** : ajouter un namespace `MockINA` dans `Arduino.h` avec `globalCurrent_mA` et `globalVoltage_V`. La classe mock `Adafruit_INA219::getCurrent_mA()` lit ce registre. Les tests utilisent `MockINA::setGlobalCurrent(mA)` pour injecter du courant sans accéder aux instances privées de `SensorManager`.

**Contexte** : `SensorManager._ina` est privé. Le test T12_09 doit injecter un courant pompe pour vérifier que `PumpController` détecte l'overcurrent. Sans accès au `_ina`, il fallait un mécanisme indirect.

**Alternatives** :
- `friend class TestFixture` — voir au-dessus.
- `injectTestPumpMetrics()` sous `#ifdef HYDRA_TEST` — fonctionne aussi mais injecte le résultat final, pas la valeur ADC brute. Moins fidèle.
- Registre global namespace — toutes les instances mock partagent le même état, ce qui est exactement le comportement de l'INA219 réel (un seul chip I2C).

**Choix** : registre global. Cohérent avec le fait qu'il n'y a qu'un seul INA219 sur le bus I2C dans la réalité.

**Conséquences** : pattern réutilisable pour d'autres mocks de chips singleton (BME280 si jamais on en a besoin). `setUp()` global appelle `MockINA::reset()` pour garantir l'isolation entre tests. Voir commit `cb5bced`.

---

## 2026-04-08 — Pairing ESP-NOW automatique au premier boot, sans bouton

**Décision** : le master entre automatiquement en mode pairing au premier boot (NVS vide), broadcaste `CMD_PAIRING_REQ` toutes les 2s, capture le sender MAC du `DATA_PAIRING_ACK` reçu, et persiste en NVS. Le slave est passif (écoute en broadcast). Pas de bouton physique requis.

**Contexte** : avant le fix, `DEFAULT_SLAVE_MAC = 0xFF×6` (broadcast) était hardcodé. ESP-NOW ne peut pas faire d'unicast vers une adresse broadcast → le système ne marche pas en production. Le slave n'a pas de bouton (`PIN_BUTTON = 0xFF` dans `config_slave.h`), donc le master ne peut pas attendre un signal humain de pairing côté slave.

**Alternatives** :
- Pairing manuel : utilisateur copie le MAC depuis Serial Monitor et le hardcode dans `config_master.h` → recompile + reflash. Workflow horrible.
- Pairing avec bouton sur le master uniquement : moins automatique, sécurité un peu meilleure, mais le slave doit quand même être en mode pairing automatique au premier boot.
- Pairing automatique au premier boot des deux côtés (état actuel) : zéro intervention, sécurité = magic byte `0xBA` qui filtre les autres devices ESP-NOW. Suffit pour 1 paire dans un appartement.

**Choix** : pairing automatique. La sécurité par magic byte est suffisante pour l'usage personnel de Micka (1 paire dans un appartement à Mougins). Le risque qu'un autre device Hydra soit dans la portée de 100m est négligeable.

**Conséquences** : une commande Telegram `/pairing_reset` (commit `6df88c7`) permet de re-pairer un slave de remplacement à distance depuis Cogolin sans rentrer à Mougins. La validation comportementale du pairing reste à faire sur hardware. Voir commits `e0d4a31`, `cffca5f`, `b6514dd`.

---

## 2026-04-08 — Handshake pairing 3-way REQ/ACK/CONFIRM (au lieu de 2-way)

**Décision** : le pairing utilise un handshake en 3 étapes : `CMD_PAIRING_REQ` (master→broadcast) → `DATA_PAIRING_ACK` (slave→master unicast) → `CMD_PAIRING_CONFIRM` (master→slave unicast).

**Contexte** : un handshake 2-way (REQ + ACK) suffit techniquement à ce que les deux côtés se connaissent. Le `CONFIRM` est un message supplémentaire qui ne porte pas d'info nouvelle.

**Alternatives** :
- 2-way REQ/ACK — minimaliste, fonctionne, mais le slave n'a aucune confirmation que son ACK est arrivé. Si l'ACK est perdu, le slave pense être paired alors que le master continue à broadcaster en cherchant un slave qui répond.
- 3-way REQ/ACK/CONFIRM — le slave reçoit la confirmation que son ACK est bien arrivé avant de passer en mode opérationnel. Plus robuste.

**Choix** : 3-way. Le `CMD_PAIRING_CONFIRM` est cosmétique (juste un log) mais garantit la cohérence d'état entre les deux ESP32 même si le premier ACK est perdu (le slave attend de recevoir le CONFIRM avant de considérer le pairing terminé).

**Conséquences** : un message ESP-NOW supplémentaire par pairing (négligeable, fait une fois au premier boot). Voir `EspNowMaster.cpp` et `EspNowSlave.cpp` dans le commit `cffca5f`.

---

## 2026-04-08 — Suppression du code v3 résiduel plutôt que de le garder en référence

**Décision** : `git rm -r firmware/lib firmware/src firmware/include firmware/test firmware/platformio.ini` — suppression complète de l'ancien firmware monolithique v3 (~5300 lignes) qui dormait dans le repo depuis la restructure v4 (commit `73233ea`).

**Contexte** : aucun `platformio.ini` actif (master ou slave) ne référençait ce code, mais il était toujours dans le repo, créait des fausses pistes (`firmware/lib/ConfigManager.cpp` vs `firmware/master/lib/ConfigManager/ConfigManager.cpp`), et polluait les recherches grep. Note : un fichier `firmware/master/include/config_v3_ref.h` avait alors été gardé comme référence historique.

> **MAJ 2026-05-29** : `config_v3_ref.h` a finalement été **supprimé**. Orphelin (jamais inclus), ses valeurs étaient déjà transférées dans `config_master.h`/`config_common.h`, et il était la source d'une fausse "incohérence" (`PIN_PUMP_B=15` v3 vs `27` v4 — simple artefact mono-MCU→distribué). Le pinout v3 reste archivé dans `docs/legacy/`. Repo firmware désormais sans relique.

**Alternatives** :
- Garder pour référence historique (état avant la session) — pollution permanente, fausses pistes.
- Déplacer dans `archive/v3/` — moins de pollution mais dette qui ne s'en va jamais.
- Supprimer (`git rm`) — l'historique git contient toute la v3, accessible par `git log --all -- firmware/lib/ConfigManager/ConfigManager.cpp` si besoin.

**Choix** : suppression complète. L'historique git est notre archive. -5289 lignes du repo actif.

**Conséquences** : zéro risque de référencer accidentellement la v3. Pour récupérer la v3 il faut explicitement chercher dans l'historique git (commande au-dessus). Voir commit `f08225e`.

---

## 2026-04-08 — Lib externes pinées via GitHub tag plutôt que registry PlatformIO

**Décision** : `witnessmenow/Universal-Telegram-Bot @ ^1.3.0` et `paulstoffregen/XPT2046_Touchscreen @ ^1.4` (références registry PlatformIO) sont remplacées par :
```ini
https://github.com/witnessmenow/Universal-Arduino-Telegram-Bot.git#V1.3.0
https://github.com/PaulStoffregen/XPT2046_Touchscreen.git#v1.4
```

**Contexte** : le CI a échoué avec `UnknownPackageError` sur les deux références registry. Soit la registry a été mise à jour et les noms ont changé (`Universal-Telegram-Bot` → `Universal-Arduino-Telegram-Bot`), soit les versions ont disparu. Sans intervention upstream, ces refs ne sont plus résolvables.

**Alternatives** :
- Attendre que le registry soit mis à jour — zero contrôle, dépendance externe.
- Forker les libs en interne — overkill pour 2 libs stables.
- Pin via GitHub tag — registry-indépendant, toujours disponible tant que GitHub existe et que le tag n'est pas force-pushé.

**Choix** : pin GitHub tag. Workflow `git ls-remote --tags` pour vérifier les tags disponibles avant de pin (cas réel : `1.3.0` n'existe pas, c'est `V1.3.0` avec V majuscule).

**Conséquences** : le CI est isolé des changements du registry PlatformIO. Si jamais on veut bumper, c'est `git ls-remote --tags <repo>` pour voir ce qui existe puis update le `#tag`. Voir commits `7b26126`, `5edca84`, `1be8dd1`.

---

## 2026-04-08 — `-I$PROJECT_DIR/include` au lieu de `-I../../common` dans `build_flags`

**Décision** : les chemins d'include relatifs `-I../../common` ont été remplacés par `-I$PROJECT_DIR/../common` et `-I$PROJECT_DIR/include` dans `build_flags` des deux `platformio.ini` (master et slave).

**Contexte** : PlatformIO compile chaque `lib/<Module>/` depuis un cwd différent du dossier projet. Un `-I../../common` relatif résout en `lib/common/` et échoue. De plus, PlatformIO ajoute automatiquement `include/` au path pour la compilation de `src/` mais PAS pour la compilation des libs dans `lib/<Module>/`. Conséquence : les libs ne pouvaient pas trouver `config_master.h` / `config_slave.h`.

**Alternatives** :
- Includes absolus codés en dur — pas portable entre machines.
- Refactor pour copier `config_*.h` dans chaque lib — duplication.
- Variable PlatformIO `$PROJECT_DIR` — résolu en absolu par PIO, valide depuis n'importe quel cwd.

**Choix** : `$PROJECT_DIR`. Pattern documenté dans la doc PlatformIO. Sauvé dans la mémoire user pour les projets multi-firmware futurs.

**Conséquences** : tout le firmware compile correctement sur GitHub Actions runner. Voir commits `ec3f470`, `5537692`. Memory : `reference_platformio_multifirmware_pattern.md`.

---

## 2026-04-08 — Parser JSON minimal récursif dans le mock `deserializeJson`

**Décision** : implémenter un vrai parser JSON dans `firmware/master/test/mocks/Arduino.h::deserializeJson()` au lieu du stub précédent qui vidait juste la doc et retournait ok. Le parser supporte : top-level object, sub-objects 1 niveau (encoding plat `prefix::key`), strings, numbers, booleans, null. PAS d'arrays, PAS de nesting > 1 niveau, PAS d'escape sequences complexes.

**Contexte** : avant le fix, `deserializeJson()` ne parsait pas le payload. Conséquence : le test T13_10 (`fromJson_partial_network_does_not_wipe_existing_secrets`) passait par accident parce que le bloc network était systématiquement skippé. Impossible de valider la VRAIE logique `copyIfPresent` de `ConfigManager::fromJson()`.

**Alternatives** :
- Garder le stub et accepter qu'on ne teste pas la logique parsing — perte de couverture sur un code production critique.
- Utiliser une lib externe (cJSON, nlohmann/json) — overkill, ajoute des dépendances au build natif.
- Parser minimal récursif (~150 lignes) — assez puissant pour les payloads réels du projet, isolé dans `Arduino.h` mock.

**Choix** : parser minimal. Implémenté en namespace `JsonParser` avec `skipWs/parseString/parseValue/parseObject`. Supporte récursion 1 niveau pour les sous-objets via prefix `key::sub`. Stocke un sentinel `__object__` au top-level pour que `containsKey("network")` retourne true.

**Conséquences** : T13_10 valide maintenant que `wifiSsid` est mis à jour ET que `wifiPass` est préservé. 3 nouveaux tests T13_11/12/13 ajoutés (parser simple, parser nested, payload invalide). Limitations connues documentées dans le code. Voir commit `f29ecf6`.

---

## 2026-04-08 — Tests T15 MqttClient/WifiManager : logique pure inline (refus d'instancier)

**Décision** : la catégorie T15 ne tente PAS d'instancier `MqttClient` ou `WifiManager`. À la place, elle teste les algorithmes EXTRAITS verbatim du code de production (formules de backoff, conditions `_hasConfig()`, dispatcher `_onMessage`, topics MQTT, enum `WifiState` redéclaré localement comme `WifiStateT15`).

**Contexte** : MqttClient inclut `PubSubClient.h` + `WiFiClient.h`, WifiManager inclut `WiFi.h` + `DNSServer.h`. Ces headers tirent la pile WiFi ESP32 complète (`wifi_init_config_t`, `esp_wifi_*`, lwip socket layer) qui n'est pas mockable en moins de 2h. Sortir ces 2 modules de `lib_ignore` casserait tout en cascade.

**Alternatives** :
- Mocker la pile WiFi entière + PubSubClient + DNSServer — 2-4h, risque de masquer des bugs par sur-abstraction.
- Refactorer les modules pour séparer logique pure du HAL (interface `IWifiAdapter`, `IMqttAdapter`) — plus propre mais lourd, hors scope d'une session de finalisation.
- Logique pure inline — extrait les algorithmes critiques du code production verbatim et les teste sans dépendance HAL. Couverture imparfaite mais zéro fragilité.

**Choix** : logique pure inline. 10 tests qui couvrent : formule backoff exponentiel WiFi `min(10000 * 2^retries, 60000)`, condition `strlen(mqttHost) > 0`, condition `strlen(wifiSsid) > 0`, dispatch `endsWith(topic, "cmd/water|stop|reset|reboot")`, validation des constantes topics MQTT (`MQTT_TOPIC_SENSORS`, etc.), stabilité ordinale de `WifiStateT15` enum.

**Conséquences** : MqttClient/WifiManager restent en `lib_ignore` (validés en cible ESP32 par `build-master`, pas en SIL natif). Si la formule backoff change dans le code production, le test T15 doit être mis à jour manuellement (couplage par copie). C'est acceptable car cette formule est documentée et stable. Voir commit `1335f05`.

---

## 2026-04-08 — CLI série slave non bloquant via `Serial.setTimeout(50)`

**Décision** : ajouter un CLI série minimal au slave (`pairing_status`, `pairing_reset`, `status`, `reboot`, `help`) appelé en début de chaque itération de `loop()`. Le `Serial.readStringUntil('\n')` utilise un timeout de 50ms (set globalement dans `setup()` via `Serial.setTimeout(50)`) pour ne PAS bloquer la boucle 10 Hz ni le watchdog 30s.

**Contexte** : le slave n'a pas de Telegram bot ni de portail web. Pour le debug et la maintenance hardware, il fallait un moyen d'interagir avec lui en local via USB série. Le master a déjà ces commandes via Telegram (`/pairing_status`, `/pairing_reset`).

**Alternatives** :
- Pas de CLI, debug uniquement via flash et logs — workflow lourd pour des opérations courantes comme le re-pairing.
- CLI bloquant `Serial.readString()` (timeout 1000ms par défaut) — bloque la boucle pendant 1s à chaque tour s'il n'y a rien sur le port. Inacceptable avec watchdog 30s + boucle 10Hz.
- CLI non bloquant avec timeout court 50ms — la boucle 10Hz tolère bien 50ms supplémentaires occasionnels (uniquement quand des données arrivent), watchdog 30s pas du tout impacté.

**Choix** : CLI non bloquant avec `Serial.setTimeout(50)`. Pattern : `if (!Serial.available()) return;` puis `Serial.readStringUntil('\n')` avec timeout court. La boucle reste à ~10 Hz nominal, ralentit à ~5 Hz pendant la frappe d'une commande.

**Conséquences** : Micka peut maintenant se brancher en USB sur le slave pour debug pairing/status sans recompiler ni reflash. Le re-pairing slave depuis le port série est documenté dans `docs/PAIRING.md`. Voir commit `b505ef5`.

---

## 2026-05-17 — Mobile app v4.3 : Politique de sécurité (CSP + sanitization)

**Contexte** : l'app mobile reçoit des payloads MQTT du firmware master ET expose un dashboard accessible via Wi-Fi local. Surfaces d'attaque : XSS via payloads MQTT poisoned, prototype pollution via JSON.parse, DoS via parse-bomb, captation de credentials si CSP relâchée.

**Choix** :
1. **CSP strict** dans `index.html` via `<meta http-equiv>` :
   - `script-src 'self'` (pas de CDN scripts)
   - `style-src 'self' 'unsafe-inline'` (jauges utilisent `style="height:X%"`)
   - `connect-src 'self' http: https: ws: wss:` (master en LAN, pas de domaine fixe)
   - `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`
2. **Sanitization à 3 niveaux** :
   - `escapeHtml()` sur tout user/MQTT content avant insertion DOM (déjà appliqué dans tous les screens)
   - `sanitizeMqttString()` strip control chars + truncate 256 chars (anti log spam)
   - `isSafePayload()` rejette les payloads MQTT avec `__proto__`/`constructor`/`prototype`, nesting > 5 niveaux, ou > 50 clés
3. **Hard cap MQTT payload size** : 1 MB max dans `mqtt-bridge.ts:onMessage`
4. **mqtt.js bundlé via npm** (déjà fait en VAGUE 2.B) — pas de CDN unpkg
5. **Type guards stricts** sur tous les payloads MQTT (`isSensorsPayload`, `isPumpPayload`, `isAlertPayload`)

**Alternatives** :
- CSP nonce-based pour styles inline : nécessite refactor de toutes les jauges (~12 endroits) vers CSS vars custom properties. Reporté à VAGUE 5.B.
- DOMPurify pour sanitization HTML : 22 kB en plus dans le bundle pour un cas d'usage où `escapeHtml()` suffit. Refusé.
- `Trusted Types` API : non supporté Firefox/Safari → fallback silencieux acceptable mais pas obligatoire.

**Conséquences** : 28 tests sanitize + 4 tests MQTT bridge dédiés sécurité (oversize, prototype pollution, control chars, truncation). Bundle main 88 kB inchangé. Le firmware reste source de vérité (X-Hydra-Token pour POST déjà en place).
