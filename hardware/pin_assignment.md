# Pin Assignment — ESP32 WROOM-32 DevKit (30 pins)

> Balcony Hydra v3 — Rev 1.1 — Avril 2026

## Rails d'alimentation

| Rail | Source | Consommateurs |
|------|--------|---------------|
| **12V** | Batterie LiFePO4 directe | Pompe (via MOSFET), entrée LM2596 |
| **5V** | Sortie LM2596 | ESP32 VIN, capteurs US JSN-SR04T (×2) |
| **3.3V** | Pin 3V3 ESP32 (AMS1117 onboard) | MUX ×2, BME280, INA219, capteurs humidité |

## Table GPIO

### Entrées analogiques (ADC1 — WiFi safe)

| GPIO | Fonction | Type | Notes |
|------|----------|------|-------|
| 36 (VP) | MUX 1 — SIG out | ADC1_CH0 | Input only |
| 39 (VN) | MUX 2 — SIG out | ADC1_CH3 | Input only |

### Entrées digitales (input only)

| GPIO | Fonction | Type | Notes |
|------|----------|------|-------|
| 34 | US Sensor #1 — ECHO | Input only | Bidon 3 (principal) |
| 35 | US Sensor #2 — ECHO | Input only | Bidon 1 (redondance) |

### Contrôle MUX (S0-S3 partagés entre MUX 1 et MUX 2)

| GPIO | Fonction | Type |
|------|----------|------|
| 32 | MUX S0 (adresse bit 0) | Digital OUT |
| 33 | MUX S1 (adresse bit 1) | Digital OUT |
| 25 | MUX S2 (adresse bit 2) | Digital OUT |
| 26 | MUX S3 (adresse bit 3) | Digital OUT |
| 4 | MUX 1 — EN (active LOW) | Digital OUT |
| 16 | MUX 2 — EN (active LOW) | Digital OUT |

### Actionneurs

| GPIO | Fonction | Type | Notes |
|------|----------|------|-------|
| 27 | POMPE — Gate MOSFET IRLZ44N | Digital OUT | Pull-down 10kΩ obligatoire |
| 14 | US Sensor #1 — TRIGGER | Digital OUT | |
| 12 | US Sensor #2 — TRIGGER | Digital OUT | |

### Bouton physique

| GPIO | Fonction | Type | Notes |
|------|----------|------|-------|
| 5 | Bouton poussoir arrosage | INPUT_PULLUP | ISR FALLING, debounce 300ms |

Comportement :
- **Pompe OFF + appui** → démarre un cycle d'arrosage (durée config, failsafes actifs)
- **Pompe ON + appui** → arrête la pompe immédiatement
- **Failsafe actif + appui** → 3 blinks LED (erreur), pompe reste bloquée
- Fonctionne dans tous les modes (auto/schedulé/manuel), avec ou sans WiFi

### Bus I2C

| GPIO | Fonction | Type | Notes |
|------|----------|------|-------|
| 21 | SDA (BME280 + INA219) | I2C Data | Pull-up 4.7kΩ → 3.3V |
| 22 | SCL (BME280 + INA219) | I2C Clock | Pull-up 4.7kΩ → 3.3V |

### Status

| GPIO | Fonction | Type |
|------|----------|------|
| 2 | LED status (onboard) | Digital OUT |

### Libres (extension future)

`GPIO 15, 17, 18, 19, 23`

## Notes critiques

1. **ADC2 interdit** pour lecture analogique quand WiFi actif (GPIO 0,2,4,12-15,25-27)
2. **GPIO 34,35,36,39** sont input only — pas de pull-up/down interne
3. **Pull-up 4.7kΩ** sur SDA + SCL obligatoire (certains breakouts les incluent)
4. **Pull-down 10kΩ** Gate MOSFET → GND (empêche pompe ON au boot)
5. **Condensateur 100µF** en entrée LM2596 + 10µF en sortie
