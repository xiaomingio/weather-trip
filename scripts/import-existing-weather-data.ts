/**
 * 文件说明: 一次性把仓库现有城市和天气 JSON 导入 Postgres，用于减少初次 Open-Meteo API 调用。
 * 对应文档: docs/data-flow.md
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { City, DailyForecast } from 'weather-core/types';
import { loadRootEnv } from './env.mjs';
import {
  createWeatherDatabase,
  setupWeatherDatabase,
  updateRefreshSuccess,
  upsertForecasts
} from 'weather-db';

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

function normalizeLegacyGeonamesId(id: string): string {
  return id.replace(/^cn-geonames-/, 'geonames-');
}

function distanceSquared(city: City, candidate: Pick<City, 'latitude' | 'longitude'>): number {
  return (city.latitude - candidate.latitude) ** 2 + (city.longitude - candidate.longitude) ** 2;
}

async function buildCityIdMap(db: ReturnType<typeof createWeatherDatabase>, cities: City[]): Promise<Map<string, string>> {
  const idMap = new Map<string, string>();

  for (const city of cities) {
    const normalizedId = normalizeLegacyGeonamesId(city.id);
    if (normalizedId.startsWith('geonames-')) {
      const exists = await db.pool.query('select 1 from cities where id = $1', [normalizedId]);
      if (exists.rowCount > 0) idMap.set(city.id, normalizedId);
      continue;
    }

    const result = await db.pool.query(
      `
        select id, latitude, longitude
        from geo_names_cities
        where id in (select id from cities)
          and country_code = $1
        order by ((latitude - $2) * (latitude - $2) + (longitude - $3) * (longitude - $3)) asc
        limit 1
      `,
      [city.countryCode, city.latitude, city.longitude]
    );
    const candidate = result.rows[0] as Pick<City, 'id' | 'latitude' | 'longitude'> | undefined;
    if (candidate && distanceSquared(city, candidate) < 0.25) idMap.set(city.id, candidate.id);
  }

  return idMap;
}

function remapForecasts(forecasts: DailyForecast[], idMap: Map<string, string>): DailyForecast[] {
  return forecasts.flatMap((forecast) => {
    const cityId = idMap.get(forecast.cityId);
    return cityId ? [{ ...forecast, cityId }] : [];
  });
}

const dataDir = path.resolve(process.cwd(), 'data');
loadRootEnv();
const db = createWeatherDatabase();

try {
  await setupWeatherDatabase(db);
  const [cities, forecasts] = await Promise.all([
    readJson<City[]>(path.join(dataDir, 'cities.json')),
    readJson<DailyForecast[]>(path.join(dataDir, 'forecasts.json'))
  ]);

  const cityIdMap = await buildCityIdMap(db, cities);
  const remappedForecasts = remapForecasts(forecasts, cityIdMap);
  await upsertForecasts(db, remappedForecasts);
  await updateRefreshSuccess(db, 'weather:import-existing-json');

  console.log(`Imported ${remappedForecasts.length} forecasts into existing GeoNames cities.`);
} finally {
  await db.close();
}
