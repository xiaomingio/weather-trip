/**
 * 文件说明: 封装天气工具 React 组件使用的 URL、API 地址和跨 Tab 查询记忆。
 * 对应文档: docs/data-flow.md
 */

import type { MapLayer, RegionKey, WeatherFilter, WeatherToolId } from 'weather-core/types';
import type { DisplayLocale } from '@/domain/format';
import { buildToolPath, buildTopTabPath, getToolPathSegment } from '@/domain/navigation';
import { buildFilterSearch, isSupportedRegion } from '@/domain/weather-dashboard-shared';

const regionStorageKey = 'weather-trip-region';

export const resultPageSize = 50;

export function readSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

export function readSavedRegion(): RegionKey | null {
  if (typeof window === 'undefined') return null;
  const region = window.localStorage.getItem(regionStorageKey);
  return region && isSupportedRegion(region) ? region : null;
}

export function saveRegion(region: RegionKey): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(regionStorageKey, region);
}

const toolQueryStorageKey = (tool: WeatherToolId) => `weather-trip-query-${getToolPathSegment(tool)}`;

export function saveToolQuery(tool: WeatherToolId, search: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(toolQueryStorageKey(tool), search);
}

export function readSavedToolQuery(tool: WeatherToolId): string {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(toolQueryStorageKey(tool)) ?? '';
}

export function buildToolUrl(
  locale: DisplayLocale,
  tool: WeatherToolId,
  weatherFilter: WeatherFilter,
  selectedDate: string,
  layer: MapLayer
): string {
  const search = buildFilterSearch(tool, weatherFilter, selectedDate, layer);
  return `${buildToolPath(locale, tool)}${search ? `?${search}` : ''}`;
}

function buildToolTabUrl(locale: DisplayLocale, targetTool: WeatherToolId, activeTool: WeatherToolId): string {
  if (targetTool === activeTool) {
    if (typeof window === 'undefined') return buildToolPath(locale, targetTool);
    return `${window.location.pathname}${window.location.search}`;
  }

  const saved = readSavedToolQuery(targetTool);
  return `${buildToolPath(locale, targetTool)}${saved ? `?${saved}` : ''}`;
}

export function replaceToolUrl(
  locale: DisplayLocale,
  tool: WeatherToolId,
  weatherFilter: WeatherFilter,
  selectedDate: string,
  layer: MapLayer
): void {
  const url = new URL(window.location.href);
  const search = buildFilterSearch(tool, weatherFilter, selectedDate, layer);
  saveToolQuery(tool, search);
  const nextUrl = `${buildToolPath(locale, tool)}${search ? `?${search}` : ''}${url.hash}`;
  if (`${url.pathname}${url.search}${url.hash}` === nextUrl) return;

  window.history.replaceState(null, '', nextUrl);
}

export function syncToolNavigationLinks(
  locale: DisplayLocale,
  otherLocale: DisplayLocale,
  activeTool: WeatherToolId,
  weatherFilter: WeatherFilter,
  selectedDate: string,
  layer: MapLayer
): void {
  const localeLink = document.querySelector<HTMLAnchorElement>('[data-dashboard-locale-link]');
  if (localeLink) localeLink.href = buildToolUrl(otherLocale, activeTool, weatherFilter, selectedDate, layer);

  const activeTabId = getToolPathSegment(activeTool);
  for (const tabLink of document.querySelectorAll<HTMLAnchorElement>('[data-top-tab-id]')) {
    const tabId = tabLink.dataset.topTabId;
    tabLink.classList.toggle('is-active', tabId === activeTabId);
    if (tabId === 'landing') {
      tabLink.href = buildTopTabPath(locale, 'landing');
    } else if (tabId === 'weather-map') {
      tabLink.href = buildToolTabUrl(locale, 'weather-map', activeTool);
    } else if (tabId === 'city-finder') {
      tabLink.href = buildToolTabUrl(locale, 'city-finder', activeTool);
    }
  }
}

export function buildCityFinderApiUrl(locale: DisplayLocale, weatherFilter: WeatherFilter): string {
  const params = new URLSearchParams(buildFilterSearch('city-finder', weatherFilter, '', 'weather'));
  params.set('locale', locale);
  return `/api/city-search.json?${params.toString()}`;
}

export function buildMapDatesApiUrl(locale: DisplayLocale, weatherFilter: WeatherFilter, selectedDate: string): string {
  const params = new URLSearchParams();
  params.set('locale', locale);
  params.set('region', weatherFilter.region);
  if (selectedDate) params.set('date', selectedDate);
  return `/api/map-dates.json?${params.toString()}`;
}

export function buildWeatherLayerApiUrl(
  locale: DisplayLocale,
  weatherFilter: WeatherFilter,
  selectedDate: string,
  layer: MapLayer,
  includeDate: boolean
): string {
  const params = new URLSearchParams();
  params.set('locale', locale);
  params.set('region', weatherFilter.region);
  if (includeDate && selectedDate) params.set('date', selectedDate);
  return `/api/weather-layers/${layer}.json?${params.toString()}`;
}

export function buildCityForecastApiUrl(locale: DisplayLocale, cityId: string): string {
  const params = new URLSearchParams();
  params.set('locale', locale);
  params.set('cityId', cityId);
  return `/api/city-forecast.json?${params.toString()}`;
}

export function buildRegionsApiUrl(locale: DisplayLocale): string {
  const params = new URLSearchParams();
  params.set('locale', locale);
  return `/api/regions.json?${params.toString()}`;
}

export function buildSubregionsApiUrl(locale: DisplayLocale, region: RegionKey): string {
  const params = new URLSearchParams();
  params.set('locale', locale);
  params.set('region', region);
  return `/api/subregions.json?${params.toString()}`;
}
