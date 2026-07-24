/**
 * 文件说明: 根据城市预报聚合国家、一级行政区和二级行政区地图区域天气。
 * 对应文档: docs/specs/30-weather-coverage-design.md
 */
import type { City, DailyForecast, RegionKey, RegionWeatherSummary, WeatherFilter, WeatherType } from 'weather-core/types';
import { countryLabel } from './country-labels';
import { calculateComfortScore, dayMatchesFilter } from './scoring';
import {
  chinaCompanionAdmin2RegionForCountry,
  cityMatchesRegion,
  parseAdmin1Region,
  parseAdmin2Region,
  primaryCountryCodeForRegion
} from './regions';
import type { DisplayLocale } from './format';

type RegionAccumulator = {
  id: string;
  level: RegionWeatherSummary['level'];
  countryCode: string;
  admin1Code?: string;
  admin1Name?: string;
  admin2Code?: string;
  name: string;
  cityIds: Set<string>;
  cityElevationIds: Set<string>;
  forecasts: DailyForecast[];
  matchDays: number;
  totalDays: number;
  elevationMetersTotal: number;
};

function chinaCompanionRegionForCity(city: City, activeRegion: RegionKey): Pick<RegionAccumulator, 'id' | 'level' | 'countryCode' | 'admin1Code' | 'admin2Code'> | null {
  const companionAdmin2Region = chinaCompanionAdmin2RegionForCountry(city.countryCode);
  if (!companionAdmin2Region) return null;

  const companionAdmin2 = parseAdmin2Region(companionAdmin2Region);
  if (!companionAdmin2) return null;
  const selectedAdmin1 = parseAdmin1Region(activeRegion);
  const selectedAdmin2 = parseAdmin2Region(activeRegion);
  if (activeRegion !== 'country:CN' && selectedAdmin1?.admin1Code !== city.countryCode && selectedAdmin2?.admin1Code !== city.countryCode) return null;

  return {
    id: companionAdmin2Region,
    level: 'admin2',
    countryCode: 'CN',
    admin1Code: companionAdmin2.admin1Code,
    admin2Code: companionAdmin2.admin2Code
  };
}

function dominantWeatherType(forecasts: DailyForecast[]): WeatherType {
  const counts = new Map<WeatherType, number>();

  for (const forecast of forecasts) {
    counts.set(forecast.weatherType, (counts.get(forecast.weatherType) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'cloudy';
}

function countryName(countryCode: string, locale: DisplayLocale): string {
  return countryLabel(countryCode, locale);
}

function countryTierForCountry(cities: City[], countryCode: string): City['countryTier'] {
  return cities.find((city) => city.countryCode === countryCode)?.countryTier ?? 'C1';
}

function regionIdForCity(city: City, activeRegion: RegionKey, allCities: City[]): Pick<RegionAccumulator, 'id' | 'level' | 'countryCode' | 'admin1Code' | 'admin2Code'> | null {
  if (!city.countryCode) return null;
  const chinaCompanionRegion = chinaCompanionRegionForCity(city, activeRegion);
  if (chinaCompanionRegion) return chinaCompanionRegion;

  const activeCountryCode = primaryCountryCodeForRegion(activeRegion);
  const countryTier = activeCountryCode ? countryTierForCountry(allCities, activeCountryCode) : city.countryTier ?? 'C1';

  if (countryTier === 'C3') {
    if (!city.admin1GroupCode || !city.admin2Code) return null;
    return {
      id: `admin2:${city.countryCode}.${city.admin1GroupCode}.${city.admin2Code}`,
      level: 'admin2',
      countryCode: city.countryCode,
      admin1Code: city.admin1GroupCode,
      admin2Code: city.admin2Code
    };
  }

  if (countryTier !== 'C1') {
    if (!city.admin1GroupCode) return null;
    return {
      id: `admin1:${city.countryCode}.${city.admin1GroupCode}`,
      level: 'admin1',
      countryCode: city.countryCode,
      admin1Code: city.admin1GroupCode
    };
  }

  return {
    id: `country:${city.countryCode}`,
    level: 'country',
    countryCode: city.countryCode
  };
}

function admin1NameForCity(city: City, region: Pick<RegionAccumulator, 'countryCode' | 'admin1Code'>, locale: DisplayLocale): string | undefined {
  if (!region.admin1Code) return undefined;
  if (region.countryCode === 'CN' && region.admin1Code === city.countryCode && city.countryCode !== 'CN') return countryName(city.countryCode ?? '', locale);
  return locale === 'zh' ? city.admin1LocalName ?? city.admin1 ?? city.admin1GroupCode : city.admin1 ?? city.admin1GroupCode;
}

function regionNameForCity(city: City, region: Pick<RegionAccumulator, 'level' | 'countryCode' | 'admin1Code'>, locale: DisplayLocale): string {
  if (region.countryCode === 'CN' && region.admin1Code === city.countryCode && city.countryCode !== 'CN') return countryName(city.countryCode ?? '', locale);
  const level = region.level;
  if (level === 'country') return countryName(city.countryCode ?? '', locale);
  if (level === 'admin2') return locale === 'zh' ? city.admin2LocalName ?? city.admin2 ?? city.admin2Code ?? '' : city.admin2 ?? city.admin2Code ?? '';
  return locale === 'zh' ? city.admin1LocalName ?? city.admin1 ?? city.admin1GroupCode ?? '' : city.admin1 ?? city.admin1GroupCode ?? '';
}

function ensureAccumulator(
  grouped: Map<string, RegionAccumulator>,
  city: City,
  activeRegion: RegionKey,
  allCities: City[],
  locale: DisplayLocale
): RegionAccumulator | null {
  const region = regionIdForCity(city, activeRegion, allCities);
  if (!region || !city.countryCode) return null;

  const current = grouped.get(region.id);
  if (current) return current;

  const accumulator: RegionAccumulator = {
    id: region.id,
    level: region.level,
    countryCode: region.countryCode ?? city.countryCode,
    admin1Code: region.admin1Code,
    admin1Name: region.level === 'admin2' ? admin1NameForCity(city, region, locale) : undefined,
    admin2Code: region.admin2Code,
    name: regionNameForCity(city, region, locale),
    cityIds: new Set(),
    cityElevationIds: new Set(),
    forecasts: [],
    matchDays: 0,
    totalDays: 0,
    elevationMetersTotal: 0
  };
  grouped.set(region.id, accumulator);
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
    admin1Name: value.admin1Name,
    admin2Code: value.admin2Code,
    name: value.name,
    cityCount,
    forecastCount,
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

function addCityGeography(accumulator: RegionAccumulator, city: City): void {
  accumulator.cityIds.add(city.id);
  if (!accumulator.cityElevationIds.has(city.id)) {
    accumulator.cityElevationIds.add(city.id);
    accumulator.elevationMetersTotal += city.elevationMeters;
  }
}

export function buildWeatherMapRegionSummaries(
  cities: City[],
  forecasts: DailyForecast[],
  date: string,
  region: RegionKey,
  locale: DisplayLocale
): RegionWeatherSummary[] {
  const cityById = new Map(cities.map((city) => [city.id, city]));
  const grouped = new Map<string, RegionAccumulator>();

  for (const city of cities) {
    if (!cityMatchesRegion(city, region)) continue;
    const accumulator = ensureAccumulator(grouped, city, region, cities, locale);
    if (!accumulator) continue;
    addCityGeography(accumulator, city);
  }

  for (const forecast of forecasts) {
    if (forecast.date !== date) continue;
    const city = cityById.get(forecast.cityId);
    if (!city || !cityMatchesRegion(city, region)) continue;
    const accumulator = ensureAccumulator(grouped, city, region, cities, locale);
    if (!accumulator) continue;
    addCityGeography(accumulator, city);
    accumulator.forecasts.push(forecast);
  }

  return [...grouped.values()].map(summarizeAccumulator);
}

export function buildCityFinderRegionSummaries(
  cities: City[],
  forecastsByCity: Map<string, DailyForecast[]>,
  filter: WeatherFilter,
  locale: DisplayLocale
): RegionWeatherSummary[] {
  const grouped = new Map<string, RegionAccumulator>();

  for (const city of cities) {
    if (!cityMatchesRegion(city, filter.region)) continue;
    const accumulator = ensureAccumulator(grouped, city, filter.region, cities, locale);
    if (!accumulator) continue;
    addCityGeography(accumulator, city);
    const scopedForecasts = (forecastsByCity.get(city.id) ?? []).slice(0, filter.dateWindowDays);
    if (scopedForecasts.length === 0) continue;
    accumulator.forecasts.push(...scopedForecasts);
    accumulator.matchDays += scopedForecasts.filter((forecast) => dayMatchesFilter(forecast, filter)).length;
    accumulator.totalDays += scopedForecasts.length;
  }

  return [...grouped.values()].map(summarizeAccumulator);
}
