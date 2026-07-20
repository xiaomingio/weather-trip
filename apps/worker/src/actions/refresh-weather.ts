/**
 * 文件说明: 增量刷新缺失的未来天气预报，避免重复调用 Open-Meteo 已缓存的城市日期。
 * 对应文档: docs/data-flow.md
 */
import type { City, DailyForecast } from 'weather-core/types';
import {
  readCities,
  readForecasts,
  setupWeatherDatabase,
  type WeatherDatabase,
  updateRefreshFailure,
  updateRefreshSuccess,
  upsertForecasts
} from 'weather-db';
import { fetchForecastBatch } from '../open-meteo.js';

const actionKey = 'weather:refresh-daily';
const batchSize = 40;
const forecastDays = 14;

export type RefreshWeatherResult = {
  cities: number;
  citiesFetched: number;
  forecastsUpserted: number;
};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function forecastCacheKey(cityId: string, date: string): string {
  return `${cityId}:${date}`;
}

function formatDateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function buildForecastDateWindow(city: City, now = new Date()): string[] {
  return Array.from({ length: forecastDays }, (_, index) => {
    const date = new Date(now.getTime() + index * 24 * 60 * 60 * 1000);
    return formatDateInTimezone(date, city.timezone);
  });
}

function buildDesiredCacheKeys(cities: City[]): { allKeys: Set<string>; keysByCity: Map<string, string[]> } {
  const keysByCity = new Map<string, string[]>();
  const allKeys = new Set<string>();

  for (const city of cities) {
    const cityKeys = buildForecastDateWindow(city).map((date) => forecastCacheKey(city.id, date));
    keysByCity.set(city.id, cityKeys);
    cityKeys.forEach((key) => allKeys.add(key));
  }

  return { allKeys, keysByCity };
}

function indexForecasts(forecasts: DailyForecast[]): Map<string, DailyForecast> {
  return new Map(forecasts.map((forecast) => [forecastCacheKey(forecast.cityId, forecast.date), forecast]));
}

export async function refreshWeather(db: WeatherDatabase): Promise<RefreshWeatherResult> {
  try {
    await setupWeatherDatabase(db);
    const [cities, existingForecasts] = await Promise.all([readCities(db), readForecasts(db)]);
    const { allKeys: desiredCacheKeys, keysByCity } = buildDesiredCacheKeys(cities);
    const forecastsByKey = indexForecasts(
      existingForecasts.filter((forecast) => desiredCacheKeys.has(forecastCacheKey(forecast.cityId, forecast.date)))
    );
    const citiesToFetch = cities.filter((city) => {
      const cityKeys = keysByCity.get(city.id) ?? [];
      return cityKeys.some((key) => !forecastsByKey.has(key));
    });

    console.log(
      `Weather cache has ${forecastsByKey.size}/${desiredCacheKeys.size} city-date entries. ` +
        `${citiesToFetch.length}/${cities.length} cities need Open-Meteo fetch.`
    );

    let forecastsUpserted = 0;
    const cityBatches = chunk(citiesToFetch, batchSize);
    for (const [index, cityBatch] of cityBatches.entries()) {
      const batchForecasts = await fetchForecastBatch(cityBatch, forecastDays);
      const missingForecasts = batchForecasts.filter((forecast) => {
        const key = forecastCacheKey(forecast.cityId, forecast.date);
        return desiredCacheKeys.has(key) && !forecastsByKey.has(key);
      });

      await upsertForecasts(db, missingForecasts);
      for (const forecast of missingForecasts) {
        forecastsByKey.set(forecastCacheKey(forecast.cityId, forecast.date), forecast);
      }
      forecastsUpserted += missingForecasts.length;
      console.log(`Fetched batch ${index + 1}/${cityBatches.length}: ${cityBatch.length} cities, upserted ${missingForecasts.length} days`);
    }

    await updateRefreshSuccess(db, actionKey);
    return {
      cities: cities.length,
      citiesFetched: citiesToFetch.length,
      forecastsUpserted
    };
  } catch (error) {
    await updateRefreshFailure(db, actionKey, error);
    throw error;
  }
}
