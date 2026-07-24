/**
 * 文件说明: 定义 Weather Map 页面可切换的地图图层及其展示文案。
 * 对应文档: docs/product-design.md
 */

import type { MapLayer } from 'weather-core/types';
import type { DisplayLocale } from '@/domain/format';
import { messages } from '@/i18n';

const weatherMapLayerIds = ['weather', 'temperature', 'humidity', 'precipitation', 'wind', 'elevation', 'comfort'] satisfies MapLayer[];

export const weatherMapLayers: { id: MapLayer; labels: Record<DisplayLocale, string> }[] = weatherMapLayerIds.map((id) => ({
  id,
  labels: {
    zh: messages.zh.weatherMap.layer[id],
    en: messages.en.weatherMap.layer[id]
  }
}));
