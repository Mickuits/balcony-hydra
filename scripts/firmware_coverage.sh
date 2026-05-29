#!/usr/bin/env bash
# ============================================================
# firmware_coverage.sh — Couverture gcov d'un firmware (SIL natif)
#
# Usage : scripts/firmware_coverage.sh <firmware_dir> <min_line_pct>
#   ex.  : scripts/firmware_coverage.sh firmware/master 65
#
# Compile/exécute l'env `native_cov` (instrumenté --coverage), puis
# génère un rapport gcovr filtré sur lib/ et applique un SEUIL BLOCKANT
# sur la couverture lignes (--fail-under-line). Produit coverage.xml +
# coverage.html (uploadés en artefact CI).
#
# Seuils = ESCALIER (staircase) : on démarre sous la baseline mesurée et
# on relève la marche à mesure que des tests SIL sont ajoutés. Voir
# DECISIONS.md (couverture firmware).
# ============================================================
set -euo pipefail

FW_DIR="${1:?usage: firmware_coverage.sh <firmware_dir> <min_line_pct>}"
MIN_LINE="${2:?usage: firmware_coverage.sh <firmware_dir> <min_line_pct>}"

cd "$FW_DIR"

echo "[COV] Build + run tests instrumentés (native_cov) — $FW_DIR"
rm -rf .pio/build/native_cov
pio test -e native_cov

echo "[COV] Rapport gcovr (filtre lib/, seuil lignes >= ${MIN_LINE}%)"
gcovr --root . --filter 'lib/' \
    --print-summary \
    --xml-pretty -o coverage.xml \
    --html-details coverage.html \
    --fail-under-line "$MIN_LINE"

echo "[COV] OK — couverture lignes >= ${MIN_LINE}% pour $FW_DIR"
