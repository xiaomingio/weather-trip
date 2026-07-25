/**
 * 文件说明: 定义天气筛选 Dock 组件之间共享的 Props 和筛选键类型。
 * 对应文档: docs/prototypes/weather-filter-interaction/index.html
 */

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { MapLayer, RegionKey, WeatherFilter } from 'weather-core/types';
import type { DisplayLocale, TemperatureUnit } from '@/domain/format';
import type { WeatherRegionOption } from '@/domain/weather-dashboard-shared';

export type FilterKey =
  | 'temperature'
  | 'weather'
  | 'humidity'
  | 'precipitation'
  | 'wind'
  | 'elevation'
  | 'date'
  | 'layer';

export type CityFinderFilterDockProps = {
  locale: DisplayLocale;
  temperatureUnit: TemperatureUnit;
  weatherFilter: WeatherFilter;
  setWeatherFilter: Dispatch<SetStateAction<WeatherFilter>>;
  primaryRegion: RegionKey;
  currentRegion: RegionKey;
  primaryRegionOptions: WeatherRegionOption[];
  subRegionOptions: WeatherRegionOption[];
  canSelectSubRegion: boolean;
  selectedWeatherSummary: string;
  onPrimaryRegionChange: (region: RegionKey) => void;
  onSubRegionChange: (region: RegionKey) => void;
};

export type WeatherMapFilterDockProps = {
  locale: DisplayLocale;
  primaryRegion: RegionKey;
  currentRegion: RegionKey;
  primaryRegionOptions: WeatherRegionOption[];
  subRegionOptions: WeatherRegionOption[];
  canSelectSubRegion: boolean;
  selectedDate: string;
  selectedDateIndex: number;
  regionAvailableDates: string[];
  layer: MapLayer;
  layers: Array<{ id: MapLayer; labels: Record<DisplayLocale, string> }>;
  onPrimaryRegionChange: (region: RegionKey) => void;
  onSubRegionChange: (region: RegionKey) => void;
  onDateChange: (date: string) => void;
  onLayerChange: (layer: MapLayer) => void;
};

export type RegionFieldsProps = {
  locale: DisplayLocale;
  primaryRegion: RegionKey;
  currentRegion: RegionKey;
  primaryRegionOptions: WeatherRegionOption[];
  subRegionOptions: WeatherRegionOption[];
  canSelectSubRegion: boolean;
  onPrimaryRegionChange: (region: RegionKey) => void;
  onSubRegionChange: (region: RegionKey) => void;
};

export type FilterDockProps = {
  children: ReactNode;
  presets?: ReactNode;
  presetToggleLabels?: {
    expand: string;
    collapse: string;
  };
  variant?: 'city-finder' | 'weather-map';
};

export type FilterPopoverCardProps = {
  filterKey: FilterKey;
  activeKey: FilterKey | null;
  label: string;
  value: string;
  icon: ReactNode;
  children: ReactNode;
  onOpen: (key: FilterKey) => void;
  onClose: (key?: FilterKey) => void;
};
