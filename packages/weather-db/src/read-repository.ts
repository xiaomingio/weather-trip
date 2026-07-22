/**
 * 文件说明: 提供 Web 读取城市、天气预报、可用日期和天气快照的只读仓储。
 * 对应文档: docs/data-flow.md
 */

import type { City, DailyForecast } from 'weather-core/types';
import type { WeatherDatabase, WeatherSnapshot } from './types.js';
import { chineseAlternateNameOrderSql, mapCity, mapForecast } from './mappers.js';

export async function readCities(db: WeatherDatabase): Promise<City[]> {
  const result = await db.pool.query(`
    select
      geo_names_cities.*,
      cities.selection_reasons,
      city_zh.alternate_name as city_zh_name,
      admin1.ascii_name as admin1_ascii_name,
      admin1_zh.alternate_name as admin1_zh_name
    from cities
    inner join geo_names_cities on geo_names_cities.id = cities.id
    left join geo_names_admin1 admin1
      on admin1.code = geo_names_cities.country_code || '.' || geo_names_cities.admin1_code
    left join lateral (
      select alternate_name
      from geo_names_alternate_names
      where geoname_id = geo_names_cities.geoname_id
        and iso_language in ('zh', 'zh-CN', 'zh-Hans', 'zh-Hant')
        and not is_historic
      order by ${chineseAlternateNameOrderSql}
      limit 1
    ) city_zh on true
    left join lateral (
      select alternate_name
      from geo_names_alternate_names
      where geoname_id = admin1.geoname_id
        and iso_language in ('zh', 'zh-CN', 'zh-Hans', 'zh-Hant')
        and not is_historic
      order by ${chineseAlternateNameOrderSql}
      limit 1
    ) admin1_zh on true
    order by cities.selection_rank
  `);
  return result.rows.map(mapCity);
}

async function readCitiesWithForecasts(db: WeatherDatabase): Promise<City[]> {
  const result = await db.pool.query(`
    select distinct
      geo_names_cities.*,
      cities.selection_rank,
      cities.selection_reasons,
      city_zh.alternate_name as city_zh_name,
      admin1.ascii_name as admin1_ascii_name,
      admin1_zh.alternate_name as admin1_zh_name
    from cities
    inner join geo_names_cities on geo_names_cities.id = cities.id
    inner join daily_forecasts on daily_forecasts.city_id = geo_names_cities.id
    left join geo_names_admin1 admin1
      on admin1.code = geo_names_cities.country_code || '.' || geo_names_cities.admin1_code
    left join lateral (
      select alternate_name
      from geo_names_alternate_names
      where geoname_id = geo_names_cities.geoname_id
        and iso_language in ('zh', 'zh-CN', 'zh-Hans', 'zh-Hant')
        and not is_historic
      order by ${chineseAlternateNameOrderSql}
      limit 1
    ) city_zh on true
    left join lateral (
      select alternate_name
      from geo_names_alternate_names
      where geoname_id = admin1.geoname_id
        and iso_language in ('zh', 'zh-CN', 'zh-Hans', 'zh-Hant')
        and not is_historic
      order by ${chineseAlternateNameOrderSql}
      limit 1
    ) admin1_zh on true
    order by cities.selection_rank
  `);
  return result.rows.map(mapCity);
}

export async function readForecasts(db: WeatherDatabase): Promise<DailyForecast[]> {
  const result = await db.pool.query('select * from daily_forecasts order by city_id, date');
  return result.rows.map(mapForecast);
}

export function getAvailableDates(cities: City[], forecasts: DailyForecast[]): string[] {
  const dateCounts = new Map<string, number>();

  for (const forecast of forecasts) {
    dateCounts.set(forecast.date, (dateCounts.get(forecast.date) ?? 0) + 1);
  }

  return [...dateCounts.entries()]
    .filter(([, forecastCount]) => cities.length > 0 && forecastCount > 0)
    .map(([date]) => date)
    .sort();
}

export async function readWeatherSnapshot(db: WeatherDatabase): Promise<WeatherSnapshot> {
  const [cities, forecasts] = await Promise.all([readCitiesWithForecasts(db), readForecasts(db)]);
  return {
    cities,
    forecasts,
    availableDates: getAvailableDates(cities, forecasts)
  };
}
