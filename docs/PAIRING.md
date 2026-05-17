# PAIRING.md — Procédure de pairing dynamique ESP-NOW

## Pourquoi le pairing dynamique

Les deux ESP32 (maître intérieur, esclave balcon) doivent se connaître par leur
adresse MAC pour communiquer en unicast ESP-NOW. Coder ces adresses en dur
(`0xFF:FF:FF:FF:FF:FF`) empêche toute communication unicast et force le broadcast
permanent. Le pairing dynamique au premier boot règle ce problème sans aucune
intervention manuelle post-flash.

## Procédure — premier boot

1. Flasher les deux firmwares (maître + esclave).
2. Allumer le maître ET l'esclave dans la même pièce (portée ESP-NOW ~100m en
   champ libre).
3. Attendre ~5 secondes.
4. Vérifier les LEDs :
   - Esclave : passe de **bleu fixe** (attente maître, état `AP_MODE`) à vert fixe (connecté).
     Le **jaune clignotant** n'apparaît que plus tard, si le maître se déconnecte *après*
     pairing (état `WARNING` / `isMasterLost()`).
   - Maître  : log série `[ESPNOW] Pairing OK avec esclave XX:XX:XX:XX:XX:XX`
     (cf. `EspNowMaster.cpp:200`).
5. Les MACs sont persistés en NVS — les boots suivants sont directs (pas de
   nouveau handshake).

## Séquence de handshake

```
MAÎTRE                              ESCLAVE
  |                                    |
  |--- CMD_PAIRING_REQ (broadcast) --->|  (toutes les 2s)
  |                                    |  _handlePairingReq() : save NVS, switch peer
  |<-- DATA_PAIRING_ACK (unicast) -----|
  |  _handlePairingAck() : save NVS,   |
  |  switch peer, _paired=true         |
  |--- CMD_PAIRING_CONFIRM (unicast) ->|  (confirme le handshake)
  |                                    |
  |=== Communication normale =========|
```

## Format de stockage NVS

| ESP32  | Namespace | Clé       | Type    | Contenu           |
|--------|-----------|-----------|---------|-------------------|
| Maître | `espnow`  | `peerMac` | bytes 6 | MAC esclave       |
| Esclave| `espnow`  | `peerMac` | bytes 6 | MAC maître        |

## Procédure de re-pairing

Si l'un des ESP32 est remplacé physiquement (ex : nouveau slave après panne) :

**Via Telegram (maître) — RECOMMANDÉ pour usage à distance** :
```
/pairing_reset
```
- Cette commande efface uniquement le pairing NVS du maître (pas la config),
  redémarre, et le maître repart automatiquement en mode pairing.
- Le slave doit être en mode pairing aussi (NVS vide ou `resetPairing()` appelé).
  Solution simple : le slave neuf est forcément en mode pairing au premier flash.
- Permet de re-pairer depuis Cogolin sans rentrer physiquement à Mougins.

**Via port série (debug) — maître** :
Pas de CLI série implémenté côté maître à ce jour (voir `master/src/main.cpp`).
Pour un reset du maître, passer par Telegram (`/pairing_reset`) ou par le bouton
physique GPIO 5 (appui long 10s — factory reset).

**Via port série (debug) — esclave** :
Connecter un câble USB au slave, ouvrir un terminal 115200 baud :
```
pairing_status  — affiche l'état pairing slave (paired=YES/NO + MAC maître)
pairing_reset   — efface NVS pairing slave + reboot (esclave repart en mode pairing)
status          — snapshot complet (humidité, réservoir, pompe, safety, ESP-NOW)
reboot          — redémarre l'ESP32 slave
help            — liste toutes les commandes disponibles
```

Note : le CLI serie slave est non bloquant (timeout 50ms). Il ne perturbe pas
le watchdog 30s ni la boucle 10Hz.

**Factory reset complet (maître)** :
Commande Telegram `/factory_reset` **implémentée** depuis 2026-05-18 avec un
flow 2-step pour éviter les resets accidentels :

1. Premier envoi : `/factory_reset`
   - Bot répond avec un avertissement détaillé (config + pairing + profils
     effacés, reboot en mode AP)
   - Une fenêtre de confirmation de **30 secondes** est armée
2. Confirmation dans la fenêtre : `/factory_reset CONFIRM`
   - Exécute `EspNowMaster::resetPairing()` puis `ConfigManager::reset()`
   - Reboot immédiat → master en mode AP pour reconfig WiFi
3. Toute autre commande envoyée entre 1) et 2) abandonne silencieusement
   l'armement (le timestamp expire seul ou est ignoré)

Si la fenêtre expire, le second message renvoie une erreur explicite et le
user doit recommencer depuis l'étape 1.

Le factory reset est aussi accessible :
- Bouton physique GPIO 5 (appui long 10s)
- HTTP `POST /api/factory-reset` (depuis le réseau local)
- Appel programmatique `configMgr.reset()` (debug only)

Pour l'esclave, le factory reset se fait via le port série (`pairing_reset`) ou
par appel programmatique à `espNow.resetPairing()` depuis le firmware (pas de
Telegram sur le slave).

**Via code** :
```cpp
espNow.resetPairing();  // EspNowMaster ou EspNowSlave
// Puis reboot ou laisser la boucle pairing se relancer automatiquement
```

## Sécurité

**Magic byte** : tout paquet ESP-NOW sans `PROTOCOL_MAGIC = 0xBA` dans le
header est rejeté silencieusement. Cela filtre les devices ESP-NOW d'autres
projets au voisinage (couche application).

**Chiffrement AES-128-CCM** (implémenté 2026-05-18) : depuis v4.2.1, les
communications **unicast post-pairing** sont chiffrées via ESP-NOW natif :

- **PMK** (Primary Master Key, 16 bytes) : commune au master et au slave,
  définie en clair dans `firmware/common/config_common.h:ESPNOW_PMK`.
  Appliquée via `esp_now_set_pmk()` immédiatement après `esp_now_init()`.
- **LMK** (Local Master Key, 16 bytes) : par peer, copiée dans
  `esp_now_peer_info_t.lmk` quand on appelle `esp_now_add_peer()` avec
  `encrypt=true`. Définie dans `ESPNOW_LMK`.

Le **handshake de pairing reste en clair** (broadcast) — c'est forcé car le
slave ne connaît pas encore le MAC du master. Seuls les paquets unicast
post-pairing (`CMD_PING`, `DATA_PONG`, `CMD_PUMP_*`, `DATA_SENSORS`, etc.)
sont chiffrés.

**Modèle de menace couvert** :
- Sniffing passif au voisinage (autres projets ESP-NOW, attaquant WiFi
  promiscuous mode)
- Injection de paquets ESP-NOW depuis un autre device sans la clé
- Replay attacks sur l'unicast chiffré (AES-CCM intègre un nonce)

**Modèle de menace NON couvert** :
- Attaquant physique qui démonte le boîtier et dump le flash → les clés
  sont en clair dans le firmware, donc lisibles
- Compromission d'un des ESP32 → l'attaquant a la PMK et peut sniffer les
  futurs paquets s'il connaît aussi la LMK (extraite du firmware)

Pour usage personnel en appartement (1 paire master+slave), c'est suffisant.
Pour une vraie production, il faudrait :
- Stocker les clés dans la partition `nvs_encrypted` (eFuse-derived key)
- Implémenter un protocole de rotation des clés via OTA
- Sécuriser le pairing initial (ex: appui simultané d'un bouton sur les 2
  devices pour entrer en mode pairing, ECDH pour échanger les clés)

**Rotation des clés** : changer `ESPNOW_PMK` ou `ESPNOW_LMK` dans
`config_common.h` puis re-flasher les 2 firmwares (master + slave). Le
pairing NVS doit être réinitialisé (`/pairing_reset`) car les anciens
peers n'ont plus la bonne LMK.

## Limitations connues

- Validation comportementale du pairing requiert hardware (2 ESP32 physiques).
- En cas de double pairing (deux esclaves répondent simultanément), le maître
  retient le premier `DATA_PAIRING_ACK` reçu. Comportement déterministe car
  la session 1:1 dans cet appartement.
- Aucun timeout de pairing côté maître : si l'esclave n'est jamais allumé, le
  maître continue à broadcaster indéfiniment (coût CPU négligeable).
