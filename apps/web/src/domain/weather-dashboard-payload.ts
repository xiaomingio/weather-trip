/**
 * 文件说明: 从天气应用快照和二进制天气矩阵组装 City Finder 与 Weather Map 页面展示 payload。
 * 对应文档: docs/specs/32-public-data-contract.md, docs/specs/43-weather-matrix-performance.md
 */
import type { City, DailyForecast, RegionKey, WeatherDataSnapshot, WeatherFilter, WeatherToolId, WeatherType } from 'weather-core/types';
import { hasForecastDay, readCityForecasts, readForecastsForDate } from 'weather-core/static-data';
import type { DisplayLocale } from './format';
import { buildWeatherMapRegionSummaries, buildCityFinderRegionSummaries } from './region-weather';
import {
  cityMatchesRegion,
  chinaCompanionAdmin1RegionForCountry,
  getMapRegionLayer,
  getPrimaryRegionOptions,
  getRegionGroup,
  getRegionLabel,
  getRegionOption
} from './regions';
import { buildWeatherMapCityWeather, compareCityPopularity, scoreCityFinderMatch } from './scoring';
import {
  type DashboardWeatherMapResultItem,
  type DashboardResultItem,
  type DashboardSubRegionOption,
  type MapBounds,
  type WeatherToolPayload,
  type CityForecastPayload,
  type WeatherLayerPayload,
  type MapDatesPayload,
  type WeatherRegionOption,
  type RegionsPayload,
  type SubregionsPayload,
  getPrimaryRegionId,
  parseWeatherFilterFromSearch,
  readLayerFromSearch,
  readDateFromSearch
} from './weather-dashboard-shared';

type WeatherToolDataParams = {
  locale: DisplayLocale;
  searchParams: URLSearchParams;
};

function groupForecastsByCity(cities: City[], snapshot: WeatherDataSnapshot, dateWindowDays = snapshot.availableDates.length): Map<string, DailyForecast[]> {
  const grouped = new Map<string, DailyForecast[]>();

  for (const city of cities) {
    const forecasts = readCityForecasts(snapshot.forecastMatrix, city.id, dateWindowDays);
    if (forecasts.length > 0) grouped.set(city.id, forecasts);
  }

  return grouped;
}

function buildRegionAvailableDates(cities: City[], snapshot: WeatherDataSnapshot, region: RegionKey): string[] {
  const matchingCities = cities.filter((city) => cityMatchesRegion(city, region));
  if (matchingCities.length === 0) return [];

  const completeDates: string[] = [];
  const partialDates: string[] = [];
  for (const date of snapshot.availableDates) {
    let count = 0;
    for (const city of matchingCities) {
      if (hasForecastDay(snapshot.forecastMatrix, city.id, date)) count += 1;
    }
    if (count === matchingCities.length) completeDates.push(date);
    else if (count > 0) partialDates.push(date);
  }

  if (completeDates.length > 0) return completeDates;
  return partialDates;
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

  const collator = new Intl.Collator(locale === 'zh' ? 'zh-CN-u-co-pinyin' : 'en', { sensitivity: 'base' });
  const optionsById = new Map<RegionKey, DashboardSubRegionOption>();
  for (const city of cities) {
    const companionRegion = countryCode === 'CN' ? chinaCompanionAdmin1RegionForCountry(city.countryCode) : null;
    if (companionRegion) {
      optionsById.set(companionRegion, {
        id: companionRegion,
        label: getRegionLabel(getRegionOption(`country:${city.countryCode}`), locale)
      });
      continue;
    }
    if (city.countryCode !== countryCode || !city.admin1GroupCode) continue;
    const id = `admin1:${countryCode}.${city.admin1GroupCode}`;
    const label = locale === 'zh' ? city.admin1LocalName ?? city.admin1 ?? city.admin1GroupCode : city.admin1 ?? city.admin1GroupCode;
    optionsById.set(id, { id, label });
  }

  return [allOption, ...[...optionsById.values()].sort((a, b) => collator.compare(a.label, b.label) || a.id.localeCompare(b.id))];
}

function publicMapLayer(region: RegionKey): WeatherRegionOption['mapLayer'] {
  return getMapRegionLayer(region);
}

function buildBoundsForRegion(cities: City[], region: RegionKey): MapBounds | null {
  const matchingCities = cities.filter((city) => cityMatchesRegion(city, region));
  if (matchingCities.length === 0) return null;

  const longitudes = matchingCities.map((city) => city.longitude);
  const latitudes = matchingCities.map((city) => city.latitude);
  return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
}

function buildRegionOptionDto(cities: City[], region: RegionKey, locale: DisplayLocale): WeatherRegionOption {
  const option = getRegionOption(region);
  return {
    id: region,
    label: getRegionLabel(option, locale),
    group: getRegionGroup(option, locale),
    mapLayer: publicMapLayer(region),
    bounds: buildBoundsForRegion(cities, region)
  };
}

function buildSubRegionOptionDto(
  cities: City[],
  subRegionOption: DashboardSubRegionOption,
  primaryRegion: RegionKey,
  locale: DisplayLocale
): WeatherRegionOption {
  return {
    id: subRegionOption.id,
    label: subRegionOption.label,
    group: getRegionLabel(getRegionOption(primaryRegion), locale),
    mapLayer: publicMapLayer(subRegionOption.id),
    bounds: buildBoundsForRegion(cities, subRegionOption.id)
  };
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

function buildCityFinderItems(cities: City[], forecastsByCity: Map<string, DailyForecast[]>, filter: WeatherFilter): DashboardResultItem[] {
  return cities
    .filter((city) => cityMatchesRegion(city, filter.region))
    .map((city) => scoreCityFinderMatch(city, forecastsByCity.get(city.id) ?? [], filter))
    .sort((a, b) => b.score - a.score || b.matchDays - a.matchDays || compareCityPopularity(a.city, b.city))
    .map((score) => ({
      tool: 'city-finder',
      city: score.city,
      matchDays: score.matchDays,
      totalDays: score.totalDays,
      score: score.score,
      averageTemperatureC: score.averageTemperatureC,
      averagePrecipitationMm: averageValue(score.forecasts, (forecast) => forecast.precipitationSumMm),
      averageHumidityPercent: averageValue(score.forecasts, (forecast) => forecast.humidityMeanPercent),
      averageWindSpeedKmh: averageValue(score.forecasts, (forecast) => forecast.windSpeedMaxKmh ?? 0),
      rainDays: score.rainDays,
      bestStreakDays: score.bestStreakDays,
      weatherType: dominantWeatherType(score.forecasts)
    }));
}

function buildWeatherMapItems(cities: City[], forecasts: DailyForecast[], selectedDate: string, region: RegionKey): DashboardWeatherMapResultItem[] {
  return buildWeatherMapCityWeather(cities, forecasts, selectedDate, region).map((item) => ({
    tool: 'weather-map',
    city: item.city,
    forecast: item.forecast,
    comfortScore: item.comfortScore
  }));
}

function buildWeatherToolPayload(
  snapshot: WeatherDataSnapshot,
  tool: WeatherToolId,
  { locale, searchParams }: WeatherToolDataParams
): WeatherToolPayload {
  const weatherFilter = parseWeatherFilterFromSearch(searchParams);
  const scopedCities = snapshot.cities.filter((city) => cityMatchesRegion(city, weatherFilter.region));
  const forecastsByCity = groupForecastsByCity(scopedCities, snapshot, weatherFilter.dateWindowDays);
  const regionAvailableDates = buildRegionAvailableDates(snapshot.cities, snapshot, weatherFilter.region);
  const requestedDate = readDateFromSearch(searchParams, regionAvailableDates[0] ?? snapshot.availableDates[0] ?? '');
  const selectedDate = regionAvailableDates.includes(requestedDate)
    ? requestedDate
    : regionAvailableDates[0] ?? snapshot.availableDates[0] ?? '';
  const selectedDateForecasts = readForecastsForDate(snapshot.forecastMatrix, selectedDate);
  const resultItems =
    tool === 'city-finder'
      ? buildCityFinderItems(snapshot.cities, forecastsByCity, weatherFilter)
      : buildWeatherMapItems(snapshot.cities, selectedDateForecasts, selectedDate, weatherFilter.region);
  const regionSummaries =
    tool === 'city-finder'
      ? buildCityFinderRegionSummaries(snapshot.cities, forecastsByCity, weatherFilter, locale)
      : buildWeatherMapRegionSummaries(snapshot.cities, selectedDateForecasts, selectedDate, weatherFilter.region, locale);

  return {
    tool: tool,
    region: weatherFilter.region,
    selectedDate,
    availableDates: snapshot.availableDates,
    regionAvailableDates,
    subRegionOptions: [],
    resultItems,
    regionSummaries,
    selectedCityForecasts: []
  };
}

export function buildCitySearchPayload(snapshot: WeatherDataSnapshot, params: WeatherToolDataParams): WeatherToolPayload {
  return buildWeatherToolPayload(snapshot, 'city-finder', params);
}

export function buildRegionsPayload(snapshot: WeatherDataSnapshot, { locale }: WeatherToolDataParams): RegionsPayload {
  const countryRegionIds = [
    ...new Set(
      snapshot.cities.flatMap((city) =>
        city.countryCode && city.countryTier !== 'C1' ? ([`country:${city.countryCode}`] as RegionKey[]) : []
      )
    )
  ].sort((a, b) => {
    const left = getRegionLabel(getRegionOption(a), locale);
    const right = getRegionLabel(getRegionOption(b), locale);
    return left.localeCompare(right, locale === 'zh' ? 'zh-CN' : 'en-US') || a.localeCompare(b);
  });

  return {
    regions: [
      ...getPrimaryRegionOptions(locale).map((option) => buildRegionOptionDto(snapshot.cities, option.id, locale)),
      ...countryRegionIds.map((regionId) => buildRegionOptionDto(snapshot.cities, regionId, locale))
    ]
  };
}

export function buildSubregionsPayload(
  snapshot: WeatherDataSnapshot,
  { locale, searchParams }: WeatherToolDataParams
): SubregionsPayload {
  const weatherFilter = parseWeatherFilterFromSearch(searchParams);
  const primaryRegion = getPrimaryRegionId(weatherFilter.region);
  const allLabel = locale === 'zh' ? '全部' : 'All';
  return {
    region: primaryRegion,
    subRegions: buildSubRegionOptions(snapshot.cities, primaryRegion, locale, allLabel).map((option) =>
      buildSubRegionOptionDto(snapshot.cities, option, primaryRegion, locale)
    )
  };
}

export function buildWeatherLayerPayload(
  snapshot: WeatherDataSnapshot,
  { locale, searchParams }: WeatherToolDataParams
): WeatherLayerPayload {
  const weatherFilter = parseWeatherFilterFromSearch(searchParams);
  const regionAvailableDates = buildRegionAvailableDates(snapshot.cities, snapshot, weatherFilter.region);
  const requestedDate = readDateFromSearch(searchParams, regionAvailableDates[0] ?? snapshot.availableDates[0] ?? '');
  const selectedDate = regionAvailableDates.includes(requestedDate)
    ? requestedDate
    : regionAvailableDates[0] ?? snapshot.availableDates[0] ?? '';
  const responseDates = searchParams.has('date') ? [selectedDate] : regionAvailableDates.slice(0, 14);

  return {
    tool: 'weather-map',
    region: weatherFilter.region,
    selectedDate,
    layer: readLayerFromSearch(searchParams),
    days: responseDates.map((date) => {
      const forecasts = readForecastsForDate(snapshot.forecastMatrix, date);
      return {
        date,
        resultItems: buildWeatherMapItems(snapshot.cities, forecasts, date, weatherFilter.region),
        regionSummaries: buildWeatherMapRegionSummaries(snapshot.cities, forecasts, date, weatherFilter.region, locale)
      };
    })
  };
}

export function buildMapDatesPayload(
  snapshot: WeatherDataSnapshot,
  { searchParams }: WeatherToolDataParams
): MapDatesPayload {
  const weatherFilter = parseWeatherFilterFromSearch(searchParams);
  const regionAvailableDates = buildRegionAvailableDates(snapshot.cities, snapshot, weatherFilter.region);
  const requestedDate = readDateFromSearch(searchParams, regionAvailableDates[0] ?? snapshot.availableDates[0] ?? '');
  const selectedDate = regionAvailableDates.includes(requestedDate)
    ? requestedDate
    : regionAvailableDates[0] ?? snapshot.availableDates[0] ?? '';

  return {
    tool: 'weather-map',
    region: weatherFilter.region,
    selectedDate,
    availableDates: snapshot.availableDates,
    regionAvailableDates
  };
}

export function buildCityForecastPayload(
  snapshot: WeatherDataSnapshot,
  { searchParams }: WeatherToolDataParams
): CityForecastPayload {
  const cityId = searchParams.get('cityId') ?? null;

  return {
    cityId,
    selectedCityForecasts: cityId ? readCityForecasts(snapshot.forecastMatrix, cityId, 14) : []
  };
}
