/**
 * 文件说明: 在服务端按当前工具页筛选条件组装轻量化天气 Dashboard 响应。
 * 对应文档: docs/data-flow.md
 */
import type { WeatherSnapshot } from 'weather-db';
import type { City, DailyForecast, RegionKey, TravelFilter, ViewMode, WeatherType } from 'weather-core/types';
import type { DisplayLocale } from './format';
import { buildDailyRegionSummaries, buildTravelRegionSummaries } from './region-weather';
import { cityMatchesRegion, getRegionLabel, regionOptions } from './regions';
import { buildDailyWeather, scoreCityTravel } from './scoring';
import {
  type DashboardResultItem,
  type DashboardSubRegionOption,
  type WeatherDashboardPayload,
  getPrimaryRegionId,
  parseTravelFilterFromSearch,
  readDateFromSearch
} from './weather-dashboard-shared';

type WeatherDashboardDataParams = {
  locale: DisplayLocale;
  mode: ViewMode;
  searchParams: URLSearchParams;
  selectedCityId?: string | null;
};

function groupForecastsByCity(forecasts: DailyForecast[]): Map<string, DailyForecast[]> {
  const grouped = new Map<string, DailyForecast[]>();

  for (const forecast of forecasts) {
    const list = grouped.get(forecast.cityId) ?? [];
    list.push(forecast);
    grouped.set(forecast.cityId, list);
  }

  for (const list of grouped.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  return grouped;
}

function buildRegionAvailableDates(cities: City[], forecasts: DailyForecast[], region: RegionKey): string[] {
  const cityIds = new Set(cities.filter((city) => cityMatchesRegion(city, region)).map((city) => city.id));
  if (cityIds.size === 0) return [];

  const dateCounts = new Map<string, number>();
  for (const forecast of forecasts) {
    if (!cityIds.has(forecast.cityId)) continue;
    dateCounts.set(forecast.date, (dateCounts.get(forecast.date) ?? 0) + 1);
  }

  const completeDates = [...dateCounts.entries()]
    .filter(([, count]) => count === cityIds.size)
    .map(([date]) => date)
    .sort();
  if (completeDates.length > 0) return completeDates;

  return [...dateCounts.keys()].sort();
}

function buildSubRegionOptions(
  cities: City[],
  primaryRegion: RegionKey,
  locale: DisplayLocale,
  allLabel: string
): DashboardSubRegionOption[] {
  if (!primaryRegion.startsWith('country:')) return [{ id: primaryRegion, label: allLabel }];
  const countryCode = primaryRegion.slice('country:'.length);
  const allOption = { id: primaryRegion, label: allLabel };

  if (countryCode === 'CN') {
    return [
      allOption,
      ...regionOptions
        .filter((option) => option.id.startsWith('province:'))
        .map((option) => ({ id: option.id, label: getRegionLabel(option, locale) }))
    ];
  }

  const collator = new Intl.Collator(locale === 'zh' ? 'zh-CN-u-co-pinyin' : 'en', { sensitivity: 'base' });
  const optionsById = new Map<RegionKey, DashboardSubRegionOption>();
  for (const city of cities) {
    if (city.countryCode !== countryCode || !city.admin1GroupCode) continue;
    const id = `admin1:${countryCode}.${city.admin1GroupCode}`;
    const label = locale === 'zh' ? city.admin1LocalName ?? city.admin1 ?? city.admin1GroupCode : city.admin1 ?? city.admin1GroupCode;
    optionsById.set(id, { id, label });
  }

  return [allOption, ...[...optionsById.values()].sort((a, b) => collator.compare(a.label, b.label) || a.id.localeCompare(b.id))];
}

function averageValue<T>(items: T[], getValue: (item: T) => number): number {
  return items.reduce((sum, item) => sum + getValue(item), 0) / Math.max(items.length, 1);
}

function dominantWeatherType(forecasts: DailyForecast[]): WeatherType {
  const counts = new Map<WeatherType, number>();

  for (const forecast of forecasts) {
    counts.set(forecast.weatherType, (counts.get(forecast.weatherType) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'cloudy';
}

function buildTravelItems(cities: City[], forecastsByCity: Map<string, DailyForecast[]>, filter: TravelFilter): DashboardResultItem[] {
  return cities
    .filter((city) => cityMatchesRegion(city, filter.region))
    .map((city) => scoreCityTravel(city, forecastsByCity.get(city.id) ?? [], filter))
    .sort((a, b) => b.score - a.score || b.matchDays - a.matchDays)
    .map((score) => ({
      mode: 'travel',
      city: score.city,
      matchDays: score.matchDays,
      totalDays: score.totalDays,
      score: score.score,
      averageTemperatureC: score.averageTemperatureC,
      averagePrecipitationMm: averageValue(score.forecasts, (forecast) => forecast.precipitationSumMm),
      averageHumidityPercent: averageValue(score.forecasts, (forecast) => forecast.humidityMeanPercent),
      rainDays: score.rainDays,
      bestStreakDays: score.bestStreakDays,
      weatherType: dominantWeatherType(score.forecasts)
    }));
}

function buildDailyItems(cities: City[], forecasts: DailyForecast[], selectedDate: string, region: RegionKey): DashboardResultItem[] {
  return buildDailyWeather(cities, forecasts, selectedDate, region).map((item) => ({
    mode: 'daily',
    city: item.city,
    forecast: item.forecast,
    comfortScore: item.comfortScore
  }));
}

export function buildWeatherDashboardPayload(
  snapshot: WeatherSnapshot,
  { locale, mode, searchParams, selectedCityId }: WeatherDashboardDataParams
): WeatherDashboardPayload {
  const travelFilter = parseTravelFilterFromSearch(searchParams);
  const forecastsByCity = groupForecastsByCity(snapshot.forecasts);
  const regionAvailableDates = buildRegionAvailableDates(snapshot.cities, snapshot.forecasts, travelFilter.region);
  const requestedDate = readDateFromSearch(searchParams, regionAvailableDates[0] ?? snapshot.availableDates[0] ?? '');
  const selectedDate = regionAvailableDates.includes(requestedDate)
    ? requestedDate
    : regionAvailableDates[0] ?? snapshot.availableDates[0] ?? '';
  const allLabel = locale === 'zh' ? '全部' : 'All';
  const subRegionOptions = buildSubRegionOptions(snapshot.cities, getPrimaryRegionId(travelFilter.region), locale, allLabel);
  const resultItems =
    mode === 'travel'
      ? buildTravelItems(snapshot.cities, forecastsByCity, travelFilter)
      : buildDailyItems(snapshot.cities, snapshot.forecasts, selectedDate, travelFilter.region);
  const effectiveSelectedCityId = resultItems.some((item) => item.city.id === selectedCityId)
    ? selectedCityId ?? null
    : resultItems[0]?.city.id ?? null;
  const selectedCityForecasts = effectiveSelectedCityId ? (forecastsByCity.get(effectiveSelectedCityId) ?? []).slice(0, 14) : [];
  const regionSummaries =
    mode === 'travel'
      ? buildTravelRegionSummaries(snapshot.cities, forecastsByCity, travelFilter, locale)
      : buildDailyRegionSummaries(snapshot.cities, snapshot.forecasts, selectedDate, travelFilter.region, locale);

  return {
    mode,
    selectedDate,
    availableDates: snapshot.availableDates,
    regionAvailableDates,
    subRegionOptions,
    resultItems,
    regionSummaries,
    selectedCityForecasts
  };
}
