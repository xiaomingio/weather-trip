/**
 * 文件说明: 定义天气工具页客户端和 API 共享的筛选默认值、URL 序列化和数据响应类型。
 * 对应文档: docs/product-design.md
 */
import type { City, DailyForecast, MapLayer, RegionKey, RegionWeatherSummary, WeatherFilter, WeatherToolId, WeatherType } from 'weather-core/types';
import { getMapRegionLayer, regionOptions } from './regions';
import { allWeatherTypes, elevationFilterBounds, precipitationFilterBounds, windSpeedFilterBounds } from './weather';

export type DashboardCityFinderResultItem = {
  tool: 'city-finder';
  city: City;
  matchDays: number;
  totalDays: number;
  score: number;
  averageTemperatureC: number;
  averagePrecipitationMm: number;
  averageHumidityPercent: number;
  averageWindSpeedKmh: number;
  rainDays: number;
  bestStreakDays: number;
  weatherType: WeatherType;
};

export type DashboardWeatherMapResultItem = {
  tool: 'weather-map';
  city: City;
  forecast: DailyForecast;
  comfortScore: number;
};

export type DashboardResultItem = DashboardCityFinderResultItem | DashboardWeatherMapResultItem;

export type DashboardSubRegionOption = {
  id: RegionKey;
  label: string;
};

export type MapBounds = [west: number, south: number, east: number, north: number];

export type WeatherRegionOption = {
  id: RegionKey;
  label: string;
  group: string;
  mapLayer: 'country' | 'partition';
  bounds: MapBounds | null;
};

export type RegionsPayload = {
  regions: WeatherRegionOption[];
};

export type SubregionsPayload = {
  region: RegionKey;
  subRegions: WeatherRegionOption[];
};

export type WeatherToolPayload = {
  tool: WeatherToolId;
  region: RegionKey;
  selectedDate: string;
  availableDates: string[];
  regionAvailableDates: string[];
  subRegionOptions: DashboardSubRegionOption[];
  resultItems: DashboardResultItem[];
  regionSummaries: RegionWeatherSummary[];
  selectedCityForecasts: DailyForecast[];
};

export type WeatherLayerDateData = {
  date: string;
  resultItems: DashboardWeatherMapResultItem[];
  regionSummaries: RegionWeatherSummary[];
};

export type WeatherLayerPayload = Pick<WeatherToolPayload, 'tool' | 'region' | 'selectedDate'> & {
  layer: MapLayer;
  days: WeatherLayerDateData[];
};

export type MapDatesPayload = Pick<WeatherToolPayload, 'tool' | 'region' | 'selectedDate' | 'availableDates' | 'regionAvailableDates'>;

export type CityForecastPayload = {
  cityId: string | null;
  selectedCityForecasts: DailyForecast[];
};

export const defaultWeatherFilter: WeatherFilter = {
  dateWindowDays: 14,
  useTemperature: true,
  temperatureMinC: 15,
  temperatureMaxC: 30,
  useHumidity: false,
  humidityMinPercent: 40,
  humidityMaxPercent: 70,
  usePrecipitation: false,
  precipitationMinMm: precipitationFilterBounds.minMm,
  precipitationMaxMm: 5,
  useWind: false,
  windSpeedMinKmh: windSpeedFilterBounds.minKmh,
  windSpeedMaxKmh: 30,
  useElevation: false,
  elevationMinMeters: elevationFilterBounds.minMeters,
  elevationMaxMeters: elevationFilterBounds.maxMeters,
  useWeather: true,
  weatherTypes: ['sunny', 'partly_cloudy'],
  region: 'world'
};

const layers: MapLayer[] = ['weather', 'temperature', 'humidity', 'precipitation', 'wind', 'elevation', 'comfort'];

function parseNumberRange(value: string | null): [number, number] | null {
  if (!value || value === 'off') return null;
  const [minValue, maxValue] = value.split(',').map(Number);
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return null;
  return [minValue, maxValue];
}

function searchParamsFrom(search: string | URLSearchParams): URLSearchParams {
  return typeof search === 'string' ? new URLSearchParams(search) : search;
}

export function isSupportedRegion(region: RegionKey): boolean {
  const partitionMatch = /^partition:([A-Z]{2})\..+$/.exec(region);
  if (partitionMatch) return regionOptions.some((option) => option.id === `country:${partitionMatch[1]}`);
  return regionOptions.some((option) => option.id === region);
}

export function readLayerFromSearch(search: string | URLSearchParams): MapLayer {
  const layer = searchParamsFrom(search).get('layer');
  return layers.includes(layer as MapLayer) ? (layer as MapLayer) : 'weather';
}

export function isSupportedMapLayer(layer: string | undefined): layer is MapLayer {
  return Boolean(layer && layers.includes(layer as MapLayer));
}

export function readDateFromSearch(search: string | URLSearchParams, fallbackDate: string): string {
  return searchParamsFrom(search).get('date') ?? fallbackDate;
}

export function parseWeatherFilterFromSearch(search: string | URLSearchParams, fallbackRegion?: RegionKey | null): WeatherFilter {
  const params = searchParamsFrom(search);
  const nextFilter: WeatherFilter = { ...defaultWeatherFilter };
  const region = params.get('region');
  if (region && isSupportedRegion(region)) {
    nextFilter.region = region;
  } else if (fallbackRegion && isSupportedRegion(fallbackRegion)) {
    nextFilter.region = fallbackRegion;
  }

  const days = Number(params.get('days'));
  if ([3, 5, 7, 10, 14].includes(days)) nextFilter.dateWindowDays = days;

  const temperature = params.get('temp');
  if (temperature === 'off') {
    nextFilter.useTemperature = false;
  } else {
    const range = parseNumberRange(temperature);
    if (range) {
      nextFilter.useTemperature = true;
      [nextFilter.temperatureMinC, nextFilter.temperatureMaxC] = range;
    }
  }

  const humidity = params.get('humidity');
  if (humidity === 'off') {
    nextFilter.useHumidity = false;
  } else {
    const range = parseNumberRange(humidity);
    if (range) {
      nextFilter.useHumidity = true;
      [nextFilter.humidityMinPercent, nextFilter.humidityMaxPercent] = range;
    }
  }

  const precipitation = params.get('precipitation');
  if (precipitation === 'off') {
    nextFilter.usePrecipitation = false;
  } else {
    const range = parseNumberRange(precipitation);
    if (range) {
      nextFilter.usePrecipitation = true;
      [nextFilter.precipitationMinMm, nextFilter.precipitationMaxMm] = range;
    }
  }

  const wind = params.get('wind');
  if (wind === 'off') {
    nextFilter.useWind = false;
  } else {
    const range = parseNumberRange(wind);
    if (range) {
      nextFilter.useWind = true;
      [nextFilter.windSpeedMinKmh, nextFilter.windSpeedMaxKmh] = range;
    }
  }

  const elevation = params.get('elevation');
  if (elevation === 'off') {
    nextFilter.useElevation = false;
  } else {
    const range = parseNumberRange(elevation);
    if (range) {
      nextFilter.useElevation = true;
      [nextFilter.elevationMinMeters, nextFilter.elevationMaxMeters] = range;
    }
  }

  const weather = params.get('weather');
  if (weather === 'off') {
    nextFilter.useWeather = false;
  } else if (weather) {
    const weatherTypes = weather
      .split(',')
      .filter((type): type is WeatherType => allWeatherTypes.includes(type as WeatherType));
    if (weatherTypes.length > 0) {
      nextFilter.useWeather = true;
      nextFilter.weatherTypes = weatherTypes;
    }
  }

  return nextFilter;
}

export function buildFilterSearch(
  tool: WeatherToolId,
  weatherFilter: WeatherFilter,
  selectedDate: string,
  layer: MapLayer
): string {
  const params = new URLSearchParams();
  params.set('region', weatherFilter.region);

  if (tool === 'weather-map') {
    if (selectedDate) params.set('date', selectedDate);
    params.set('layer', layer);
    return params.toString();
  }

  params.set('days', String(weatherFilter.dateWindowDays));
  params.set('temp', weatherFilter.useTemperature ? `${weatherFilter.temperatureMinC},${weatherFilter.temperatureMaxC}` : 'off');
  params.set('weather', weatherFilter.useWeather ? weatherFilter.weatherTypes.join(',') : 'off');
  params.set('humidity', weatherFilter.useHumidity ? `${weatherFilter.humidityMinPercent},${weatherFilter.humidityMaxPercent}` : 'off');
  params.set('precipitation', weatherFilter.usePrecipitation ? `${weatherFilter.precipitationMinMm},${weatherFilter.precipitationMaxMm}` : 'off');
  params.set('wind', weatherFilter.useWind ? `${weatherFilter.windSpeedMinKmh},${weatherFilter.windSpeedMaxKmh}` : 'off');
  params.set('elevation', weatherFilter.useElevation ? `${weatherFilter.elevationMinMeters},${weatherFilter.elevationMaxMeters}` : 'off');

  return params.toString();
}

export function isDashboardCityFinderItem(item: DashboardResultItem): item is DashboardCityFinderResultItem {
  return item.tool === 'city-finder';
}

export function isDashboardWeatherMapItem(item: DashboardResultItem): item is DashboardWeatherMapResultItem {
  return item.tool === 'weather-map';
}

export function getPrimaryRegionId(region: RegionKey): RegionKey {
  const partitionMatch = /^partition:([A-Z]{2})\./.exec(region);
  if (partitionMatch) return `country:${partitionMatch[1]}`;
  return region;
}

export function getRegionLayerFromFilter(filter: WeatherFilter) {
  return getMapRegionLayer(filter.region);
}
