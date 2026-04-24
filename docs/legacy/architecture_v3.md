# Architecture — Balcony Hydra v3

## Vue d'ensemble

```
┌─────────────────────────────────────────────┐
│              FIRMWARE ESP32                  │
│                                             │
│  ┌─────────────┐   ┌──────────────────┐    │
│  │ ConfigManager│   │   WebPortal      │    │
│  │ (NVS Flash) │   │ (AsyncWebServer) │    │
│  └──────┬──────┘   └───────┬──────────┘    │
│         │                  │                │
│  ┌──────┴──────┐   ┌──────┴──────────┐    │
│  │ WifiManager │   │  SensorManager  │    │
│  │ (AP + STA)  │   │ (MUX+US+I2C)   │    │
│  └──────┬──────┘   └───────┬─────────┘    │
│         │                  │               │
│  ┌──────┴──────┐   ┌──────┴──────────┐    │
│  │ MqttClient  │   │ PumpController  │    │
│  │ (PubSub)    │   │ (MOSFET+logic)  │    │
│  └──────┬──────┘   └───────┬─────────┘    │
│         │                  │               │
│  ┌──────┴──────┐   ┌──────┴──────────┐    │
│  │ TelegramBot │   │  SleepManager   │    │
│  │ (alertes)   │   │ (deep sleep)    │    │
│  └─────────────┘   └────────────────-┘    │
└─────────────────────────────────────────────┘
```

## Modules C++

| Module | Classe | Responsabilité |
|--------|--------|----------------|
| ConfigManager | `ConfigManager` | Sauvegarde/chargement NVS, defaults, validation |
| WifiManager | `WifiManager` | Mode AP (portail captif), mode STA, reconnexion auto |
| WebPortal | `WebPortal` | AsyncWebServer, page HTML embarquée, API REST |
| SensorManager | `SensorManager` | Lecture MUX, calibration humidité, US, BME280, INA219 |
| PumpController | `PumpController` | Logique scheduling, durée, seuils, failsafe |
| MqttClient | `MqttClient` | Publication données, subscription commandes |
| TelegramBot | `TelegramBot` | Alertes push, commandes /status /water /stop |
| SleepManager | `SleepManager` | Deep sleep, réveil RTC, mode dégradé |

## Modes de fonctionnement

### Mode AUTOMATIQUE (défaut)
- Réveil toutes les N heures (configurable)
- Lecture capteurs humidité
- Si humidité < seuil min → arrosage (durée configurable)
- Si humidité > seuil max → skip
- Publication MQTT + heartbeat Telegram
- Retour deep sleep

### Mode SCHEDULÉ
- Arrosage à heures fixes (matin/soir, configurable)
- Durée de pompe fixe, pas de décision sur l'humidité
- Capteurs utilisés pour monitoring uniquement

### Mode MANUEL
- Arrosage uniquement sur commande (web ou Telegram)
- Monitoring continu

### Mode DÉGRADÉ (WiFi perdu)
- Arrosage continue en local sur le dernier schedule connu
- Timer RTC indépendant
- Reprend monitoring au retour WiFi

## Failsafes

1. **Niveau réservoir < 10%** → coupure pompe immédiate (hardware failsafe)
2. **Pompe runtime > 5 min** → coupure automatique (anti-inondation)
3. **Courant pompe anormal** (INA219) → alerte + coupure
4. **Niveaux US divergents** entre bidons → alerte raccord obstrué
5. **Watchdog hardware** → reset auto si firmware freeze (30s timeout)
6. **Pull-down MOSFET** → pompe OFF au boot/reset (hardware)
