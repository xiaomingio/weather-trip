/**
 * 文件说明: 按刷新新鲜度更新未来天气预报，避免短时间重复请求并定期覆盖过期预报。
 * 对应文档: docs/data-flow.md
 */
import type { City, DailyForecast } from 'weather-core/types';
import {
  readRefreshStatus,
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
const freshRefreshThresholdMs = 12 * 60 * 60 * 1000;

export type RefreshWeatherResult = {
  cities: number;
  citiesFetched: number;
  forecastsUpserted: number;
  skipped: boolean;
  reason?: string;
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

function buildForecastDateWindow(city: City, now = new Date(), startOffsetDays = 0, days = forecastDays): string[] {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now.getTime() + (index + startOffsetDays) * 24 * 60 * 60 * 1000);
    return formatDateInTimezone(date, city.timezone);
  });
}

function buildAcceptableCacheKeys(cities: City[]): { targetEntryCount: number; keysByCity: Map<string, Set<string>> } {
  const keysByCity = new Map<string, Set<string>>();
  const now = new Date();

  for (const city of cities) {
    const cityKeys = new Set(
      buildForecastDateWindow(city, now, -1, forecastDays + 1).map((date) => forecastCacheKey(city.id, date))
    );
    keysByCity.set(city.id, cityKeys);
  }

  return { targetEntryCount: cities.length * forecastDays, keysByCity };
}

function indexForecasts(forecasts: DailyForecast[]): Map<string, DailyForecast> {
  return new Map(forecasts.map((forecast) => [forecastCacheKey(forecast.cityId, forecast.date), forecast]));
}

function isFreshRefresh(lastSuccessAt: Date | undefined, now: Date): boolean {
  return Boolean(lastSuccessAt && now.getTime() - lastSuccessAt.getTime() < freshRefreshThresholdMs);
}

export async function refreshWeather(db: WeatherDatabase): Promise<RefreshWeatherResult> {
  try {
    await setupWeatherDatabase(db);
    const now = new Date();
    const [cities, existingForecasts, refreshStatus] = await Promise.all([
      readCities(db),
      readForecasts(db),
      readRefreshStatus(db, actionKey)
    ]);
    const { targetEntryCount, keysByCity } = buildAcceptableCacheKeys(cities);
    const forecastsByKey = indexForecasts(existingForecasts);
    let cachedEntryCount = 0;
    const citiesWithMissingForecasts = cities.filter((city) => {
      const cityKeys = keysByCity.get(city.id) ?? new Set<string>();
      const existingCount = [...cityKeys].filter((key) => forecastsByKey.has(key)).length;
      cachedEntryCount += Math.min(existingCount, forecastDays);
      return existingCount < forecastDays;
    });
    const hasFreshRefresh = isFreshRefresh(refreshStatus?.lastSuccessAt, now);
    const citiesToFetch = hasFreshRefresh ? citiesWithMissingForecasts : cities;

    console.log(
      `Weather cache has ${cachedEntryCount}/${targetEntryCount} city-date entries. ` +
        `${citiesToFetch.length}/${cities.length} cities need Open-Meteo fetch. ` +
        `Last successful refresh: ${refreshStatus?.lastSuccessAt?.toISOString() ?? 'never'}.`
    );

    if (hasFreshRefresh && citiesToFetch.length === 0) {
      console.log('Weather refresh skipped because the last successful refresh is less than 12 hours old.');
      return {
        cities: cities.length,
        citiesFetched: 0,
        forecastsUpserted: 0,
        skipped: true,
        reason: 'fresh'
      };
    }

    let forecastsUpserted = 0;
    const cityBatches = chunk(citiesToFetch, batchSize);
    for (const [index, cityBatch] of cityBatches.entries()) {
      const batchForecasts = await fetchForecastBatch(cityBatch, forecastDays);
      const targetForecasts = batchForecasts.filter((forecast) => {
        const key = forecastCacheKey(forecast.cityId, forecast.date);
        if (!(keysByCity.get(forecast.cityId)?.has(key) ?? false)) return false;
        return !hasFreshRefresh || !forecastsByKey.has(key);
      });

      await upsertForecasts(db, targetForecasts);
      for (const forecast of targetForecasts) {
        forecastsByKey.set(forecastCacheKey(forecast.cityId, forecast.date), forecast);
      }
      forecastsUpserted += targetForecasts.length;
      console.log(`Fetched batch ${index + 1}/${cityBatches.length}: ${cityBatch.length} cities, upserted ${targetForecasts.length} days`);
    }

    await updateRefreshSuccess(db, actionKey);
    return {
      cities: cities.length,
      citiesFetched: citiesToFetch.length,
      forecastsUpserted,
      skipped: false
    };
  } catch (error) {
    await updateRefreshFailure(db, actionKey, error);
    throw error;
  }
}
