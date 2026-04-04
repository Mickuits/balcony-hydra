import { useState } from "react";

const diagrams = [
  {
    id: "bdd",
    title: "BDD",
    subtitle: "Block Definition",
    description: "Décomposition structurelle — blocs, sous-systèmes, interfaces, modules hydriques",
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
        +calculerAutonomie()
    }

    class ESP32_Esclave {
        «block» Balcon
        -Solaire_LiFePO4 : Alimentation
        -ESP_NOW : Peer-to-peer
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
        +écranCapteurs()
        +écranProfils()
        +écranAutonomie()
    }

    class SafetyManager {
        «block» 5 couches
        +armPump() bool
        +remoteUnlock()
        +autoRecovery()
    }

    class TimeManager {
        «block» RTC + Solaire
        +getTime() tm
        +sunrise() SolarTimes
        +sunset() SolarTimes
    }

    class PlantProfile {
        «block» Profil hydrique
        -profiles[20] : PlantProfileData
        -dryingHistory[20] : 24 samples
        +seasonalCoeff(pot month) float
        +computeWaterVolumeML() uint16
        +computeCycleDurationS() uint16
        +computeZoneCycleDurationS() uint16
        +updateDryingRate()
        +effectiveMinThreshold() uint8
    }

    class AutonomyCalculator {
        «block» Prédiction
        +compute(jours mois) Report
        +dailyConsumptionML() float
        +maxAutonomyDays() uint16
    }

    class PumpController_Zone {
        «block» Par zone
        +start(zone duration)
        +stop(zone reason)
        +shouldAutoWater(zone) bool
        +adaptiveDuration() uint16
    }

    class Communication {
        «interface»
        +ESP_NOW_primaire()
        +MQTT_fallback()
        +heartbeat_60s()
    }

    BalconyHydra_v4 *-- ESP32_Maitre
    BalconyHydra_v4 *-- ESP32_Esclave
    BalconyHydra_v4 *-- Communication
    ESP32_Maitre *-- TFT_Dashboard
    ESP32_Maitre *-- SafetyManager
    ESP32_Maitre *-- TimeManager
    ESP32_Maitre *-- PlantProfile
    ESP32_Maitre *-- AutonomyCalculator
    ESP32_Maitre *-- PumpController_Zone
    AutonomyCalculator --> PlantProfile : utilise profils
    PumpController_Zone --> PlantProfile : durée cycle
    PumpController_Zone --> TimeManager : mois courant
    ESP32_Maitre ..> Communication : utilise
    ESP32_Esclave ..> Communication : utilise`
  },
  {
    id: "ibd",
    title: "IBD",
    subtitle: "Internal Block",
    description: "Flux de données entre modules — incluant PlantProfile et AutonomyCalculator",
    mermaid: `flowchart TB
    subgraph MAITRE["🏠 ESP32 MAÎTRE — Intérieur"]
        direction TB
        CM[ConfigManager<br/>NVS + JSON]
        SM_M[SensorManager<br/>10 capteurs MUX<br/>US réservoir int]
        PC_B[PumpController<br/>Zone B · GPIO 27]
        SAF[SafetyManager<br/>Relay GPIO 18]
        TM[TimeManager<br/>DS3231 + NTP<br/>Solaire NOAA]
        PP[PlantProfile<br/>20 profils NVS<br/>7 catégories<br/>Coeff saisonniers]
        AC[AutonomyCalc<br/>Prédiction conso<br/>Déficit stockage]
        TFT[TftDashboard<br/>ILI9341 tactile<br/>7 écrans]
        WEB[WebPortal<br/>REST API]
        TG[TelegramBot<br/>/profiles /autonomy<br/>/unlock /safety]
        MQ[MqttClient<br/>Cloud broker]
        ENM[EspNowMaster<br/>CMD ↔ DATA]
        LED_M[StatusLED<br/>RGB 10 états]

        CM -->|config| PC_B
        SM_M -->|humidité zone B| PC_B
        SM_M -->|humidité par pot| PP
        PP -->|coeff saisonnier| PC_B
        PP -->|durée cycle| PC_B
        PP -->|profils| AC
        TM -->|mois courant| PP
        TM -->|mois courant| PC_B
        AC -->|rapport| TFT
        AC -->|rapport| TG
        SAF -->|arm/disarm| PC_B
        ENM -->|données esclave| TFT
        ENM -->|données esclave| PP
        PP -->|seuils override| SM_M
    end

    subgraph ESCLAVE["☀️ ESP32 ESCLAVE — Balcon"]
        direction TB
        SM_S[SensorManager<br/>10 capteurs MUX<br/>US · BME280 · INA219]
        PC_A[PumpController<br/>Zone A · GPIO 27]
        ENS[EspNowSlave<br/>CMD ← Maître<br/>DATA → Maître]
        DM[DegradedMode<br/>NVS schedule local]

        SM_S -->|données| ENS
        ENS -->|commandes| PC_A
        DM -->|si maître perdu| PC_A
    end

    ENM <-->|ESP-NOW| ENS

    style MAITRE fill:#1a2332,stroke:#3b82f6,stroke-width:2px,color:#e2e8f0
    style ESCLAVE fill:#1a2820,stroke:#22c55e,stroke-width:2px,color:#e2e8f0`
  },
  {
    id: "seq",
    title: "Séquence",
    subtitle: "Comm M↔S + Hydrique",
    description: "Cycle normal avec durée adaptative, calcul autonomie, et apprentissage taux assèchement",
    mermaid: `sequenceDiagram
    participant U as 👤 Utilisateur
    participant M as 🏠 Maître
    participant PP as 🌱 PlantProfile
    participant AC as 📊 AutonomyCalc
    participant E as ☀️ Esclave
    participant T as 📱 Telegram

    Note over M,E: ── CYCLE CAPTEURS (30s) ──
    M->>E: CMD_READ_SENSORS
    E->>M: DATA_SENSORS {moisture[10], tank, temp}
    M->>M: updateZoneMoisture()
    M->>PP: recordHumidity(zone, pot, hum, time)
    PP->>PP: Buffer 24 échantillons

    Note over M,PP: ── APPRENTISSAGE (toutes les 6h) ──
    M->>PP: updateDryingRate(zone, pot)
    PP->>PP: Régression linéaire sur historique
    PP-->>M: dryingRate = 3.2 %/h (citronnier été)

    Note over M,E: ── ARROSAGE AUTO ADAPTATIF ──
    M->>M: Zone A hum 22% < seuil
    M->>PP: computeZoneCycleDurationS(0, août)
    PP-->>M: 225s (citronnier domine)
    M->>M: SafetyManager.armPump()
    M->>E: CMD_PUMP_START {duration: 225}
    E->>E: Pompe A ON pendant 225s
    E->>M: DATA_PUMP_STATUS {done, 225s}
    M->>T: 🌱 Balcon: 225s (adaptatif août)

    Note over U,AC: ── CALCUL AUTONOMIE ──
    U->>T: /autonomy 21
    T->>M: Parse: 21 jours, mois courant
    M->>AC: compute(21, août, 50000, 25000)
    AC->>PP: dailyConsumptionML(zone A, août)
    PP-->>AC: 2400 mL/jour (10 pots × profils)
    AC->>PP: dailyConsumptionML(zone B, août)
    PP-->>AC: 1200 mL/jour
    AC-->>M: Report {A: 50.4L/50L ⚠, B: 25.2L/25L ❌}
    M->>T: 📊 Balcon: 50.4L sur 50L (marge 0%)<br/>Intérieur: 25.2L sur 25L ❌ déficit 0.2L`
  },
  {
    id: "stm-safety",
    title: "STM Safety",
    subtitle: "Machine à états",
    description: "SafetyManager — auto-recovery vs hard lockout, transitions complètes",
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

    LOCKOUT_AUTO --> NOMINAL : auto-recovery

    NOMINAL --> LOCKOUT_HARD : overcurrent > 3A\\ndry-run < 50mA

    state LOCKOUT_HARD {
        [*] --> WaitUnlock
        WaitUnlock --> WaitUnlock : WiFi + TG actifs
    }

    LOCKOUT_HARD --> NOMINAL : /unlock Telegram\\nou bouton physique

    state SAFE_MODE {
        [*] --> MinimalBoot
        MinimalBoot --> MinimalBoot : pompe OFF\\nWiFi + TG actifs
    }

    SAFE_MODE --> NOMINAL : /unlock Telegram\\nou bouton 10s

    note right of LOCKOUT_AUTO
        AUTO-RECOVERY
        Se réarme seul
    end note

    note right of LOCKOUT_HARD
        HARD LOCKOUT
        /unlock requis
    end note`
  },
  {
    id: "stm-pump",
    title: "STM Pompe",
    subtitle: "Machine à états",
    description: "PumpController par zone — durée adaptative via PlantProfile, failsafes",
    mermaid: `stateDiagram-v2
    direction TB

    [*] --> IDLE : Boot

    state IDLE {
        [*] --> Prêt
        Prêt --> Prêt : attente trigger
    }

    IDLE --> QUERY_PROFILE : shouldAutoWater()\\n= true

    state QUERY_PROFILE {
        [*] --> CalcDuration
        CalcDuration : PlantProfile.computeZoneCycleDurationS\\n(zone, mois_courant)
        CalcDuration : Été citronnier = 225s\\nHiver citronnier = 22s\\nSucculente = 45s
    }

    QUERY_PROFILE --> RUNNING : start(zone, adaptiveDuration)\\n+ SafetyManager.armPump()

    state RUNNING {
        [*] --> Pompage
        Pompage --> CheckFS : chaque seconde
        CheckFS --> Pompage : OK
        CheckFS --> FS_Tank : tank < 10%
        CheckFS --> FS_Current : courant anormal
    }

    RUNNING --> IDLE : durée adaptative terminée
    RUNNING --> IDLE : stop manuel
    RUNNING --> BLOCKED : failsafe déclenché

    state BLOCKED {
        [*] --> FailsafeActif
    }

    BLOCKED --> IDLE : resetFailsafe\\n(auto-recovery tank\\nou /unlock)

    note left of QUERY_PROFILE
        DURÉE ADAPTATIVE
        Volume = base × √(pot/10L) × coeff_saison
        Durée = volume / débit_goutteur
        [5s plancher, 300s plafond]
    end note`
  },
  {
    id: "act",
    title: "Activité",
    subtitle: "Cycle AUTO adaptatif",
    description: "Flux arrosage AUTO avec profil hydrique, durée adaptative, et apprentissage",
    mermaid: `flowchart TD
    START((Cycle capteurs<br/>30s)) --> READ[Lecture 20 capteurs<br/>MUX1 + MUX2]
    READ --> RECORD[PlantProfile.recordHumidity<br/>par pot avec timestamp]
    RECORD --> LEARN{Toutes les 6h ?}
    LEARN -->|Oui| UPDATE_DR[updateDryingRate<br/>Régression linéaire<br/>sur 24 échantillons]
    LEARN -->|Non| CALC
    UPDATE_DR --> CALC[Calcul moyenne<br/>humidité par zone]

    CALC --> CHECK_MODE{Mode ?}
    CHECK_MODE -->|SCHEDULED| IS_TIME{Heure schedule ?}
    CHECK_MODE -->|SOLAR| IS_SOLAR{Lever/coucher ?}
    CHECK_MODE -->|MANUAL| DONE((Fin))
    CHECK_MODE -->|AUTO| ZONE_LOOP

    IS_TIME -->|Non| DONE
    IS_SOLAR -->|Non| DONE
    IS_TIME -->|Oui| GET_DUR
    IS_SOLAR -->|Oui| GET_DUR

    ZONE_LOOP[Pour chaque zone] --> CHECK_HUM{Humidité zone<br/>< seuil effectif ?}
    CHECK_HUM -->|Non| NEXT_Z{Autre zone ?}
    CHECK_HUM -->|Oui| CHECK_SPAM{Cooldown 2h OK ?<br/>Max 4/24h OK ?}
    CHECK_SPAM -->|Non| NEXT_Z
    CHECK_SPAM -->|Oui| CHECK_LOCK{Lockout ?}
    CHECK_LOCK -->|Oui| NEXT_Z
    CHECK_LOCK -->|Non| GET_DUR

    GET_DUR[PlantProfile<br/>computeZoneCycleDurationS<br/>zone + mois courant] --> ARM[SafetyManager<br/>armPump]
    ARM --> ARM_OK{Armé ?}
    ARM_OK -->|Non| NEXT_Z
    ARM_OK -->|Oui| PUMP[Pompe zone ON<br/>durée ADAPTATIVE]
    PUMP --> CHECK_FS{Failsafes ?}
    CHECK_FS -->|Erreur| FS_STOP[STOP + BLOCK<br/>alerte Telegram]
    CHECK_FS -->|OK| TIME_UP{Durée atteinte ?}
    TIME_UP -->|Non| PUMP
    TIME_UP -->|Oui| STOP[Pompe OFF<br/>disarmPump]
    STOP --> NOTIFY[Telegram<br/>zone + durée + volume]
    NOTIFY --> NEXT_Z
    FS_STOP --> NEXT_Z

    NEXT_Z -->|Oui| ZONE_LOOP
    NEXT_Z -->|Non| ALERTS[Alertes pots<br/>chroniquement secs]
    ALERTS --> DONE

    style START fill:#3b82f6,color:white
    style DONE fill:#6b7280,color:white
    style GET_DUR fill:#8b5cf6,color:white
    style RECORD fill:#8b5cf6,color:white
    style PUMP fill:#22c55e,color:white
    style FS_STOP fill:#ef4444,color:white`
  },
  {
    id: "uc",
    title: "Use Cases",
    subtitle: "Cas d'utilisation",
    description: "Fonctionnalités utilisateur — config, arrosage, monitoring, sécurité, prédiction",
    mermaid: `flowchart TB
    subgraph ACTEURS["Acteurs"]
        USER["👤 Utilisateur"]
        SOLEIL["☀️ Soleil"]
        HORLOGE["⏰ Horloge"]
        PLANTE["🌱 Plantes"]
    end

    subgraph SYS["«system» Balcony Hydra v4"]
        subgraph CONFIG["Configuration"]
            UC1["Configurer WiFi<br/>écran tactile"]
            UC2["Paramétrer seuils<br/>humidité par zone"]
            UC3["Choisir mode<br/>AUTO/SCHED/SOLAR"]
            UC20["Créer profil<br/>hydrique par pot"]
            UC21["Configurer goutteur<br/>débit par pot"]
        end

        subgraph ARROSAGE["Arrosage"]
            UC6["Arrosage AUTO<br/>durée adaptative"]
            UC7["Arrosage programmé"]
            UC8["Arrosage solaire"]
            UC9["Arrosage manuel"]
        end

        subgraph PREDICTION["Prédiction Hydrique"]
            UC22["Calculer autonomie<br/>N jours absence"]
            UC23["Estimer consommation<br/>par zone et mois"]
            UC24["Détecter déficit<br/>stockage"]
            UC25["Apprendre taux<br/>assèchement par pot"]
        end

        subgraph MONITORING["Monitoring"]
            UC10["Dashboard TFT<br/>7 écrans"]
            UC11["Alertes Telegram"]
            UC12["MQTT cloud"]
            UC13["Humidité par pot<br/>+ profil"]
        end

        subgraph SECURITE["Sécurité"]
            UC14["Unlock distant"]
            UC15["État sécurité"]
            UC16["Reset failsafe"]
        end
    end

    USER --> UC1
    USER --> UC20
    USER --> UC22
    USER --> UC9
    USER --> UC10
    USER --> UC14

    PLANTE --> UC6
    PLANTE --> UC25
    HORLOGE --> UC7
    SOLEIL --> UC8

    UC6 -.->|include| UC20
    UC6 -.->|include| UC25
    UC22 -.->|include| UC20
    UC24 -.->|extend| UC22

    style CONFIG fill:#1e3a5f,stroke:#3b82f6,color:#e2e8f0
    style ARROSAGE fill:#1a3320,stroke:#22c55e,color:#e2e8f0
    style PREDICTION fill:#2d1f33,stroke:#a855f7,color:#e2e8f0
    style MONITORING fill:#3d2f0a,stroke:#f59e0b,color:#e2e8f0
    style SECURITE fill:#3d0a0a,stroke:#ef4444,color:#e2e8f0`
  },
  {
    id: "deploy",
    title: "Déploiement",
    subtitle: "Hardware physique",
    description: "Nœuds physiques, protocoles, composants — architecture distribuée complète",
    mermaid: `flowchart TB
    subgraph APPART["🏠 Appartement"]
        subgraph BOITIER_M["📦 Maître Intérieur"]
            ESP_M["ESP32 WROOM-32"]
            TFT["LCD TFT 2.4<br/>7 écrans dont<br/>Profils + Autonomie"]
            RTC["DS3231 RTC"]
            RELAY["Relais sécurité"]
        end

        subgraph ZONE_B_HW["💧 Zone B"]
            POMPEB["Pompe B<br/>péristaltique"]
            MUXB["MUX 10 capteurs"]
            RESB["Réservoir 25L"]
            POTSB["10 Pots intérieur<br/>Goutteurs 2-4 L/h"]
        end

        USB_PSU["🔌 USB 5V"]

        subgraph FIRMWARE_M["💾 Firmware Maître"]
            FW1["PlantProfile<br/>20 profils NVS<br/>Coeff saisonniers"]
            FW2["AutonomyCalc<br/>Prédiction conso"]
            FW3["PumpController<br/>Durée adaptative"]
            FW4["SafetyManager"]
            FW5["TimeManager<br/>Solaire NOAA"]
        end

        USB_PSU --> ESP_M
        ESP_M --> TFT
        ESP_M --> POMPEB
        ESP_M --> MUXB
    end

    subgraph BALCON["☀️ Balcon"]
        subgraph BOITIER_S["📦 Esclave IP65"]
            ESP_S["ESP32 WROOM-32"]
            BME["BME280"]
            INA["INA219"]
        end

        subgraph ZONE_A_HW["💧 Zone A"]
            POMPEA["Pompe A<br/>péristaltique"]
            MUXA["MUX 10 capteurs"]
            RESA["2× 25L = 50L"]
            POTSA["10 Pots balcon<br/>Goutteurs 4-8 L/h"]
        end

        subgraph ENERGIE["⚡ Énergie"]
            SOLAR["Panneau 20W"]
            BATT["LiFePO4 12V"]
            FUSE_T["Fusible 72°C"]
        end

        SOLAR --> BATT
        BATT --> ESP_S
        ESP_S --> POMPEA
        ESP_S --> MUXA
    end

    ESP_M <-->|"ESP-NOW<br/>peer-to-peer<br/>chiffré"| ESP_S
    ESP_M <-.->|"MQTT fallback<br/>via routeur"| ESP_S

    style APPART fill:#0f172a,stroke:#3b82f6,stroke-width:2px,color:#e2e8f0
    style BALCON fill:#0f1f0a,stroke:#22c55e,stroke-width:2px,color:#e2e8f0
    style FIRMWARE_M fill:#1e1b4b,stroke:#8b5cf6,stroke-width:1px,color:#e2e8f0
    style ENERGIE fill:#1f1505,stroke:#f59e0b,stroke-width:1px,color:#e2e8f0`
  },
  {
    id: "seq-degrade",
    title: "Séq. Dégradé",
    subtitle: "Esclave autonome",
    description: "Mode dégradé — esclave perd le maître, arrose seul avec config NVS, recovery",
    mermaid: `sequenceDiagram
    participant M as 🏠 Maître
    participant E as ☀️ Esclave
    participant NVS as 💾 NVS Flash
    participant P as 💧 Pompe A

    Note over M,E: ── PERTE COMMUNICATION ──
    M--xE: CMD_PING (ESP-NOW fail)
    M--xE: MQTT PING (routeur coupé)

    Note over E: ── MODE DÉGRADÉ ──
    E->>E: 3 PING manqués (180s)
    E->>E: LED jaune clignotant
    E->>NVS: Charger config + profils
    NVS->>E: {min:30, duration:auto, profiles}

    loop Toutes les 30s
        E->>E: Lire 10 capteurs
        E->>E: Calculer moyenne zone A
        alt Humidité < seuil
            E->>E: Cooldown 2h OK ?
            E->>E: Max 4 cycles OK ?
            E->>E: Tank > 10% ?
            E->>P: MOSFET ON (durée NVS)
            P->>P: Arrosage
            E->>P: MOSFET OFF
        end
    end

    Note over E: Failsafes locaux actifs
    Note over E: INA219 overcurrent → STOP
    Note over E: Tank < 10% → BLOCK

    Note over M,E: ── RECOVERY ──
    M->>E: CMD_PING ✅
    E->>M: DATA_PONG {mode: DEGRADED}
    E->>M: DATA_SENSORS (accumulé)
    M->>M: Alerte TG: ✅ Reconnecté`
  },
  {
    id: "act-autonomy",
    title: "Autonomie",
    subtitle: "Calcul prédictif",
    description: "Flux de calcul d'autonomie — de la commande /autonomy au rapport détaillé",
    mermaid: `flowchart TD
    START((Utilisateur<br/>/autonomy 21)) --> PARSE[Parser: 21 jours<br/>Mois courant = août]
    PARSE --> INIT[Stockage zones<br/>A=50L B=25L]

    INIT --> LOOP_Z[Pour chaque zone]

    LOOP_Z --> LOOP_D[Pour chaque jour<br/>de l'absence]

    LOOP_D --> GET_MONTH[Déterminer mois<br/>du jour courant]
    GET_MONTH --> LOOP_P[Pour chaque pot<br/>de la zone]

    LOOP_P --> HAS_RATE{Taux assèchement<br/>appris ?}
    HAS_RATE -->|Oui| USE_RATE[Cycles/jour =<br/>24h ÷ heures_avant_seuil<br/>Basé terrain réel]
    HAS_RATE -->|Non| USE_COEFF[Cycles/jour =<br/>2 × coeff_saisonnier<br/>Estimation théorique]

    USE_RATE --> CALC_VOL[Volume pot =<br/>base × √pot_ratio<br/>× coeff_saisonnier]
    USE_COEFF --> CALC_VOL

    CALC_VOL --> DAILY_ADD[conso_jour +=<br/>volume × cycles]
    DAILY_ADD --> NEXT_P{Autre pot ?}
    NEXT_P -->|Oui| LOOP_P
    NEXT_P -->|Non| NEXT_D{Autre jour ?}

    NEXT_D -->|Oui| LOOP_D
    NEXT_D -->|Non| ZONE_REPORT[Rapport zone:<br/>conso totale<br/>marge vs stockage<br/>max autonomie jours]

    ZONE_REPORT --> NEXT_Z{Autre zone ?}
    NEXT_Z -->|Oui| LOOP_Z
    NEXT_Z -->|Non| FINAL

    FINAL[Rapport final] --> CHECK_OK{Toutes zones<br/>suffisantes ?}
    CHECK_OK -->|Oui| MSG_OK["✅ Autonomie OK<br/>Balcon: marge X%<br/>Intérieur: marge Y%"]
    CHECK_OK -->|Non| MSG_KO["❌ DÉFICIT<br/>Manque X.XL<br/>→ ajouter réservoir<br/>ou réduire absence"]

    MSG_OK --> SEND[Envoyer via<br/>Telegram + TFT]
    MSG_KO --> SEND

    style START fill:#3b82f6,color:white
    style USE_RATE fill:#22c55e,color:white
    style USE_COEFF fill:#f59e0b,color:white
    style MSG_OK fill:#22c55e,color:white
    style MSG_KO fill:#ef4444,color:white
    style CALC_VOL fill:#8b5cf6,color:white`
  }
];

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
              },
              sequence: { mirrorActors: false, messageMargin: 40, width: 180 },
              flowchart: { curve: "basis", padding: 15 },
            });
            if (!cancelled) render();
          };
          document.head.appendChild(script);
          return;
        }
        const { svg: rendered } = await window.mermaid.render(`m-${id}-${Date.now()}`, code);
        if (!cancelled) { setSvg(rendered); setLoading(false); }
      } catch (e) {
        if (!cancelled) { setError(e.message || "Erreur"); setLoading(false); }
      }
    };
    render();
    return () => { cancelled = true; };
  }, [code, id]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Rendu...</div>;
  if (error) return <div style={{ padding: 20, color: "#f87171", fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>{error}</div>;
  return <div style={{ width: "100%", overflow: "auto", padding: "20px 0" }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export default function App() {
  const [tab, setTab] = useState("bdd");
  const active = diagrams.find(d => d.id === tab);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)", borderBottom: "1px solid #1e293b", padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#3b82f6" }}>BALCONY HYDRA</span>
          <span style={{ fontSize: 14, color: "#64748b", fontWeight: 300 }}>v4 · SysML / UML</span>
        </div>
        <div style={{ fontSize: 11, color: "#475569", letterSpacing: 1 }}>
          DISTRIBUÉ · MAÎTRE/ESCLAVE · PROFILS HYDRIQUES · PRÉDICTION AUTONOMIE · 119 TESTS
        </div>
      </div>

      <div style={{ display: "flex", gap: 2, padding: "0 16px", background: "#0f172a", borderBottom: "1px solid #1e293b", overflowX: "auto" }}>
        {diagrams.map(d => (
          <button key={d.id} onClick={() => setTab(d.id)} style={{
            padding: "12px 14px 10px", border: "none",
            borderBottom: tab === d.id ? "2px solid #3b82f6" : "2px solid transparent",
            background: tab === d.id ? "#1e293b" : "transparent",
            color: tab === d.id ? "#3b82f6" : "#64748b",
            fontFamily: "inherit", fontSize: 11, fontWeight: tab === d.id ? 600 : 400,
            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
          }}>
            <div>{d.title}</div>
            <div style={{ fontSize: 9, opacity: 0.6, marginTop: 2 }}>{d.subtitle}</div>
          </button>
        ))}
      </div>

      {active && (
        <div style={{ padding: "20px 24px" }}>
          <div style={{ padding: "14px 18px", background: "#111827", border: "1px solid #1e293b", borderRadius: 6, marginBottom: 20, fontSize: 12, color: "#94a3b8" }}>
            <span style={{ color: "#3b82f6", fontWeight: 600, marginRight: 8 }}>{active.title}</span>
            {active.description}
          </div>
          <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 8, minHeight: 300, overflow: "auto" }}>
            <MermaidDiagram code={active.mermaid} id={active.id} />
          </div>
          <div style={{ marginTop: 16, padding: "10px 16px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, display: "flex", gap: 20, flexWrap: "wrap", fontSize: 10, color: "#64748b" }}>
            <span>🏠 <span style={{ color: "#3b82f6" }}>Maître</span></span>
            <span>☀️ <span style={{ color: "#22c55e" }}>Esclave</span></span>
            <span>🌱 <span style={{ color: "#8b5cf6" }}>PlantProfile</span></span>
            <span>📊 <span style={{ color: "#f59e0b" }}>Autonomie</span></span>
            <span>🔴 <span style={{ color: "#ef4444" }}>Sécurité</span></span>
          </div>
        </div>
      )}
    </div>
  );
}
