# DECISIONS.md — Balcony Hydra v4

> Trace les décisions de design importantes, en particulier celles dont le **pourquoi** ne se devine pas facilement à la lecture du code. Format : date, décision, contexte, alternatives évaluées, choix retenu, conséquences.
>
> Ne pas re-documenter ce qui est évident ou déjà dans CLAUDE.md / TODO.md.

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

**Contexte** : aucun `platformio.ini` actif (master ou slave) ne référençait ce code, mais il était toujours dans le repo, créait des fausses pistes (`firmware/lib/ConfigManager.cpp` vs `firmware/master/lib/ConfigManager/ConfigManager.cpp`), et polluait les recherches grep. Note : un fichier `firmware/master/include/config_v3_ref.h` est intentionnellement gardé comme référence historique pour les valeurs constantes que l'on a transférées vers `config_master.h` / `config_common.h`.

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
