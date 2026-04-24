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
Commande Telegram `/factory_reset` **non implémentée** à ce jour (voir TODO.md).
Le factory reset passe par le bouton physique (appui long 10s) ou par appel
programmatique à `configMgr.factoryReset()` via une version de debug du firmware.

Pour l'esclave, le factory reset se fait via le port série (`pairing_reset`) ou
par appel programmatique à `espNow.resetPairing()` depuis le firmware (pas de
Telegram sur le slave).

**Via code** :
```cpp
espNow.resetPairing();  // EspNowMaster ou EspNowSlave
// Puis reboot ou laisser la boucle pairing se relancer automatiquement
```

## Sécurité

La sécurité repose uniquement sur le magic byte `0xBA` (PROTOCOL_MAGIC) dans
chaque header : tout paquet ESP-NOW sans ce magic est rejeté silencieusement.
Cela filtre les devices ESP-NOW d'autres projets au voisinage.

Pas de chiffrement PMK/LMK implémenté à ce stade (voir TODO.md §Sécurité).
Suffisant pour un usage personnel en appartement (1 paire maître+esclave).

## Limitations connues

- Validation comportementale du pairing requiert hardware (2 ESP32 physiques).
- En cas de double pairing (deux esclaves répondent simultanément), le maître
  retient le premier `DATA_PAIRING_ACK` reçu. Comportement déterministe car
  la session 1:1 dans cet appartement.
- Aucun timeout de pairing côté maître : si l'esclave n'est jamais allumé, le
  maître continue à broadcaster indéfiniment (coût CPU négligeable).
