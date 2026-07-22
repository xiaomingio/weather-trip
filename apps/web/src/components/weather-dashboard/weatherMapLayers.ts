/**
 * 文件说明: 定义 Weather Map 页面可切换的地图图层及其展示文案。
 * 对应文档: docs/product-design.md
 */

import type { MapLayer } from 'weather-core/types';
import type { DisplayLocale } from '@/domain/format';

export const weatherMapLayers: { id: MapLayer; labels: Record<DisplayLocale, string> }[] = [
  { id: 'weather', labels: { zh: '天气', en: 'Weather' } },
  { id: 'temperature', labels: { zh: '气温', en: 'Temperature' } },
  { id: 'humidity', labels: { zh: '湿度', en: 'Humidity' } },
  { id: 'precipitation', labels: { zh: '降水', en: 'Rainfall' } },
  { id: 'wind', labels: { zh: '风速', en: 'Wind' } },
  { id: 'elevation', labels: { zh: '海拔', en: 'Elevation' } },
  { id: 'comfort', labels: { zh: '舒适度', en: 'Comfort' } }
];
