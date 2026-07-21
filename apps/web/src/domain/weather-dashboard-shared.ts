/**
 * 文件说明: 定义天气工具页客户端和 API 共享的筛选默认值、URL 序列化和数据响应类型。
 * 对应文档: docs/product-design.md
 */
import type { City, DailyForecast, MapLayer, RegionKey, RegionWeatherSummary, TravelFilter, ViewMode, WeatherType } from 'weather-core/types';
import { getMapRegionLayer, regionOptions } from './regions';
import { allWeatherTypes, elevationFilterBounds } from './weather';

export type DashboardTravelResultItem = {
  mode: 'travel';
  city: City;
  matchDays: number;
  totalDays: number;
  score: number;
  averageTemperatureC: number;
  averagePrecipitationMm: number;
  averageHumidityPercent: number;
  rainDays: number;
  bestStreakDays: number;
  weatherType: WeatherType;
};

export type DashboardDailyResultItem = {
  mode: 'daily';
  city: City;
  forecast: DailyForecast;
  comfortScore: number;
};

export type DashboardResultItem = DashboardTravelResultItem | DashboardDailyResultItem;

export type DashboardSubRegionOption = {
  id: RegionKey;
  label: string;
};

export type WeatherDashboardPayload = {
  mode: ViewMode;
  selectedDate: string;
  availableDates: string[];
  regionAvailableDates: string[];
  subRegionOptions: DashboardSubRegionOption[];
  resultItems: DashboardResultItem[];
  regionSummaries: RegionWeatherSummary[];
  selectedCityForecasts: DailyForecast[];
};

export const defaultTravelFilter: TravelFilter = {
  dateWindowDays: 14,
  useTemperature: true,
  temperatureMinC: 15,
  temperatureMaxC: 30,
  useHumidity: false,
  humidityMinPercent: 40,
  humidityMaxPercent: 70,
  useElevation: false,
  elevationMinMeters: elevationFilterBounds.minMeters,
  elevationMaxMeters: elevationFilterBounds.maxMeters,
  useWeather: true,
  weatherTypes: ['sunny', 'partly_cloudy'],
  region: 'world'
};

const layers: MapLayer[] = ['comfort', 'temperature', 'weather', 'precipitation', 'humidity', 'elevation'];

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
  const admin1Match = /^admin1:([A-Z]{2})\..+$/.exec(region);
  if (admin1Match) return regionOptions.some((option) => option.id === `country:${admin1Match[1]}`);
  return regionOptions.some((option) => option.id === region);
}

export function readLayerFromSearch(search: string | URLSearchParams): MapLayer {
  const layer = searchParamsFrom(search).get('layer');
  return layers.includes(layer as MapLayer) ? (layer as MapLayer) : 'comfort';
}

export function readDateFromSearch(search: string | URLSearchParams, fallbackDate: string): string {
  return searchParamsFrom(search).get('date') ?? fallbackDate;
}

export function parseTravelFilterFromSearch(search: string | URLSearchParams, fallbackRegion?: RegionKey | null): TravelFilter {
  const params = searchParamsFrom(search);
  const nextFilter: TravelFilter = { ...defaultTravelFilter };
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
  mode: ViewMode,
  travelFilter: TravelFilter,
  selectedDate: string,
  layer: MapLayer
): string {
  const params = new URLSearchParams();
  params.set('region', travelFilter.region);

  if (mode === 'daily') {
    if (selectedDate) params.set('date', selectedDate);
    params.set('layer', layer);
    return params.toString();
  }

  params.set('days', String(travelFilter.dateWindowDays));
  params.set('temp', travelFilter.useTemperature ? `${travelFilter.temperatureMinC},${travelFilter.temperatureMaxC}` : 'off');
  params.set('weather', travelFilter.useWeather ? travelFilter.weatherTypes.join(',') : 'off');
  params.set('humidity', travelFilter.useHumidity ? `${travelFilter.humidityMinPercent},${travelFilter.humidityMaxPercent}` : 'off');
  params.set('elevation', travelFilter.useElevation ? `${travelFilter.elevationMinMeters},${travelFilter.elevationMaxMeters}` : 'off');

  return params.toString();
}

export function isDashboardTravelItem(item: DashboardResultItem): item is DashboardTravelResultItem {
  return item.mode === 'travel';
}

export function isDashboardDailyItem(item: DashboardResultItem): item is DashboardDailyResultItem {
  return item.mode === 'daily';
}

export function getPrimaryRegionId(region: RegionKey): RegionKey {
  if (region.startsWith('province:')) return 'country:CN';
  const admin1Match = /^admin1:([A-Z]{2})\./.exec(region);
  if (admin1Match) return `country:${admin1Match[1]}`;
  return region;
}

export function getRegionLayerFromFilter(filter: TravelFilter) {
  return getMapRegionLayer(filter.region);
}
