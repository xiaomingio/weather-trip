/**
 * 文件说明: 封装天气工具 React 组件使用的页面 URL、分页大小和地区偏好同步。
 * 对应文档: docs/plans/free-static-data-plan.md
 */

import type { MapLayer, RegionKey, WeatherFilter, WeatherToolId } from 'weather-core/types';
import type { DisplayLocale } from '@/domain/format';
import { buildToolPath } from '@/domain/navigation';
import { buildFilterSearch, isSupportedRegion, normalizeSelectableRegion } from '@/domain/weather-dashboard-shared';

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

export function readRegionFromSearch(search: string | URLSearchParams): RegionKey | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const requestedRegion = params.get('region');
  if (!requestedRegion) return null;

  const region = normalizeSelectableRegion(requestedRegion as RegionKey);
  return isSupportedRegion(region) ? region : null;
}

export function saveSearchRegion(search: string | URLSearchParams): void {
  const region = readRegionFromSearch(search);
  if (region) saveRegion(region);
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
  const nextUrl = `${buildToolPath(locale, tool)}${search ? `?${search}` : ''}${url.hash}`;
  if (`${url.pathname}${url.search}${url.hash}` === nextUrl) return;

  window.history.replaceState(null, '', nextUrl);
}
