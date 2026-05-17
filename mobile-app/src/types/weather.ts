/**
 * Types météo — forecast 14 jours pour planificateur vacances.
 */

export interface WeatherDayForecast {
  tmax: number; // °C
  tmin: number; // °C
  precip: number; // mm
  /** Évapotranspiration référence (Penman-Monteith) en mm/jour */
  et0: number;
}

export type WeatherForecast = WeatherDayForecast[];
