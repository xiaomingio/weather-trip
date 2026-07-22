/**
 * 文件说明: 生成 WorldWeatherMap 图例说明和颜色刻度。
 * 对应文档: docs/product-design.md
 */

import type { MapLayer, WeatherToolId } from 'weather-core/types';
import type { DisplayLocale } from '@/domain/format';
import type { MapRegionLayer } from '@/domain/regions';
import { elevationGradient } from './mapColors';
import type { LegendScale } from './types';

export function legendDescription(tool: WeatherToolId, layer: MapLayer, regionLayer: MapRegionLayer, locale: DisplayLocale): string {
  const areaName =
    regionLayer === 'country'
      ? { zh: '国家/地区', en: 'country' }
      : { zh: '地图分块', en: 'map region' };

  if (locale === 'en') {
    if (layer === 'elevation') return `${areaName.en} areas are colored by sampled elevation; city markers keep temperature context.`;
    if (layer === 'humidity') return 'Color shows mean RH; green is the comfortable range.';
    if (layer === 'wind') return 'Color shows max wind speed; darker purple means windier conditions.';
    if (tool === 'city-finder' && layer === 'comfort') return 'Color follows the current min/max matching-day distribution.';
    return `${areaName.en} areas show the selected layer; city markers remain sample points.`;
  }

  if (layer === 'elevation') return `${areaName.zh}按海拔样本分层着色，城市点位保留温度`;
  if (layer === 'humidity') return '颜色显示日均相对湿度，绿色约为舒适湿度';
  if (layer === 'wind') return '颜色显示最大风速，越偏紫表示风越大';
  if (tool === 'city-finder' && layer === 'comfort') return '颜色按当前结果的最小/最大匹配天数分布';
  return `${areaName.zh}显示当前图层主指标，城市点位是样本`;
}

export function legendScale(tool: WeatherToolId, layer: MapLayer, locale: DisplayLocale): LegendScale {
  if (tool === 'city-finder' && layer === 'comfort') {
    return {
      gradient: 'linear-gradient(90deg, #c35b4b 0%, #d0a02f 50%, #2fa36b 100%)',
      labels: locale === 'zh' ? ['少', '中', '多'] : ['Low', 'Mid', 'High']
    };
  }

  if (layer === 'temperature') {
    return {
      gradient: 'linear-gradient(90deg, #6ca6ff 0%, #48b7c7 25%, #51b778 50%, #e5aa31 75%, #d86449 100%)',
      labels: locale === 'zh' ? ['冷', '舒适', '热'] : ['Cold', 'Mild', 'Hot']
    };
  }

  if (layer === 'humidity') {
    return {
      gradient: 'linear-gradient(90deg, #c99a45 0%, #4f9d86 45%, #3f88c5 75%, #7568a8 100%)',
      labels: locale === 'zh' ? ['干', '舒适', '潮湿'] : ['Dry', 'Mild', 'Humid']
    };
  }

  if (layer === 'precipitation') {
    return {
      gradient: 'linear-gradient(90deg, rgba(43, 116, 181, 0.25) 0%, rgba(43, 116, 181, 0.6) 55%, rgba(43, 116, 181, 1) 100%)',
      labels: locale === 'zh' ? ['少', '中', '多'] : ['Low', 'Mid', 'High']
    };
  }

  if (layer === 'wind') {
    return {
      gradient: 'linear-gradient(90deg, #59a8b2 0%, #7487aa 55%, #79629d 100%)',
      labels: locale === 'zh' ? ['小', '中', '大'] : ['Light', 'Mid', 'Strong']
    };
  }

  if (layer === 'elevation') {
    return {
      gradient: elevationGradient(),
      labels: locale === 'zh' ? ['低', '中', '高'] : ['Low', 'Mid', 'High']
    };
  }

  if (layer === 'weather') {
    return {
      gradient: 'linear-gradient(90deg, #e6ae2f 0%, #6d7f68 45%, #3f88c5 75%, #8fb8d8 100%)',
      labels: locale === 'zh' ? ['晴', '阴', '雨雪'] : ['Sun', 'Cloud', 'Rain/snow']
    };
  }

  return {
    gradient: 'linear-gradient(90deg, #c35b4b 0%, #d0a02f 50%, #2fa36b 100%)',
    labels: locale === 'zh' ? ['低', '中', '高'] : ['Low', 'Mid', 'High']
  };
}
