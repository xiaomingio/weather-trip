/**
 * 文件说明: 提供天气筛选 Dock 摘要值和地区分组选项的格式化函数。
 * 对应文档: docs/prototypes/weather-filter-interaction/index.html
 */

import type { DisplayLocale } from '@/domain/format';
import type { WeatherRegionOption } from '@/domain/weather-dashboard-shared';

export function regionGroups(options: WeatherRegionOption[]): string[] {
  return Array.from(new Set(options.map((option) => option.group)));
}

function formatCompactNumber(value: number): string {
  if (Math.abs(value) >= 1000) return `${Number((value / 1000).toFixed(1))}k`;
  return String(Math.round(value));
}

export function formatCompactRange(min: number, max: number, unit: string, locale: DisplayLocale): string {
  const separator = locale === 'zh' ? '~' : '-';
  if (Math.round(min) === Math.round(max)) return `${formatCompactNumber(min)}${unit}`;
  return `${formatCompactNumber(min)}${separator}${formatCompactNumber(max)}${unit}`;
}
