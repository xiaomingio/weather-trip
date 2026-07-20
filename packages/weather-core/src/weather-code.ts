/**
 * 文件说明: 将 Open-Meteo / WMO weather code 映射为产品内部稳定天气类型。
 * 参考资料: https://open-meteo.com/en/docs
 * 对应文档: docs/data-flow.md
 */
import type { WeatherType } from './types.js';

export function weatherCodeToType(code: number): WeatherType {
  if (code === 0) return 'sunny';
  if (code === 1 || code === 2) return 'partly_cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 57) || code === 61 || code === 80) return 'light_rain';
  if ((code >= 63 && code <= 67) || code === 81 || code === 82) return 'rain';
  if (code >= 95 && code <= 99) return 'thunderstorm';
  if (code === 71 || code === 73 || code === 85) return 'light_snow';
  if ((code >= 75 && code <= 77) || code === 86) return 'snow';
  return 'cloudy';
}
