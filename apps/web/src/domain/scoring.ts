/**
 * 文件说明: 计算按天气找城市的匹配度、单日舒适度和城市排序。
 * 对应文档: docs/product-design.md
 */
import type {
  City,
  WeatherMapCityWeather,
  CityFinderScore,
  DailyForecast,
  RegionKey,
  WeatherFilter
} from 'weather-core/types';
import { cityMatchesRegion } from './regions';

export function dayMatchesFilter(day: DailyForecast, filter: WeatherFilter): boolean {
  const temperatureMatches =
    !filter.useTemperature ||
    (day.temperatureMinC >= filter.temperatureMinC && day.temperatureMaxC <= filter.temperatureMaxC);
  const humidityMatches =
    !filter.useHumidity ||
    (day.humidityMeanPercent >= filter.humidityMinPercent && day.humidityMeanPercent <= filter.humidityMaxPercent);
  const precipitationMatches =
    !filter.usePrecipitation ||
    (day.precipitationSumMm >= filter.precipitationMinMm && day.precipitationSumMm <= filter.precipitationMaxMm);
  const windMatches =
    !filter.useWind ||
    (typeof day.windSpeedMaxKmh === 'number' &&
      day.windSpeedMaxKmh >= filter.windSpeedMinKmh &&
      day.windSpeedMaxKmh <= filter.windSpeedMaxKmh);
  const weatherMatches = !filter.useWeather || filter.weatherTypes.includes(day.weatherType);

  return temperatureMatches && humidityMatches && precipitationMatches && windMatches && weatherMatches;
}

export function calculateBestStreak(matches: boolean[]): number {
  let best = 0;
  let current = 0;

  for (const matchesDay of matches) {
    current = matchesDay ? current + 1 : 0;
    best = Math.max(best, current);
  }

  return best;
}

export function scoreCityFinderMatch(
  city: City,
  forecasts: DailyForecast[],
  filter: WeatherFilter
): CityFinderScore {
  const elevationMatches =
    !filter.useElevation ||
    (city.elevationMeters >= filter.elevationMinMeters && city.elevationMeters <= filter.elevationMaxMeters);
  const scopedForecasts = forecasts.slice(0, filter.dateWindowDays);
  const matches = scopedForecasts.map((day) => elevationMatches && dayMatchesFilter(day, filter));
  const matchDays = matches.filter(Boolean).length;
  const totalDays = scopedForecasts.length;
  const averageTemperatureC =
    scopedForecasts.reduce((sum, day) => sum + day.temperatureMeanC, 0) / Math.max(totalDays, 1);
  const rainDays = scopedForecasts.filter((day) => day.precipitationSumMm >= 1).length;

  return {
    city,
    forecasts: scopedForecasts,
    matchDays,
    totalDays,
    score: totalDays === 0 ? 0 : matchDays / totalDays,
    averageTemperatureC,
    rainDays,
    bestStreakDays: calculateBestStreak(matches)
  };
}

export function calculateComfortScore(day: DailyForecast): number {
  const weatherComfortByType = {
    sunny: 1,
    partly_cloudy: 0.96,
    cloudy: 0.86,
    overcast: 0.74,
    fog: 0.62,
    light_rain: 0.44,
    rain: 0.24,
    thunderstorm: 0.08,
    light_snow: 0.38,
    snow: 0.24
  };
  const temperatureComfort = Math.max(0, 1 - Math.abs(day.temperatureMeanC - 24) / 20);
  const humidityComfort = Math.max(0, 1 - Math.max(0, Math.abs(day.humidityMeanPercent - 55) - 15) / 35);
  const weatherComfort = weatherComfortByType[day.weatherType];
  const rainPenalty = Math.min(0.22, day.precipitationSumMm / 90);
  const windPenalty = Math.min(0.14, (day.windSpeedMaxKmh ?? 0) / 180);
  const score = temperatureComfort * 0.42 + weatherComfort * 0.28 + humidityComfort * 0.2 + 0.1 - rainPenalty - windPenalty;

  return Math.max(0, Math.min(1, score));
}

export function compareCityPopularity(a: City, b: City): number {
  return (b.population ?? 0) - (a.population ?? 0) || a.id.localeCompare(b.id);
}

export function buildWeatherMapCityWeather(
  cities: City[],
  forecasts: DailyForecast[],
  date: string,
  region: RegionKey
): WeatherMapCityWeather[] {
  const forecastsByCity = new Map(forecasts.filter((day) => day.date === date).map((day) => [day.cityId, day]));

  return cities
    .filter((city) => cityMatchesRegion(city, region))
    .flatMap((city) => {
      const forecast = forecastsByCity.get(city.id);
      return forecast ? [{ city, forecast, comfortScore: calculateComfortScore(forecast) }] : [];
    })
    .sort((a, b) => compareCityPopularity(a.city, b.city));
}

export { cityMatchesRegion };
