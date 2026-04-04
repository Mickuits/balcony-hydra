import { useState } from "react";

const diagrams = [
  {
    id: "bdd",
    title: "BDD",
    subtitle: "Block Definition",
    description: "Décomposition structurelle du système — blocs, sous-systèmes, interfaces",
    mermaid: `classDiagram
    direction TB

    class BalconyHydra_v4 {
        «system»
        20 pots · 2 zones
        ESP-NOW + MQTT
        Mougins le Haut
    }

    class ESP32_Maitre {
        «block» Intérieur
        -USB_5V : Alimentation
        -WiFi_STA : Réseau maison
        -ESP_NOW : Peer-to-peer
        +pilotePompeB()
        +gèreDashboard()
        +envoyerCommande()
        +recevoirDonnées()
        +alerterTelegram()
    }

    class ESP32_Esclave {
        «block» Balcon
        -Solaire_LiFePO4 : Alimentation
        -ESP_NOW : Peer-to-peer
        -MQTT_fallback : Via routeur
        +pilotePompeA()
        +lireCapteurs()
        +exécuterCommande()
        +modeDégradé()
    }

    class TFT_Dashboard {
        «block» ILI9341 2.4 tactile
        +écranPrincipal()
        +écranConfigWiFi()
        +écranArrosage()
        +écranSécurité()
        +écranCapteursDétail()
    }

    class SafetyManager {
        «block» Sécurité 5 couches
        -relayGPIO18 : Coupure HW
        -thermalLockout : bool
        -crashSafeMode : bool
        +armPump() bool
        +disarmPump()
        +remoteUnlock()
        +autoRecovery()
    }

    class TimeManager {
        «block» Horloge + Solaire
        -DS3231_RTC : I2C 0x68
        -NTP_sync : 3 serveurs
        -algorithme_NOAA : Solaire
        +getTime() tm
        +sunrise() SolarTimes
        +sunset() SolarTimes
        +syncNTP()
    }

    class PumpController_Maitre {
        «block» Zone B Intérieur
        -GPIO27 : MOSFET
        -10_capteurs : MUX
        +start(durationS)
        +stop(reason)
        +shouldAutoWater() bool
    }

    class PumpController_Esclave {
        «block» Zone A Balcon
        -GPIO27 : MOSFET
        -10_capteurs : MUX
        -INA219 : Courant
        +start(durationS)
        +stop(reason)
        +failsafesLocaux()
    }

    class ZoneBalcon {
        «zone» Extérieur
        10 pots
        2×25L réservoirs
        Goutteurs 4-8 L/h
        BME280 T/HR/P
    }

    class ZoneInterieur {
        «zone» Intérieur
        10 pots
        1×25L réservoir
        Goutteurs 2-4 L/h
    }

    class Communication {
        «interface»
        +ESP_NOW_primaire()
        +MQTT_fallback()
        +heartbeat_60s()
        +chiffrement_PMK_LMK()
    }

    class EnergieBalcon {
        «block» Autonome
        Panneau 20W
        LiFePO4 12V 6Ah
        MPPT 10A
        Fusible therm 72°C
    }

    BalconyHydra_v4 *-- ESP32_Maitre
    BalconyHydra_v4 *-- ESP32_Esclave
    BalconyHydra_v4 *-- Communication
    ESP32_Maitre *-- TFT_Dashboard
    ESP32_Maitre *-- SafetyManager
    ESP32_Maitre *-- TimeManager
    ESP32_Maitre *-- PumpController_Maitre
    ESP32_Esclave *-- PumpController_Esclave
    ESP32_Esclave *-- EnergieBalcon
    PumpController_Maitre --> ZoneInterieur : irrigue
    PumpController_Esclave --> ZoneBalcon : irrigue
    ESP32_Maitre ..> Communication : utilise
    ESP32_Esclave ..> Communication : utilise`
  },
  {
    id: "ibd",
    title: "IBD",
    subtitle: "Internal Block",
    description: "Flux internes, ports, interfaces entre composants — vue data flow",
    mermaid: `flowchart TB
    subgraph MAITRE["🏠 ESP32 MAÎTRE — Intérieur"]
        direction TB
        CM[ConfigManager<br/>NVS + JSON]
        SM_M[SensorManager<br/>10 capteurs MUX<br/>US réservoir int]
        PC_B[PumpController<br/>Zone B · GPIO 27]
        SAF[SafetyManager<br/>Relay GPIO 18<br/>Thermal + Crash]
        TM[TimeManager<br/>DS3231 + NTP<br/>Solaire NOAA]
        TFT[TftDashboard<br/>ILI9341 tactile<br/>5 écrans]
        WF[WifiManager<br/>AP + STA<br/>Backoff exp.]
        WEB[WebPortal<br/>AsyncWebServer<br/>REST API]
        TG[TelegramBot<br/>Push alerts<br/>/unlock /safety]
        MQ[MqttClient<br/>Cloud broker<br/>60s publish]
        ENM[EspNowMaster<br/>CMD→Esclave<br/>DATA←Esclave]
        LED_M[StatusLED<br/>RGB · 10 états]

        CM -->|config| PC_B
        CM -->|config| SAF
        SM_M -->|humidité zone B| PC_B
        SM_M -->|température| SAF
        SM_M -->|tank level| PC_B
        SAF -->|arm/disarm| PC_B
        TM -->|heure + solaire| PC_B
        TM -->|date/heure| TFT
        ENM -->|données esclave| TFT
        ENM -->|données esclave| WEB
        ENM -->|données esclave| MQ
        ENM -->|alertes esclave| TG
        SAF -->|état sécurité| TFT
        SAF -->|alertes| TG
        PC_B -->|état pompe| TFT
        WF -->|état WiFi| TFT
        WF -->|état WiFi| LED_M
    end

    subgraph ESCLAVE["☀️ ESP32 ESCLAVE — Balcon"]
        direction TB
        SM_S[SensorManager<br/>10 capteurs MUX<br/>US réservoir bal<br/>BME280 · INA219]
        PC_A[PumpController<br/>Zone A · GPIO 27]
        ENS[EspNowSlave<br/>CMD←Maître<br/>DATA→Maître]
        SL[SafetyLocal<br/>Pull-down 10kΩ<br/>Fusibles 3A/5A]
        DM[DegradedMode<br/>Arrosage local<br/>NVS schedule]
        LED_S[StatusLED<br/>RGB · états]

        SM_S -->|humidité zone A| PC_A
        SM_S -->|courant pompe| SL
        SM_S -->|tank level| PC_A
        SM_S -->|données| ENS
        ENS -->|commandes| PC_A
        SL -->|failsafe| PC_A
        DM -->|si maître perdu| PC_A
        ENS -->|état comm| LED_S
    end

    subgraph COMM["📡 Communication Sans Fil"]
        ESPNOW[ESP-NOW<br/>Peer-to-peer<br/>Chiffré · 5ms]
        MQTTL[MQTT Fallback<br/>Via routeur WiFi<br/>Backup]
    end

    ENM <-->|CMD / DATA| ESPNOW
    ENS <-->|CMD / DATA| ESPNOW
    ENM <-.->|fallback| MQTTL
    ENS <-.->|fallback| MQTTL

    subgraph CLOUD["☁️ Services Externes"]
        BROKER[MQTT Broker<br/>HiveMQ]
        TGAPI[Telegram API<br/>Bot alerts]
        NTPS[NTP Servers<br/>pool.ntp.org]
    end

    MQ -->|publish| BROKER
    TG -->|push| TGAPI
    TM -->|sync| NTPS

    style MAITRE fill:#1a2332,stroke:#3b82f6,stroke-width:2px,color:#e2e8f0
    style ESCLAVE fill:#1a2820,stroke:#22c55e,stroke-width:2px,color:#e2e8f0
    style COMM fill:#2d1f33,stroke:#a855f7,stroke-width:2px,color:#e2e8f0
    style CLOUD fill:#2d2520,stroke:#f59e0b,stroke-width:2px,color:#e2e8f0`
  },
  {
    id: "seq",
    title: "Séquence",
    subtitle: "Communication M↔S",
    description: "Séquence de messages maître/esclave — cycle normal, perte de comm, recovery",
    mermaid: `sequenceDiagram
    participant U as 👤 Utilisateur
    participant M as 🏠 Maître
    participant E as ☀️ Esclave
    participant T as 📱 Telegram
    participant C as ☁️ MQTT Cloud

    Note over M,E: ── BOOT & PAIRING ──
    M->>M: Boot 10 étapes
    M->>M: DS3231 → system time
    M->>M: WiFi STA + ESP-NOW init
    E->>E: Boot, init capteurs
    E->>E: ESP-NOW init (MAC maître)
    M->>E: CMD_PING
    E->>M: DATA_PONG {uptime, battery_v, rssi}
    M->>M: Esclave détecté ✅

    Note over M,E: ── CYCLE NORMAL (30s) ──
    loop Toutes les 30s
        M->>E: CMD_READ_SENSORS
        E->>E: Lecture MUX + US + BME280 + INA219
        E->>M: DATA_SENSORS {moisture[10], tank, temp, hum, current}
        M->>M: updateZoneMoisture()
        M->>M: shouldAutoWater(zone_A) ?
        M->>C: MQTT publish {zone_a, zone_b, safety}
    end

    Note over M,E: ── ARROSAGE AUTO ZONE A ──
    M->>M: Zone A hum 22% < seuil 30%
    M->>M: Cooldown OK + max cycles OK
    M->>M: SafetyManager.armPump()
    M->>E: CMD_PUMP_START {duration: 60}
    E->>E: MOSFET ON → Pompe A démarre
    E->>M: DATA_ACK {success: true}
    M->>T: 🌱 AUTO Balcon hum 22% → arrosage
    E->>E: 60s écoulées
    E->>E: MOSFET OFF → Pompe A arrêtée
    E->>M: DATA_PUMP_STATUS {state: IDLE, duration: 60}
    M->>M: SafetyManager.disarmPump()

    Note over M,E: ── FAILSAFE ESCLAVE ──
    E->>E: INA219 courant > 3A !
    E->>E: STOP pompe (OVERCURRENT)
    E->>M: DATA_ALERT {type: OVERCURRENT, msg: ...}
    M->>M: SafetyManager.notifyPumpOvercurrent()
    M->>T: 🔴⚡ SURINTENSITÉ pompe balcon
    U->>T: /unlock
    M->>M: SafetyManager.remoteUnlock()
    M->>E: CMD_PUMP_STOP
    M->>T: ✅ Système déverrouillé

    Note over M,E: ── PERTE DE COMMUNICATION ──
    M->>E: CMD_PING
    E--xM: (pas de réponse)
    M->>E: CMD_PING (retry 2)
    E--xM: (pas de réponse)
    M->>E: CMD_PING (retry 3)
    E--xM: (pas de réponse)
    M->>T: ⚠ Esclave balcon non-responsive !
    M->>M: Bascule MQTT fallback
    E->>E: 3 PING manqués → MODE DÉGRADÉ
    E->>E: Arrosage local NVS schedule
    Note over E: Continue d'arroser seul

    Note over M,E: ── RECOVERY ──
    M->>E: CMD_PING (ESP-NOW retry)
    E->>M: DATA_PONG ✅
    E->>M: DATA_SENSORS (données accumulées)
    M->>T: ✅ Esclave balcon reconnecté`
  },
  {
    id: "stm-safety",
    title: "STM Safety",
    subtitle: "Machine à états",
    description: "SafetyManager — transitions entre états de sécurité, auto-recovery vs hard lockout",
    mermaid: `stateDiagram-v2
    direction TB

    [*] --> BOOT
    BOOT --> SAFE_MODE : 3+ crashes en 30s
    BOOT --> NOMINAL : boot stable

    state NOMINAL {
        [*] --> OK
        OK --> OK : capteurs normaux
    }

    NOMINAL --> WARNING : T° > 50°C\\nou réservoir < 25%
    WARNING --> NOMINAL : T° < 47°C\\net réservoir > 25%

    WARNING --> LOCKOUT_AUTO : T° > 58°C\\nou réservoir < 10%

    state LOCKOUT_AUTO {
        [*] --> ThermalLockout
        [*] --> TankLockout
        ThermalLockout --> CoolingDown : T° < 45°C
        CoolingDown --> CoolingDown : Timer 5 min
        TankLockout --> TankRecovered : niveau > 10%
    }

    LOCKOUT_AUTO --> NOMINAL : auto-recovery\\n(T° stable 5min\\nou tank rempli)

    NOMINAL --> LOCKOUT_HARD : overcurrent > 3A\\ndry-run < 50mA

    state LOCKOUT_HARD {
        [*] --> WaitUnlock
        WaitUnlock --> WaitUnlock : système bloqué\\nWiFi + Telegram actifs
    }

    LOCKOUT_HARD --> NOMINAL : /unlock Telegram\\nou bouton physique

    state SAFE_MODE {
        [*] --> MinimalBoot
        MinimalBoot --> MinimalBoot : pompe OFF\\nWiFi + TG actifs\\nLED rouge clignotant
    }

    SAFE_MODE --> NOMINAL : /unlock Telegram\\nou bouton 10s

    note right of LOCKOUT_AUTO
        AUTO-RECOVERY
        Le système se réarme seul
        quand la condition disparaît
    end note

    note right of LOCKOUT_HARD
        HARD LOCKOUT
        Nécessite intervention
        /unlock ou bouton physique
    end note

    note right of SAFE_MODE
        WiFi + Telegram restent
        actifs pour /unlock distant
    end note`
  },
  {
    id: "stm-pump",
    title: "STM Pompe",
    subtitle: "Machine à états",
    description: "PumpController par zone — cycle de vie d'une pompe avec failsafes",
    mermaid: `stateDiagram-v2
    direction TB

    [*] --> IDLE : Boot / init

    state IDLE {
        [*] --> Prêt
        Prêt --> Prêt : attente trigger
    }

    IDLE --> RUNNING : start(zone, duration)\\n+ SafetyManager.armPump()

    state RUNNING {
        [*] --> Pompage
        Pompage --> CheckFailsafes : chaque seconde
        CheckFailsafes --> Pompage : tous OK
        CheckFailsafes --> MaxRuntime : elapsed > 300s
        CheckFailsafes --> TankEmpty : US level < 10%
        CheckFailsafes --> Overcurrent : INA219 > 3000mA
        CheckFailsafes --> DryRun : INA219 < 50mA\\naprès 3s
    }

    RUNNING --> IDLE : duration terminée\\n(DURATION_DONE)
    RUNNING --> IDLE : stop manuel\\n(MANUAL_STOP)
    RUNNING --> IDLE : max runtime\\n(MAX_RUNTIME)

    RUNNING --> BLOCKED : tank empty
    RUNNING --> BLOCKED : overcurrent\\n→ SafetyManager.notifyOvercurrent()
    RUNNING --> BLOCKED : dry-run\\n→ SafetyManager.notifyDryRun()

    state BLOCKED {
        [*] --> FailsafeActif
        FailsafeActif --> FailsafeActif : pompe OFF\\nattente reset
    }

    BLOCKED --> IDLE : resetFailsafe()\\n(tank auto-recovery\\nou /reset Telegram)

    note left of RUNNING
        Relay sécurité ARMÉ
        MOSFET GPIO ON
        LED cyan fixe
        INA219 monitoring actif
    end note

    note right of BLOCKED
        Tank: auto-recovery\\nquand niveau remonte
        \\nOvercurrent/DryRun:\\nnécessite /unlock
    end note`
  },
  {
    id: "act",
    title: "Activité",
    subtitle: "Cycle arrosage AUTO",
    description: "Diagramme d'activité — flux complet d'un cycle d'arrosage automatique par zone",
    mermaid: `flowchart TD
    START((Cycle capteurs<br/>toutes les 30s)) --> READ[Lecture 20 capteurs<br/>via MUX1 + MUX2]
    READ --> CALC[Calcul moyenne<br/>humidité par zone]
    CALC --> CHECK_MODE{Mode = AUTO ?}

    CHECK_MODE -->|Non| CHECK_SCHED{Mode SCHEDULED<br/>ou SOLAR ?}
    CHECK_SCHED -->|SCHEDULED| IS_TIME{Heure = schedule ?}
    CHECK_SCHED -->|SOLAR| IS_SOLAR{Heure = lever ou<br/>coucher soleil ?}
    CHECK_SCHED -->|MANUAL| DONE((Fin cycle))
    IS_TIME -->|Non| DONE
    IS_SOLAR -->|Non| DONE
    IS_TIME -->|Oui| SCHED_START[Arrosage toutes zones]
    IS_SOLAR -->|Oui| SCHED_START

    CHECK_MODE -->|Oui| ZONE_LOOP[Pour chaque zone<br/>A=Balcon B=Intérieur]

    ZONE_LOOP --> CHECK_HUM{Humidité zone<br/>< seuil min ?}
    CHECK_HUM -->|Non ≥ seuil| ZONE_OK[Zone OK<br/>pas besoin d'eau]
    ZONE_OK --> NEXT_ZONE{Autre zone ?}
    NEXT_ZONE -->|Oui| ZONE_LOOP
    NEXT_ZONE -->|Non| ALERTS

    CHECK_HUM -->|Oui < seuil| CHECK_COOL{Cooldown 2h<br/>respecté ?}
    CHECK_COOL -->|Non| COOL_WAIT[Attente cooldown<br/>log série]
    COOL_WAIT --> NEXT_ZONE

    CHECK_COOL -->|Oui| CHECK_MAX{Max 4 cycles/24h<br/>respecté ?}
    CHECK_MAX -->|Non| MAX_WAIT[Max atteint<br/>log série]
    MAX_WAIT --> NEXT_ZONE

    CHECK_MAX -->|Oui| CHECK_LOCK{SafetyManager<br/>lockout ?}
    CHECK_LOCK -->|Oui| LOCK_BLOCK[Lockout actif<br/>LED rouge]
    LOCK_BLOCK --> NEXT_ZONE

    CHECK_LOCK -->|Non| ARM[SafetyManager<br/>armPump]
    ARM --> ARM_OK{Relay armé ?}
    ARM_OK -->|Non| ARM_FAIL[Arm refusé<br/>LED erreur]
    ARM_FAIL --> NEXT_ZONE

    ARM_OK -->|Oui| PUMP_START[Pompe zone ON<br/>MOSFET HIGH]
    PUMP_START --> PUMP_RUN[Pompage<br/>durée configurée]
    PUMP_RUN --> CHECK_FS{Failsafes OK ?}
    CHECK_FS -->|Tank vide| FS_TANK[STOP + BLOCK<br/>alerte Telegram]
    CHECK_FS -->|Surintensité| FS_OC[STOP + HARD LOCKOUT<br/>alerte Telegram]
    CHECK_FS -->|Marche à sec| FS_DR[STOP + HARD LOCKOUT<br/>alerte Telegram]
    CHECK_FS -->|OK| TIME_UP{Durée atteinte ?}
    TIME_UP -->|Non| PUMP_RUN
    TIME_UP -->|Oui| PUMP_STOP[Pompe zone OFF<br/>MOSFET LOW]
    PUMP_STOP --> DISARM[SafetyManager<br/>disarmPump]
    DISARM --> NOTIFY[Telegram<br/>arrosage terminé]
    NOTIFY --> NEXT_ZONE

    FS_TANK --> NEXT_ZONE
    FS_OC --> NEXT_ZONE
    FS_DR --> NEXT_ZONE

    SCHED_START --> PUMP_START

    ALERTS[Vérification alertes<br/>pots chroniquement secs] --> DONE

    style START fill:#3b82f6,color:white
    style DONE fill:#6b7280,color:white
    style PUMP_START fill:#22c55e,color:white
    style PUMP_STOP fill:#22c55e,color:white
    style FS_TANK fill:#ef4444,color:white
    style FS_OC fill:#ef4444,color:white
    style FS_DR fill:#ef4444,color:white
    style LOCK_BLOCK fill:#ef4444,color:white`
  },
  {
    id: "uc",
    title: "Use Cases",
    subtitle: "Cas d'utilisation",
    description: "Fonctionnalités du système du point de vue utilisateur — interactions et acteurs",
    mermaid: `flowchart TB
    subgraph ACTEURS["Acteurs"]
        USER["👤 Utilisateur<br/>(Micka)"]
        SOLEIL["☀️ Soleil<br/>(timer solaire)"]
        HORLOGE["⏰ Horloge<br/>(RTC + NTP)"]
        PLANTE["🌱 Plantes<br/>(capteurs humidité)"]
    end

    subgraph SYS["«system» Balcony Hydra v4"]
        subgraph CONFIG["Configuration"]
            UC1["Configurer WiFi<br/>via écran tactile"]
            UC2["Paramétrer seuils<br/>humidité par zone"]
            UC3["Choisir mode<br/>AUTO/SCHED/SOLAR/MANUAL"]
            UC4["Régler horaires<br/>schedule"]
            UC5["Configurer offset<br/>lever/coucher soleil"]
        end

        subgraph ARROSAGE["Arrosage"]
            UC6["Arrosage<br/>automatique"]
            UC7["Arrosage<br/>programmé"]
            UC8["Arrosage<br/>solaire"]
            UC9["Arrosage<br/>manuel"]
        end

        subgraph MONITORING["Monitoring"]
            UC10["Consulter dashboard<br/>TFT / Web"]
            UC11["Recevoir alertes<br/>Telegram"]
            UC12["Surveiller état<br/>via MQTT"]
            UC13["Visualiser humidité<br/>par pot"]
        end

        subgraph SECURITE["Sécurité"]
            UC14["Déverrouiller<br/>lockout distant"]
            UC15["Consulter état<br/>sécurité"]
            UC16["Reset failsafe<br/>pompe"]
            UC17["Rebooter<br/>système"]
        end

        subgraph MAINTENANCE["Maintenance"]
            UC18["OTA firmware<br/>update"]
            UC19["Calibrer<br/>capteurs"]
            UC20["Factory reset"]
        end
    end

    USER --> UC1
    USER --> UC2
    USER --> UC3
    USER --> UC9
    USER --> UC10
    USER --> UC14
    USER --> UC18

    PLANTE --> UC6
    HORLOGE --> UC7
    SOLEIL --> UC8

    UC6 -.->|include| UC13
    UC11 -.->|extend| UC14
    UC14 -.->|include| UC15

    style CONFIG fill:#1e3a5f,stroke:#3b82f6,color:#e2e8f0
    style ARROSAGE fill:#1a3320,stroke:#22c55e,color:#e2e8f0
    style MONITORING fill:#3d2f0a,stroke:#f59e0b,color:#e2e8f0
    style SECURITE fill:#3d0a0a,stroke:#ef4444,color:#e2e8f0
    style MAINTENANCE fill:#2d1f33,stroke:#a855f7,color:#e2e8f0`
  },
  {
    id: "deploy",
    title: "Déploiement",
    subtitle: "Hardware physique",
    description: "Diagramme de déploiement — nœuds physiques, protocoles, composants déployés",
    mermaid: `flowchart TB
    subgraph APPART["🏠 Appartement Mougins le Haut"]
        subgraph BOITIER_M["📦 Boîtier Maître — Intérieur"]
            ESP_M["ESP32 WROOM-32<br/>240MHz · 4MB Flash"]
            TFT["LCD TFT 2.4 ILI9341<br/>320×240 tactile<br/>SPI + XPT2046"]
            RTC["DS3231 RTC<br/>I2C 0x68<br/>CR2032 backup"]
            RELAY["Module Relais 5V<br/>GPIO 18<br/>Coupe pompe B"]
            LED_M2["LED RGB<br/>10 états"]
            BTN["Bouton IP67<br/>GPIO 5"]
        end

        subgraph ZONE_B_HW["💧 Zone B — Intérieur"]
            POMPEB["Pompe péristaltique<br/>12V · MOSFET GPIO 27"]
            MUXB["MUX CD74HC4067<br/>10 capteurs humidité"]
            USB["Capteur US JSN-SR04T<br/>Réservoir intérieur"]
            RESB["Réservoir 25L<br/>dédié intérieur"]
            POTSB["10 Pots<br/>Plantes vertes<br/>Goutteurs 2-4 L/h"]
        end

        USB_PSU["🔌 USB 5V Secteur"]

        USB_PSU -->|5V DC| ESP_M
        ESP_M -->|SPI| TFT
        ESP_M -->|I2C| RTC
        ESP_M -->|GPIO 18| RELAY
        ESP_M -->|PWM| LED_M2
        ESP_M -->|ISR| BTN
        ESP_M -->|GPIO 27| POMPEB
        ESP_M -->|Analog + Digital| MUXB
        ESP_M -->|GPIO 14+34| USB
        POMPEB -->|tube 4/6mm| POTSB
        RESB -->|aspiration| POMPEB
        MUXB -->|fils JST| POTSB
    end

    subgraph BALCON["☀️ Balcon Plein Sud"]
        subgraph BOITIER_S["📦 Boîtier Esclave IP65 — Blanc"]
            ESP_S["ESP32 WROOM-32<br/>240MHz · 4MB Flash"]
            BME["BME280<br/>I2C 0x76<br/>T° HR Pression"]
            INA["INA219<br/>I2C 0x40<br/>Courant pompe"]
            LED_S2["LED RGB<br/>États + dégradé"]
        end

        subgraph ZONE_A_HW["💧 Zone A — Balcon"]
            POMPEA["Pompe péristaltique<br/>12V · MOSFET GPIO 27"]
            MUXA["MUX CD74HC4067<br/>10 capteurs humidité"]
            USA["Capteur US JSN-SR04T<br/>Réservoirs balcon"]
            RESA["2× Réservoirs 25L<br/>Vases communicants<br/>50L total"]
            POTSA["10 Pots<br/>Citronnier aromates<br/>Goutteurs 4-8 L/h"]
        end

        subgraph ENERGIE["⚡ Boîtier Énergie — Ventilé"]
            SOLAR["Panneau 20W<br/>Mono · MC4"]
            BATT["LiFePO4 12V 6Ah<br/>BMS intégré"]
            MPPT2["MPPT 10A<br/>Mode LiFePO4"]
            LM["LM2596<br/>12V → 5V"]
            FUSE_T["Fusible therm 72°C"]
            FUSE5["Fusible 5A"]
            FUSE3["Fusible 3A"]
        end

        SOLAR -->|MC4| MPPT2
        MPPT2 -->|charge| BATT
        BATT -->|12V| FUSE5
        FUSE5 --> LM
        FUSE5 --> FUSE3
        FUSE3 -->|12V pompe| POMPEA
        LM -->|5V| ESP_S
        FUSE_T -.->|coupe si >72°C| BATT
        ESP_S -->|I2C| BME
        ESP_S -->|I2C| INA
        ESP_S -->|GPIO 27| POMPEA
        ESP_S -->|Analog| MUXA
        ESP_S -->|GPIO| USA
        POMPEA -->|tube 4/6mm| POTSA
        RESA -->|aspiration| POMPEA
        MUXA -->|fils JST| POTSA
    end

    subgraph CLOUD2["☁️ Cloud"]
        BROKER2["MQTT Broker"]
        TELEGRAM["Telegram Bot API"]
        NTP["NTP Servers"]
    end

    ESP_M <-->|"ESP-NOW 2.4GHz<br/>Peer-to-peer<br/>Chiffré PMK+LMK"| ESP_S
    ESP_M <-.->|"MQTT fallback<br/>via routeur WiFi"| ESP_S
    ESP_M -->|MQTT publish| BROKER2
    ESP_M -->|HTTPS| TELEGRAM
    ESP_M -->|UDP| NTP

    style APPART fill:#0f172a,stroke:#3b82f6,stroke-width:2px,color:#e2e8f0
    style BALCON fill:#0f1f0a,stroke:#22c55e,stroke-width:2px,color:#e2e8f0
    style ENERGIE fill:#1f1505,stroke:#f59e0b,stroke-width:2px,color:#e2e8f0
    style CLOUD2 fill:#1a0f2e,stroke:#a855f7,stroke-width:2px,color:#e2e8f0`
  },
  {
    id: "seq-degrade",
    title: "Séq. Dégradé",
    subtitle: "Mode autonome esclave",
    description: "Séquence du mode dégradé — esclave perd le maître, continue d'arroser seul, puis recovery",
    mermaid: `sequenceDiagram
    participant M as 🏠 Maître
    participant E as ☀️ Esclave
    participant NVS as 💾 NVS Flash
    participant P as 💧 Pompe A

    Note over M,E: ── WiFi routeur coupé ──
    M->>E: CMD_PING (ESP-NOW)
    E->>M: DATA_PONG ✅
    Note over M,E: ESP-NOW fonctionne sans routeur ✅

    Note over M,E: ── Interférence ESP-NOW ──
    M--xE: CMD_PING (ESP-NOW échoue)
    M->>M: Bascule MQTT fallback
    M--xE: MQTT PING (routeur coupé aussi)
    M->>M: ⚠ Double perte comm

    Note over E: ── ENTRÉE MODE DÉGRADÉ ──
    E->>E: 3 PING manqués (180s)
    E->>E: LED jaune clignotant
    E->>NVS: Charger dernier config reçu
    NVS->>E: {moisture_min:30, duration:60, cooldown:7200}

    Note over E: ── ARROSAGE AUTONOME ──
    loop Toutes les 30s
        E->>E: Lire 10 capteurs humidité
        E->>E: Lire US réservoir
        E->>E: Calculer moyenne zone A
        alt Humidité < seuil NVS
            E->>E: Vérifier cooldown 2h
            E->>E: Vérifier max 4 cycles/24h
            E->>E: Vérifier tank > 10%
            E->>P: MOSFET ON (60s)
            P->>P: Arrosage zone A
            E->>P: MOSFET OFF
            E->>E: Log cycle local
        else Humidité OK
            E->>E: Pas d'action
        end
    end

    Note over E: ── FAILSAFES LOCAUX ACTIFS ──
    E->>E: INA219 > 3A → STOP immédiat
    E->>E: Tank < 10% → BLOCK pompe
    E->>E: Runtime > 300s → STOP
    E->>E: Pull-down 10kΩ actif si crash

    Note over M,E: ── RECOVERY ──
    M->>E: CMD_PING (ESP-NOW rétabli)
    E->>M: DATA_PONG {mode: DEGRADED, uptime: 7200s}
    E->>M: DATA_SENSORS (buffer accumulé)
    E->>E: Sortie mode dégradé
    E->>E: LED vert fixe
    M->>M: Alerte Telegram: ✅ Esclave reconnecté
    M->>M: Sync données manquées`
  }
];

// Mermaid renderer component
function MermaidDiagram({ code, id }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        if (!window.mermaid) {
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js";
          script.onload = () => {
            window.mermaid.initialize({
              startOnLoad: false,
              theme: "dark",
              themeVariables: {
                primaryColor: "#1e3a5f",
                primaryTextColor: "#e2e8f0",
                primaryBorderColor: "#3b82f6",
                lineColor: "#64748b",
                secondaryColor: "#1a3320",
                tertiaryColor: "#2d1f33",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "13px",
                noteBkgColor: "#1e293b",
                noteTextColor: "#94a3b8",
                noteBorderColor: "#475569",
                actorBkg: "#1e3a5f",
                actorTextColor: "#e2e8f0",
                actorBorder: "#3b82f6",
                signalColor: "#e2e8f0",
                stateBkg: "#1e293b",
                labelBoxBkgColor: "#1e293b",
              },
              sequence: { mirrorActors: false, messageMargin: 40, width: 180 },
              flowchart: { curve: "basis", padding: 15 },
            });
            if (!cancelled) render();
          };
          document.head.appendChild(script);
          return;
        }
        const { svg: rendered } = await window.mermaid.render(`mermaid-${id}-${Date.now()}`, code);
        if (!cancelled) {
          setSvg(rendered);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || "Erreur de rendu");
          setLoading(false);
        }
      }
    };
    render();
    return () => { cancelled = true; };
  }, [code, id]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Rendu en cours...</div>;
  if (error) return <div style={{ padding: 20, color: "#f87171", fontFamily: "monospace", fontSize: 12 }}>{error}</div>;
  return (
    <div
      style={{ width: "100%", overflow: "auto", padding: "20px 0" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("bdd");
  const active = diagrams.find(d => d.id === activeTab);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0e17",
      color: "#e2e8f0",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
        borderBottom: "1px solid #1e293b",
        padding: "20px 24px",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#3b82f6" }}>BALCONY HYDRA</span>
          <span style={{ fontSize: 14, color: "#64748b", fontWeight: 300 }}>v4 · SysML / UML</span>
        </div>
        <div style={{ fontSize: 11, color: "#475569", letterSpacing: 1 }}>
          SYSTÈME DISTRIBUÉ · MAÎTRE/ESCLAVE · ESP-NOW · 2 ZONES · MOUGINS LE HAUT
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex",
        gap: 2,
        padding: "0 16px",
        background: "#0f172a",
        borderBottom: "1px solid #1e293b",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
      }}>
        {diagrams.map(d => (
          <button
            key={d.id}
            onClick={() => setActiveTab(d.id)}
            style={{
              padding: "12px 14px 10px",
              border: "none",
              borderBottom: activeTab === d.id ? "2px solid #3b82f6" : "2px solid transparent",
              background: activeTab === d.id ? "#1e293b" : "transparent",
              color: activeTab === d.id ? "#3b82f6" : "#64748b",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: activeTab === d.id ? 600 : 400,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.2s",
              letterSpacing: 0.5,
              flexShrink: 0,
            }}
          >
            <div>{d.title}</div>
            <div style={{ fontSize: 9, opacity: 0.6, marginTop: 2 }}>{d.subtitle}</div>
          </button>
        ))}
      </div>

      {/* Content */}
      {active && (
        <div style={{ padding: "20px 24px" }}>
          {/* Description */}
          <div style={{
            padding: "14px 18px",
            background: "#111827",
            border: "1px solid #1e293b",
            borderRadius: 6,
            marginBottom: 20,
            fontSize: 12,
            color: "#94a3b8",
            lineHeight: 1.5,
          }}>
            <span style={{ color: "#3b82f6", fontWeight: 600, marginRight: 8 }}>{active.title}</span>
            {active.description}
          </div>

          {/* Diagram */}
          <div style={{
            background: "#111827",
            border: "1px solid #1e293b",
            borderRadius: 8,
            minHeight: 300,
            overflow: "auto",
          }}>
            <MermaidDiagram code={active.mermaid} id={active.id} />
          </div>

          {/* Legend */}
          <div style={{
            marginTop: 16,
            padding: "10px 16px",
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 6,
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
            fontSize: 10,
            color: "#64748b",
          }}>
            <span>🏠 <span style={{ color: "#3b82f6" }}>Maître</span> (intérieur)</span>
            <span>☀️ <span style={{ color: "#22c55e" }}>Esclave</span> (balcon)</span>
            <span>📡 <span style={{ color: "#a855f7" }}>ESP-NOW</span> (peer-to-peer)</span>
            <span>☁️ <span style={{ color: "#f59e0b" }}>Cloud</span> (MQTT/Telegram)</span>
            <span>🔴 <span style={{ color: "#ef4444" }}>Sécurité</span> (failsafes)</span>
          </div>
        </div>
      )}
    </div>
  );
}
