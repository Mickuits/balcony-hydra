# Mosquitto broker — Balcony Hydra

Broker MQTT local pour le firmware ESP32 master et l'app mobile (Phase 2).

## Démarrage rapide

```bash
cd infrastructure/mosquitto

# 1. Créer l'utilisateur firmware (une seule fois)
docker run --rm -v "$(pwd)/config:/mosquitto/config" eclipse-mosquitto:2 \
  mosquitto_passwd -c -b /mosquitto/config/passwd hydra <FW_PASSWORD>

# 2. Ajouter l'utilisateur mobile (sans -c, append)
docker run --rm -v "$(pwd)/config:/mosquitto/config" eclipse-mosquitto:2 \
  mosquitto_passwd -b /mosquitto/config/passwd mobile <MOBILE_PASSWORD>

# 3. Lancer le broker
docker compose up -d

# 4. Vérifier
docker compose logs -f
```

## Ports

| Port | Protocole | Usage |
|---|---|---|
| 1883 | MQTT TCP | Firmware ESP32 (PubSubClient) |
| 9001 | MQTT WebSocket | App mobile depuis navigateur (mqtt.js) |

## Vérifier que le broker tourne

**Test subscribe** :
```bash
docker exec -it hydra-mqtt mosquitto_sub \
  -u hydra -P <FW_PASSWORD> \
  -t 'hydra/#' -v
```

**Test publish** :
```bash
docker exec -it hydra-mqtt mosquitto_pub \
  -u hydra -P <FW_PASSWORD> \
  -t 'hydra/sensors' -m '{"avgMoisture":42}'
```

Si tu vois `hydra/sensors {"avgMoisture":42}` dans le sub → le broker fonctionne.

## Configuration firmware

Dans `firmware/include/secrets.h` (à créer depuis `secrets.h.example`) :

```cpp
#define MQTT_HOST     "192.168.1.10"  // IP du host docker
#define MQTT_PORT     1883
#define MQTT_USER     "hydra"
#define MQTT_PASSWORD "<FW_PASSWORD>"
```

## Configuration app mobile

Dans le HTML (Phase 2, switch dev/prod) :

```js
const MQTT_CONFIG = {
  url: 'ws://192.168.1.10:9001',  // WebSocket port
  username: 'mobile',
  password: '<MOBILE_PASSWORD>',
  clientId: 'hydra-mobile-' + crypto.randomUUID()
};
```

## Persistance

Les volumes `./data` et `./log` sont mappés en bind-mount. Les retained
messages (sensors, pump status) survivent aux redémarrages.

Pour wipe complet :
```bash
docker compose down -v
rm -rf data/* log/*
```

## TLS (production)

Pour exposer le broker hors LAN, ajouter un reverse proxy nginx avec
Let's Encrypt, ou activer TLS natif Mosquitto :

```conf
# Dans mosquitto.conf, listener 8883
listener 8883
protocol mqtt
cafile   /mosquitto/certs/ca.crt
certfile /mosquitto/certs/server.crt
keyfile  /mosquitto/certs/server.key
require_certificate false
```

## Troubleshooting

**Erreur "Connection refused" depuis ESP32**
→ Vérifier que le port 1883 est bien ouvert sur le host (`docker ps`)
→ Vérifier que le firewall LAN autorise le port
→ Tester depuis le LAN : `mosquitto_pub -h <host_ip> -p 1883 -u hydra -P ...`

**Erreur "Bad credentials"**
→ Le passwd n'a pas été créé. Refaire l'étape 1 du démarrage rapide.

**App mobile : "WebSocket connection failed"**
→ Vérifier que le listener 9001 est actif (`docker compose logs | grep 9001`)
→ Si l'app est servie en HTTPS, le broker doit aussi être en WSS (TLS)

## ACL fine-grain (optionnel)

Pour restreindre les permissions par user, créer `config/acl` :

```
# firmware peut tout faire sur hydra/*
user hydra
topic readwrite hydra/#

# mobile peut seulement lire sensors/pump/alerts et publier cmd
user mobile
topic read  hydra/sensors
topic read  hydra/pump
topic read  hydra/alerts
topic write hydra/cmd/+
```

Puis décommenter `acl_file /mosquitto/config/acl` dans `mosquitto.conf`.
