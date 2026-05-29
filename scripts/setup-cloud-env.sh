#!/usr/bin/env bash
# ============================================================
# setup-cloud-env.sh — Setup script pour Claude Code on the web
# ============================================================
# À COLLER dans le champ "Setup script" des réglages de l'environnement cloud
# (icône ☁️ → éditer l'environnement → Setup script). Ce fichier est la copie
# versionnée de référence ; le runtime utilise le contenu collé dans l'UI.
#
# Pré-requis : network access incluant *.platformio.org (cf. guide réseau).
# Tourne en root, Ubuntu 24.04, AVANT le lancement de Claude. Doit rester < 5 min.
# Le résultat est SNAPSHOTTÉ (cache) → réutilisé instantanément aux sessions
# suivantes ; ne re-tourne que si on change le setup script ou l'allowlist réseau.
#
# Objectif : PlatformIO épinglé (= version CI) + cache plateforme ESP32 /
# toolchain xtensa / libs pré-chauffé → `pio run` et `pio test` prêts d'emblée,
# sans le ping-pong "push → attends CI → colle le log".
# ============================================================
set -uo pipefail

echo "[setup] PlatformIO 6.1.19 (épinglé, = CI)…"
pip install --quiet "platformio==6.1.19" || pip install "platformio==6.1.19" || true

# Localise le repo cloné (chemin connu + fallback robuste).
REPO="/home/user/balcony-hydra"
if [ ! -f "$REPO/firmware/master/platformio.ini" ]; then
  found="$(find /home /root /workspace -maxdepth 6 -path '*firmware/master/platformio.ini' 2>/dev/null | head -1)"
  [ -n "$found" ] && REPO="${found%/firmware/master/platformio.ini}"
fi

if [ -f "$REPO/firmware/master/platformio.ini" ]; then
  # Pré-chauffe les paquets (plateforme + toolchain + libs) des 2 firmwares.
  # `|| true` : ne JAMAIS bloquer le démarrage de la session sur un aléa réseau.
  echo "[setup] pré-chauffe cache PlatformIO master…"
  pio pkg install -d "$REPO/firmware/master" || true
  echo "[setup] pré-chauffe cache PlatformIO slave…"
  pio pkg install -d "$REPO/firmware/slave" || true
else
  echo "[setup] repo introuvable au moment du setup — pio installé ; le cache"
  echo "        plateforme sera tiré au 1er 'pio run' (toujours fonctionnel)."
fi

echo "[setup] terminé — $(pio --version 2>/dev/null || echo 'pio indisponible')"
