# Legacy — Documents archivés v2 / v3

> Ces documents décrivent des **architectures antérieures** du projet Balcony Hydra.
> Ils sont conservés pour traçabilité historique uniquement.
> **Ne pas utiliser pour un nouveau montage.**

## Contenu

| Fichier | Version | Pourquoi obsolète |
|---------|---------|-------------------|
| `architecture_v3.md` | v3 monolithique | 1 seul ESP32, deep sleep, pompe unique — remplacé par `../architecture_v4.md` (distribué 2× ESP32) |
| `wiring_diagram_v2.svg` | v2 | Solaire LiFePO4, LM2596, 1 seul MCU — remplacé par `../wiring_master.svg` + `../wiring_slave.svg` |
| `schema_hydraulique_v2.svg` | v2 | 3 bidons vases communicants + 1 pompe + boîtier énergie solaire — remplacé par architecture dual-zone v4 (2 zones indépendantes) |
| `system_architecture_v3.svg` | v3 | Panneau 20W + MPPT + LiFePO4 + 1 ESP32, aucune mention d'ESP-NOW — à refaire en v4 |

## Pourquoi le pivot v3 → v4

L'architecture v4 a supprimé l'alimentation autonome (panneau solaire 20W + régulateur MPPT + batterie LiFePO4 6Ah) au profit de 2 prises USB secteur (balcon + intérieur). Conséquences :

- **Risque thermique batterie éliminé** (le principal risque du projet v3)
- **Coût réduit** d'environ 104 € (économie nette vs v3 plug-and-play)
- **Architecture distribuée** : 2× ESP32 (maître intérieur + esclave balcon) communiquant par ESP-NOW + MQTT fallback
- **Dashboard tactile** (TFT 2.4" ILI9341 + XPT2046) côté maître
- **Arrosage 2 zones** indépendantes avec 2 pompes péristaltiques 12V
