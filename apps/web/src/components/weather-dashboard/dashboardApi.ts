/**
 * 文件说明: 封装天气工具 React 组件使用的页面 URL、分页大小和工具状态本地保存。
 * 对应文档: docs/specs/20-interaction-logic.md
 */

import type { MapLayer, WeatherFilter, WeatherToolId } from 'weather-core/types';
import type { DisplayLocale } from '@/domain/format';
import { buildToolPath } from '@/domain/navigation';
import { buildFilterSearch } from '@/domain/weather-dashboard-shared';

export const resultPageSize = 50;

export function readSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

function toolStateStorageKey(tool: WeatherToolId): string {
  return `weather-trip-${tool}-state`;
}

export function readSavedToolSearch(tool: WeatherToolId): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(toolStateStorageKey(tool)) ?? '';
}

export function readInitialToolSearch(tool: WeatherToolId, fallbackSearch: string): { search: string; restoredFromStorage: boolean } {
  const urlSearch = readSearch() || fallbackSearch;
  if (urlSearch) return { search: urlSearch, restoredFromStorage: false };

  const savedSearch = readSavedToolSearch(tool);
  return { search: savedSearch, restoredFromStorage: Boolean(savedSearch) };
}

export function saveToolSearch(tool: WeatherToolId, search: string): void {
  if (typeof window === 'undefined') return;
  const normalizedSearch = search.startsWith('?') ? search.slice(1) : search;
  window.localStorage.setItem(toolStateStorageKey(tool), normalizedSearch);
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
  saveToolSearch(tool, search);
  const nextUrl = `${buildToolPath(locale, tool)}${search ? `?${search}` : ''}${url.hash}`;
  if (`${url.pathname}${url.search}${url.hash}` === nextUrl) return;

  window.history.replaceState(null, '', nextUrl);
}
