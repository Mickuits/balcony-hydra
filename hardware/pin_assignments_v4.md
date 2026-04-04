# Pin Assignments — Balcony Hydra v4

## ESP32 Maître (Intérieur)

| GPIO | Direction | Fonction | Module | Notes |
|------|-----------|----------|--------|-------|
| 36 | IN | MUX SIG analogique | SensorManager | ADC1_CH0, input only |
| 34 | IN | US ECHO réservoir | SensorManager | Input only |
| 35 | — | LIBRE | — | Input only, réservé extension |
| 32 | OUT | MUX S0 | SensorManager | Adresse MUX |
| 33 | OUT | MUX S1 | SensorManager | Adresse MUX |
| 25 | OUT | MUX S2 | SensorManager | Adresse MUX |
| 26 | OUT | MUX S3 | SensorManager | Adresse MUX |
| 27 | OUT | MOSFET Pompe B | PumpController | + pull-down 10kΩ |
| 14 | OUT | US TRIGGER | SensorManager | |
| 13 | OUT | TFT CS | TftDashboard | SPI chip select |
| 12 | OUT | TFT DC | TftDashboard | Data/Command |
| 15 | OUT | TOUCH CS | TftDashboard | XPT2046 chip select |
| 23 | OUT | SPI MOSI | TftDashboard | VSPI default |
| 19 | IN | SPI MISO | TftDashboard | VSPI default |
| 18 | OUT | SPI CLK + Relay | TftDashboard + SafetyManager | ⚠ CONFLIT — voir note |
| 21 | I/O | I2C SDA | TimeManager (DS3231) | Pull-up 4.7kΩ |
| 22 | OUT | I2C SCL | TimeManager (DS3231) | Pull-up 4.7kΩ |
| 16 | OUT | LED Rouge | StatusLED | PWM LEDC ch4 |
| 17 | OUT | LED Verte | StatusLED | PWM LEDC ch5 |
| 2 | OUT | LED Bleue | StatusLED | PWM LEDC ch6, onboard LED |
| 5 | IN | Bouton poussoir | main.cpp | INPUT_PULLUP, ISR FALLING |
| 4 | OUT | MUX EN | SensorManager | Active LOW |

**⚠ CONFLIT GPIO 18:** SPI CLK et relay sécurité partagent le même GPIO dans le design v3. 
**Solution:** Relay sécurité déplacé sur GPIO 0 (safe au boot, pull-up interne) ou utiliser un GPIO libre.
Alternative: utiliser HSPI pour le TFT et garder GPIO 18 pour le relay.

### Libres
- GPIO 0 (pull-up interne, safe au boot — candidat pour relay)
- GPIO 35 (input only — candidat pour ADC batterie backup)

---

## ESP32 Esclave (Balcon)

| GPIO | Direction | Fonction | Module | Notes |
|------|-----------|----------|--------|-------|
| 36 | IN | MUX SIG analogique | SensorManager | ADC1_CH0, input only |
| 34 | IN | US ECHO réservoir | SensorManager | Input only |
| 35 | IN | Batterie ADC | main.cpp | Diviseur 100k/100k, input only |
| 32 | OUT | MUX S0 | SensorManager | |
| 33 | OUT | MUX S1 | SensorManager | |
| 25 | OUT | MUX S2 | SensorManager | |
| 26 | OUT | MUX S3 | SensorManager | |
| 27 | OUT | MOSFET Pompe A | PumpController | + pull-down 10kΩ + fusible 3A |
| 14 | OUT | US TRIGGER | SensorManager | |
| 4 | OUT | MUX EN | SensorManager | Active LOW |
| 21 | I/O | I2C SDA | BME280 + INA219 | Pull-up 4.7kΩ |
| 22 | OUT | I2C SCL | BME280 + INA219 | Pull-up 4.7kΩ |
| 17 | OUT | LED Rouge | StatusLED | PWM |
| 19 | OUT | LED Verte | StatusLED | PWM |
| 23 | OUT | LED Bleue | StatusLED | PWM |
| 2 | OUT | LED onboard | main.cpp | Heartbeat |

### Libres
- GPIO 5, 12, 13, 15, 16, 18 — disponibles pour extension
- Pas de TFT sur l'esclave
- Pas de relay sur l'esclave (sécurité passive uniquement: fusibles + pull-down)
