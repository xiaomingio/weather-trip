/**
 * 文件说明: 定义 Weather Map 结果列表排序选项、默认方向和排序实现。
 * 对应文档: docs/product-design.md
 */

import type { WeatherType } from 'weather-core/types';
import type { DisplayLocale } from '@/domain/format';
import { formatCityName } from '@/domain/format';
import type { DashboardWeatherMapResultItem } from '@/domain/weather-dashboard-shared';
import type { SortDirection, WeatherMapSortKey, WeatherMapSortOption } from './types';
import { weatherMapLayers } from './weatherMapLayers';

export const weatherMapSortOptions: WeatherMapSortOption[] = [
  { id: 'population', labels: { zh: '人口', en: 'Population' } },
  ...weatherMapLayers
];

export const weatherMapSortDirections: Record<WeatherMapSortKey, SortDirection> = {
  population: 'desc',
  weather: 'asc',
  temperature: 'desc',
  humidity: 'asc',
  precipitation: 'asc',
  wind: 'asc',
  elevation: 'asc',
  comfort: 'desc'
};

const weatherSortRank: Record<WeatherType, number> = {
  sunny: 0,
  partly_cloudy: 1,
  cloudy: 2,
  overcast: 3,
  fog: 4,
  light_rain: 5,
  rain: 6,
  thunderstorm: 7,
  light_snow: 8,
  snow: 9
};

function weatherMapSortValue(item: DashboardWeatherMapResultItem, sortKey: WeatherMapSortKey): number {
  if (sortKey === 'population') return item.city.population ?? 0;
  if (sortKey === 'weather') return weatherSortRank[item.forecast.weatherType];
  if (sortKey === 'temperature') return item.forecast.temperatureMeanC;
  if (sortKey === 'humidity') return item.forecast.humidityMeanPercent;
  if (sortKey === 'precipitation') return item.forecast.precipitationSumMm;
  if (sortKey === 'wind') return item.forecast.windSpeedMaxKmh ?? 0;
  if (sortKey === 'elevation') return item.city.elevationMeters;
  return item.comfortScore;
}

export function sortWeatherMapItems(
  items: DashboardWeatherMapResultItem[],
  sortKey: WeatherMapSortKey,
  direction: SortDirection,
  locale: DisplayLocale
): DashboardWeatherMapResultItem[] {
  return [...items].sort((left, right) => {
    const leftValue = weatherMapSortValue(left, sortKey);
    const rightValue = weatherMapSortValue(right, sortKey);

    if (rightValue !== leftValue) return direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;

    const populationComparison = (right.city.population ?? 0) - (left.city.population ?? 0);
    if (populationComparison !== 0) return populationComparison;
    return formatCityName(left.city, locale).localeCompare(formatCityName(right.city, locale), locale === 'zh' ? 'zh-CN' : 'en-US');
  });
}
