/**
 * 文件说明: 定义天气工具结果列表默认选中城市的排序和选择规则。
 * 对应文档: docs/product-design.md
 */

import type { DisplayLocale } from '@/domain/format';
import { formatCityName } from '@/domain/format';
import type { DashboardResultItem } from '@/domain/weather-dashboard-shared';

function compareDefaultSelectedCity(left: DashboardResultItem, right: DashboardResultItem, locale: DisplayLocale): number {
  const rankComparison = (left.city.rank ?? Number.MAX_SAFE_INTEGER) - (right.city.rank ?? Number.MAX_SAFE_INTEGER);
  if (rankComparison !== 0) return rankComparison;
  return formatCityName(left.city, locale).localeCompare(formatCityName(right.city, locale), locale === 'zh' ? 'zh-CN' : 'en-US');
}

export function findDefaultSelectedResultItem(items: DashboardResultItem[], locale: DisplayLocale): DashboardResultItem | undefined {
  return items.reduce<DashboardResultItem | undefined>((current, item) => {
    if (!current) return item;
    return compareDefaultSelectedCity(item, current, locale) < 0 ? item : current;
  }, undefined);
}
