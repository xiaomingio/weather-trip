/**
 * 文件说明: 生成 WorldWeatherMap 图例说明和颜色刻度。
 * 对应文档: docs/product-design.md
 */

import type { MapLayer, WeatherToolId } from 'weather-core/types';
import type { DisplayLocale } from '@/domain/format';
import { getMessages, type WeatherMapLegendKey } from '@/i18n';
import { elevationGradient, precipitationColor, weatherColor, windGradient } from './mapColors';
import type { LegendScale } from './types';

function legendLabels(key: WeatherMapLegendKey, locale: DisplayLocale): [string, string, string] {
  const labels = getMessages(locale).weatherMap.legend[key];

  return [labels.low, labels.mid, labels.high];
}

export function legendScale(tool: WeatherToolId, layer: MapLayer, locale: DisplayLocale): LegendScale {
  if (tool === 'city-finder' && layer === 'comfort') {
    return {
      gradient: 'linear-gradient(90deg, #c35b4b 0%, #d0a02f 50%, #2fa36b 100%)',
      labels: legendLabels('match', locale)
    };
  }

  if (layer === 'temperature') {
    return {
      gradient: 'linear-gradient(90deg, #6ca6ff 0%, #48b7c7 25%, #51b778 50%, #e5aa31 75%, #d86449 100%)',
      labels: legendLabels('temperature', locale)
    };
  }

  if (layer === 'humidity') {
    return {
      gradient: 'linear-gradient(90deg, #c99a45 0%, #4f9d86 45%, #3f88c5 75%, #7568a8 100%)',
      labels: legendLabels('humidity', locale)
    };
  }

  if (layer === 'precipitation') {
    return {
      gradient: `linear-gradient(90deg, ${precipitationColor(0)} 0%, ${precipitationColor(12)} 55%, ${precipitationColor(
        24
      )} 100%)`,
      labels: legendLabels('precipitation', locale)
    };
  }

  if (layer === 'wind') {
    return {
      gradient: windGradient(),
      labels: legendLabels('wind', locale)
    };
  }

  if (layer === 'elevation') {
    return {
      gradient: elevationGradient(),
      labels: legendLabels('elevation', locale)
    };
  }

  if (layer === 'weather') {
    return {
      gradient: `linear-gradient(90deg, ${weatherColor('sunny')} 0%, ${weatherColor('cloudy')} 34%, ${weatherColor(
        'overcast'
      )} 52%, ${weatherColor('rain')} 76%, ${weatherColor('snow')} 100%)`,
      labels: legendLabels('weather', locale)
    };
  }

  return {
    gradient: 'linear-gradient(90deg, #c35b4b 0%, #d0a02f 50%, #2fa36b 100%)',
    labels: legendLabels('comfort', locale)
  };
}
