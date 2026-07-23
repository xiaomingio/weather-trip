/**
 * 文件说明: 定义 WorldWeatherMap 组件及其私有地图渲染模块共享的类型。
 * 对应文档: docs/product-design.md
 */

import type { MapLayer, RegionKey, RegionWeatherSummary, WeatherToolId } from 'weather-core/types';
import type { DisplayLocale, TemperatureUnit } from '@/domain/format';
import type { MapRegionLayer } from '@/domain/regions';
import type { DashboardResultItem } from '@/domain/weather-dashboard-shared';

export type MapPoint = {
  cityId: string;
  label: string;
  longitude: number;
  latitude: number;
  markerText: string;
  markerIcon: string;
  color: string;
  opacity: number;
  size: number;
  sortValue: number;
  prominence: number;
  selected: boolean;
};

export type WorldWeatherMapProps = {
  tool: WeatherToolId;
  locale: DisplayLocale;
  layer: MapLayer;
  resultItems: DashboardResultItem[];
  regionSummaries: RegionWeatherSummary[];
  dataRegion: RegionKey | null;
  temperatureUnit: TemperatureUnit;
  activeRegion: RegionKey;
  selectedCityId: string | null;
  onSelectCity: (cityId: string) => void;
  statusLabel?: string | null;
  statusKind?: 'loading' | 'empty';
  isRefreshing?: boolean;
  refreshLabel?: string;
};

export type MapGeoJson = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: MapGeoJsonGeometry;
  }>;
};

export type MapGeoJsonGeometry = {
  type: string;
  coordinates?: unknown;
};

export type LegendScale = {
  gradient: string;
  labels: [string, string, string];
};

export type BoundsPoint = [number, number];

export type RegionGeojsonAsset = {
  key: string;
  url: string;
  layer: MapRegionLayer;
};

export type MarkerMetric = {
  markerText: string;
  markerIcon: string;
  color: string;
  sortValue: number;
};

export type MarkerViewport = {
  zoom: number;
  width: number;
  height: number;
};

export type MapPointGeoJson = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: {
      cityId: string;
      label: string;
      markerText: string;
      markerIcon: string;
      color: string;
      opacity: number;
      size: number;
      sortKey: number;
      selected: boolean;
      isZero: boolean;
    };
    geometry: {
      type: 'Point';
      coordinates: [number, number];
    };
  }>;
};
