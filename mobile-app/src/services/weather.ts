/**
 * Weather coefficient — calcul de la consommation d'eau prévisionnelle
 * basé sur les principes FAO Penman-Monteith :
 *
 *   irrigation_journalière ≈ ET₀ × Kc × surface
 *
 * On exprime un **coefficient météo** sans dimension (≈ 1.00 = saison
 * normale, > 1 = canicule, < 1 = frais/pluvieux) qui multiplie la
 * consommation de base d'une plante.
 *
 * Le coefficient combine 4 contributions :
 *   1. Base saisonnière (1.00 par défaut — peut varier si la prévision
 *      chevauche plusieurs mois).
 *   2. Adjustment température (Tmean vs référence) : +3% par °C écart.
 *   3. Adjustment ET₀ (ratio vs référence) pondéré 40%.
 *   4. Compensation pluie : -0.007 par mm cumulé sur la période.
 *
 * Plancher : 0.5 (jamais en dessous, même par temps très frais/pluvieux —
 * les plantes ont toujours un besoin minimum).
 */
import type { WeatherForecast, WeatherDayForecast } from '@/types';

export interface WeatherCoefficient {
  /** Coefficient sans dimension, clamp >= 0.5 */
  coef: number;
  /** Décomposition pédagogique (affichée dans l'UI vacances). */
  breakdown: {
    base: number;
    tempAdj: number;
    et0Adj: number;
    rainComp: number;
  };
  /** Stats moyennes de la période (utiles pour debug + UI). */
  summary: {
    avgTmax: number;
    avgTmin: number;
    avgTmean: number;
    totalPrecip: number;
    avgEt0: number;
    heatDays: number; // nombre de jours avec Tmax >= 30°C
  };
  /** Tag textuel court (UI badge). */
  periodTag: 'HIVER' | 'FRAIS' | 'DOUX' | 'CHAUD MODÉRÉ' | 'CHAUD' | 'CANICULAIRE';
}

export interface WeatherReferences {
  baseTempReference: number; // °C
  baseEt0Reference: number; // mm/jour
}

/** Constantes calibrées (source de vérité : prototype legacy). */
const TEMP_ADJ_PER_DEGREE = 0.03; // +3% conso par °C au-dessus de la ref
const ET0_ADJ_WEIGHT = 0.4; // pondération du ratio ET₀
const RAIN_COMP_PER_MM = -0.007; // compensation pluie par mm cumulé
const COEF_FLOOR = 0.5; // plancher du coefficient
const HEAT_DAY_THRESHOLD_C = 30; // seuil "jour de chaleur"
const BASE_COEF = 1.0; // valeur de référence (saison "normale")

/**
 * Calcule le coefficient météo pour une fenêtre de prévision.
 *
 * @param forecast tableau de prévisions journalières (≥ 1 jour).
 * @param references seuils de référence (depuis StatsStore).
 * @returns coefficient + décomposition + résumé statistique.
 * @throws si `forecast` est vide (caller doit fournir au moins 1 jour).
 */
export function computeWeatherCoefficient(
  forecast: WeatherForecast,
  references: WeatherReferences
): WeatherCoefficient {
  if (forecast.length === 0) {
    throw new Error('computeWeatherCoefficient: forecast vide');
  }

  let sumTmax = 0;
  let sumTmin = 0;
  let totalPrecip = 0;
  let sumEt0 = 0;
  let heatDays = 0;

  for (const d of forecast) {
    sumTmax += d.tmax;
    sumTmin += d.tmin;
    totalPrecip += d.precip;
    sumEt0 += d.et0;
    if (d.tmax >= HEAT_DAY_THRESHOLD_C) heatDays += 1;
  }

  const n = forecast.length;
  const avgTmax = sumTmax / n;
  const avgTmin = sumTmin / n;
  const avgEt0 = sumEt0 / n;
  const avgTmean = (avgTmax + avgTmin) / 2;

  const tempAdj = (avgTmean - references.baseTempReference) * TEMP_ADJ_PER_DEGREE;
  const et0Adj = (avgEt0 / references.baseEt0Reference - 1) * ET0_ADJ_WEIGHT;
  const rainComp = totalPrecip * RAIN_COMP_PER_MM;

  const rawCoef = BASE_COEF + tempAdj + et0Adj + rainComp;
  const coef = Math.max(COEF_FLOOR, rawCoef);

  return {
    coef,
    breakdown: { base: BASE_COEF, tempAdj, et0Adj, rainComp },
    summary: { avgTmax, avgTmin, avgTmean, totalPrecip, avgEt0, heatDays },
    periodTag: classifyPeriod(avgTmean),
  };
}

/**
 * Étend une prévision sur N jours en répétant la moyenne quand la
 * fenêtre est plus longue que la prévision disponible.
 *
 * Cas typique : on demande 21 jours mais on n'a que 14 jours de prévision
 * → on calcule la moyenne des 14 et on l'extrapole sur les 7 restants.
 *
 * @returns un nouveau tableau (le `forecast` source n'est pas muté).
 */
export function extendForecastToDays(forecast: WeatherForecast, days: number): WeatherForecast {
  if (days <= 0) return [];
  if (forecast.length === 0) return [];
  if (forecast.length >= days) return forecast.slice(0, days);

  const extended: WeatherDayForecast[] = [...forecast];
  // Moyenne des jours disponibles → template extrapolation.
  const n = forecast.length;
  const avg: WeatherDayForecast = {
    tmax: forecast.reduce((s, d) => s + d.tmax, 0) / n,
    tmin: forecast.reduce((s, d) => s + d.tmin, 0) / n,
    precip: forecast.reduce((s, d) => s + d.precip, 0) / n,
    et0: forecast.reduce((s, d) => s + d.et0, 0) / n,
  };
  while (extended.length < days) {
    extended.push({ ...avg });
  }
  return extended;
}

function classifyPeriod(avgTmean: number): WeatherCoefficient['periodTag'] {
  if (avgTmean < 12) return 'HIVER';
  if (avgTmean < 18) return 'FRAIS';
  if (avgTmean < 23) return 'DOUX';
  if (avgTmean < 27) return 'CHAUD MODÉRÉ';
  if (avgTmean < 30) return 'CHAUD';
  return 'CANICULAIRE';
}
