/**
 * Seed initial WEATHER_FORECAST — 14 jours météo Mougins.
 * À terme, remplacé par API Météo France.
 */
import type { WeatherForecast } from '@/types';

export const INITIAL_WEATHER: WeatherForecast = [
  { tmax: 24, tmin: 14, precip: 0, et0: 4.2 },
  { tmax: 25, tmin: 15, precip: 0, et0: 4.4 },
  { tmax: 27, tmin: 16, precip: 0, et0: 4.8 },
  { tmax: 28, tmin: 17, precip: 0, et0: 5.1 },
  { tmax: 29, tmin: 18, precip: 0, et0: 5.4 },
  { tmax: 30, tmin: 19, precip: 5.2, et0: 4.2 },
  { tmax: 31, tmin: 20, precip: 0, et0: 6.2 },
  { tmax: 31, tmin: 20, precip: 0, et0: 6.4 },
  { tmax: 29, tmin: 19, precip: 0, et0: 5.6 },
  { tmax: 27, tmin: 18, precip: 0, et0: 5.2 },
  { tmax: 26, tmin: 17, precip: 3.2, et0: 4.6 },
  { tmax: 25, tmin: 17, precip: 0, et0: 4.8 },
  { tmax: 24, tmin: 16, precip: 0, et0: 4.5 },
  { tmax: 24, tmin: 16, precip: 0, et0: 4.3 },
];
