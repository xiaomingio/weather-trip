/**
 * 文件说明: 将 Postgres 查询行映射为 weather-core 的城市和每日天气领域类型。
 * 对应文档: docs/data-flow.md
 */

import OpenCC from 'opencc-js';
import type { City, DailyForecast } from 'weather-core/types';

const regionByContinentCode: Record<string, City['region']> = {
  AF: 'africa',
  AS: 'asia',
  EU: 'europe',
  NA: 'north_america',
  OC: 'oceania',
  SA: 'south_america'
};

const countryDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' });
const toSimplifiedChinese = OpenCC.Converter({ from: 'twp', to: 'cn' });
export const chineseAlternateNameOrderSql = `
  array_position(array['zh-CN', 'zh-Hans', 'zh', 'zh-Hant']::text[], iso_language),
  is_preferred_name desc,
  is_short_name desc,
  length(alternate_name),
  alternate_name
`;

function normalizeSimplifiedChinese(value: unknown): string | undefined {
  if (!value) return undefined;
  return toSimplifiedChinese(String(value));
}

export function mapCity(row: Record<string, unknown>): City {
  const countryCode = String(row.country_code);
  const admin1Code = row.admin1_code ? String(row.admin1_code) : undefined;
  const admin1 = row.admin1_ascii_name ? String(row.admin1_ascii_name) : undefined;
  const admin1LocalName = normalizeSimplifiedChinese(row.admin1_zh_name);
  const cityZhName = normalizeSimplifiedChinese(row.city_zh_name);

  return {
    id: String(row.id),
    names: {
      zh: cityZhName ?? String(row.ascii_name || row.name),
      en: String(row.ascii_name || row.name)
    },
    country: countryDisplayNames.of(countryCode) ?? countryCode,
    countryCode,
    admin1,
    admin1Code,
    admin1GroupCode: admin1Code,
    admin1LocalName,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    timezone: String(row.timezone),
    population: row.population === null ? undefined : Number(row.population),
    elevationMeters: Number(row.elevation ?? row.dem ?? 0),
    region: regionByContinentCode[String(row.continent_code)] ?? 'asia',
    selectionReasons: Array.isArray(row.selection_reasons)
      ? row.selection_reasons.map((reason) => String(reason))
      : []
  };
}

function formatDatabaseDate(value: unknown): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return String(value).slice(0, 10);
}

export function mapForecast(row: Record<string, unknown>): DailyForecast {
  return {
    cityId: String(row.city_id),
    date: formatDatabaseDate(row.date),
    weatherCode: Number(row.weather_code),
    weatherType: row.weather_type as DailyForecast['weatherType'],
    temperatureMinC: Number(row.temperature_min_c),
    temperatureMaxC: Number(row.temperature_max_c),
    temperatureMeanC: Number(row.temperature_mean_c),
    humidityMeanPercent: Number(row.humidity_mean_percent),
    precipitationProbabilityMax:
      row.precipitation_probability_max === null ? undefined : Number(row.precipitation_probability_max),
    precipitationSumMm: Number(row.precipitation_sum_mm),
    windSpeedMaxKmh: row.wind_speed_max_kmh === null ? undefined : Number(row.wind_speed_max_kmh)
  };
}
