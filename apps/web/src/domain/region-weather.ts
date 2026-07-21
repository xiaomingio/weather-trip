/**
 * 文件说明: 根据城市预报聚合国家、详细国家一级行政区和中国省级地图区域天气。
 * 对应文档: docs/map-region-coloring.md
 */
import type { City, DailyForecast, RegionKey, RegionWeatherSummary, TravelFilter, WeatherType } from 'weather-core/types';
import { chinaAdmin1AdcodeByGeoNamesCode, chinaProvinceNameByAdcode } from './china-admin1';
import { calculateComfortScore, dayMatchesFilter } from './scoring';
import { cityMatchesRegion, getMapRegionLayer, type MapRegionLayer } from './regions';
import type { DisplayLocale } from './format';

type RegionAccumulator = {
  id: string;
  level: RegionWeatherSummary['level'];
  countryCode: string;
  admin1Code?: string;
  name: string;
  cityIds: Set<string>;
  forecasts: DailyForecast[];
  matchDays: number;
  totalDays: number;
  elevationMetersTotal: number;
};

const countryDisplayNames = {
  zh: new Intl.DisplayNames(['zh-CN'], { type: 'region' }),
  en: new Intl.DisplayNames(['en'], { type: 'region' })
};

function dominantWeatherType(forecasts: DailyForecast[]): WeatherType {
  const counts = new Map<WeatherType, number>();

  for (const forecast of forecasts) {
    counts.set(forecast.weatherType, (counts.get(forecast.weatherType) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'cloudy';
}

function countryName(countryCode: string, locale: DisplayLocale): string {
  return countryDisplayNames[locale].of(countryCode) ?? countryCode;
}

function regionIdForCity(city: City, layer: MapRegionLayer): string | null {
  if (!city.countryCode) return null;
  if (layer === 'country') return `country:${city.countryCode}`;
  if (!city.admin1GroupCode) return null;
  if (layer === 'china-admin1') {
    const adcode = chinaAdmin1AdcodeByGeoNamesCode[city.admin1GroupCode];
    return adcode ? `province:${adcode}` : null;
  }
  return `admin1:${city.countryCode}.${city.admin1GroupCode}`;
}

function regionNameForCity(city: City, layer: MapRegionLayer, locale: DisplayLocale): string {
  if (layer === 'country') return countryName(city.countryCode ?? '', locale);
  if (layer === 'china-admin1' && city.admin1GroupCode) {
    const adcode = chinaAdmin1AdcodeByGeoNamesCode[city.admin1GroupCode];
    return adcode ? chinaProvinceNameByAdcode[adcode] ?? adcode : city.admin1GroupCode;
  }
  return locale === 'zh' ? city.admin1LocalName ?? city.admin1 ?? city.admin1GroupCode ?? '' : city.admin1 ?? city.admin1GroupCode ?? '';
}

function ensureAccumulator(
  grouped: Map<string, RegionAccumulator>,
  city: City,
  layer: MapRegionLayer,
  locale: DisplayLocale
): RegionAccumulator | null {
  const id = regionIdForCity(city, layer);
  if (!id || !city.countryCode) return null;

  const current = grouped.get(id);
  if (current) return current;

  const accumulator: RegionAccumulator = {
    id,
    level: layer === 'country' ? 'country' : 'admin1',
    countryCode: city.countryCode,
    admin1Code: layer === 'country' ? undefined : city.admin1GroupCode,
    name: regionNameForCity(city, layer, locale),
    cityIds: new Set(),
    forecasts: [],
    matchDays: 0,
    totalDays: 0,
    elevationMetersTotal: 0
  };
  grouped.set(id, accumulator);
  return accumulator;
}

function summarizeAccumulator(value: RegionAccumulator): RegionWeatherSummary {
  const forecastCount = value.forecasts.length;
  const cityCount = value.cityIds.size;
  const matchDays = value.matchDays;
  const totalDays = value.totalDays;

  return {
    id: value.id,
    level: value.level,
    countryCode: value.countryCode,
    admin1Code: value.admin1Code,
    name: value.name,
    cityCount,
    weatherType: dominantWeatherType(value.forecasts),
    temperatureMeanC: value.forecasts.reduce((sum, forecast) => sum + forecast.temperatureMeanC, 0) / Math.max(forecastCount, 1),
    humidityMeanPercent: value.forecasts.reduce((sum, forecast) => sum + forecast.humidityMeanPercent, 0) / Math.max(forecastCount, 1),
    elevationMeters: value.elevationMetersTotal / Math.max(cityCount, 1),
    precipitationSumMm: value.forecasts.reduce((sum, forecast) => sum + forecast.precipitationSumMm, 0) / Math.max(forecastCount, 1),
    windSpeedMaxKmh:
      value.forecasts.reduce((sum, forecast) => sum + (forecast.windSpeedMaxKmh ?? 0), 0) / Math.max(forecastCount, 1),
    comfortScore: totalDays > 0 ? matchDays / totalDays : value.forecasts.reduce((sum, forecast) => sum + calculateComfortScore(forecast), 0) / Math.max(forecastCount, 1),
    matchDays,
    totalDays
  };
}

export function buildDailyRegionSummaries(
  cities: City[],
  forecasts: DailyForecast[],
  date: string,
  region: RegionKey,
  locale: DisplayLocale
): RegionWeatherSummary[] {
  const layer = getMapRegionLayer(region);
  const cityById = new Map(cities.map((city) => [city.id, city]));
  const grouped = new Map<string, RegionAccumulator>();

  for (const forecast of forecasts) {
    if (forecast.date !== date) continue;
    const city = cityById.get(forecast.cityId);
    if (!city || !cityMatchesRegion(city, region)) continue;
    const accumulator = ensureAccumulator(grouped, city, layer, locale);
    if (!accumulator) continue;
    if (!accumulator.cityIds.has(city.id)) {
      accumulator.cityIds.add(city.id);
      accumulator.elevationMetersTotal += city.elevationMeters;
    }
    accumulator.forecasts.push(forecast);
  }

  return [...grouped.values()].map(summarizeAccumulator);
}

export function buildTravelRegionSummaries(
  cities: City[],
  forecastsByCity: Map<string, DailyForecast[]>,
  filter: TravelFilter,
  locale: DisplayLocale
): RegionWeatherSummary[] {
  const layer = getMapRegionLayer(filter.region);
  const grouped = new Map<string, RegionAccumulator>();

  for (const city of cities) {
    if (!cityMatchesRegion(city, filter.region)) continue;
    const scopedForecasts = (forecastsByCity.get(city.id) ?? []).slice(0, filter.dateWindowDays);
    if (scopedForecasts.length === 0) continue;
    const accumulator = ensureAccumulator(grouped, city, layer, locale);
    if (!accumulator) continue;
    accumulator.cityIds.add(city.id);
    accumulator.forecasts.push(...scopedForecasts);
    accumulator.matchDays += scopedForecasts.filter((forecast) => dayMatchesFilter(forecast, filter)).length;
    accumulator.totalDays += scopedForecasts.length;
    accumulator.elevationMetersTotal += city.elevationMeters;
  }

  return [...grouped.values()].map(summarizeAccumulator);
}
