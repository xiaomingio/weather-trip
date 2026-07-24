/**
 * 文件说明: 统一定义公开站点顶层 Tab 和两个天气工具页面的路径映射。
 * 对应文档: docs/product-design.md
 */

import type { WeatherToolId } from 'weather-core/types';
import { getTopTabLabels } from '@/i18n';
import type { DisplayLocale } from './format';

export type TopTabId = 'landing' | 'weather-map' | 'city-finder';

export type TopTab = {
  id: TopTabId;
  labels: Record<DisplayLocale, string>;
};

export const topTabs: TopTab[] = [
  { id: 'landing', labels: getTopTabLabels('landing') },
  { id: 'weather-map', labels: getTopTabLabels('weather-map') },
  { id: 'city-finder', labels: getTopTabLabels('city-finder') }
];

export function buildLandingPath(locale: DisplayLocale): string {
  return locale === 'zh' ? '/zh' : '/';
}

export function getToolPathSegment(tool: WeatherToolId): Exclude<TopTabId, 'landing'> {
  return tool;
}

export function buildTopTabPath(locale: DisplayLocale, tabId: TopTabId): string {
  if (tabId === 'landing') return buildLandingPath(locale);
  return `${locale === 'zh' ? '/zh' : ''}/${tabId}`;
}

export function buildToolPath(locale: DisplayLocale, tool: WeatherToolId): string {
  return buildTopTabPath(locale, getToolPathSegment(tool));
}
