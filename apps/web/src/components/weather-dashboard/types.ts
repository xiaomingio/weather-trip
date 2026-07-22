/**
 * 文件说明: 定义天气工具页 React 面板组件之间共享的展示类型。
 * 对应文档: docs/tool-responsive-layout.md
 */

import type { MapLayer } from 'weather-core/types';
import type { DisplayLocale } from '@/domain/format';

export type WeatherMapSortKey = MapLayer | 'population';
export type SortDirection = 'asc' | 'desc';

export type WeatherMapSortOption = {
  id: WeatherMapSortKey;
  labels: Record<DisplayLocale, string>;
};

export type DashboardPanelCopy = {
  resultPanel: string;
  forecastPanel: string;
  coverageRegions: string;
  coverageCities: string;
  citySamples: string;
  highMatchCities: string;
  citySearch: string;
  citySearchPlaceholder: string;
  noCityMatches: string;
  loadingWeatherData: string;
  noForecastData: string;
  sort: string;
  sortAscending: string;
  sortDescending: string;
  suitableDays: (match: number, total: number) => string;
  average: string;
  forecastHumidity: string;
  forecastPrecipitation: string;
  forecastPrecipitationProbability: string;
  forecastWind: string;
};
