/**
 * 文件说明: 定义天气类型到 SVG 图标节点和地图图标资源的共享映射。
 * 参考资料: lucide-react v0.468.0 icon nodes (ISC)
 */
import type { WeatherType } from 'weather-core/types';

type WeatherIconNodeName = 'circle' | 'line' | 'path';
type WeatherIconNodeAttributes = Record<string, string>;
export type WeatherIconNode = [name: WeatherIconNodeName, attributes: WeatherIconNodeAttributes];

export const weatherTypeIconNodes: Record<WeatherType, WeatherIconNode[]> = {
  sunny: [
    ['circle', { cx: '12', cy: '12', r: '4', key: 'sun-circle' }],
    ['path', { d: 'M12 2v2', key: 'sun-top' }],
    ['path', { d: 'M12 20v2', key: 'sun-bottom' }],
    ['path', { d: 'm4.93 4.93 1.41 1.41', key: 'sun-top-left' }],
    ['path', { d: 'm17.66 17.66 1.41 1.41', key: 'sun-bottom-right' }],
    ['path', { d: 'M2 12h2', key: 'sun-left' }],
    ['path', { d: 'M20 12h2', key: 'sun-right' }],
    ['path', { d: 'm6.34 17.66-1.41 1.41', key: 'sun-bottom-left' }],
    ['path', { d: 'm19.07 4.93-1.41 1.41', key: 'sun-top-right' }]
  ],
  partly_cloudy: [
    ['path', { d: 'M12 2v2', key: 'cloud-sun-top' }],
    ['path', { d: 'm4.93 4.93 1.41 1.41', key: 'cloud-sun-top-left' }],
    ['path', { d: 'M20 12h2', key: 'cloud-sun-right' }],
    ['path', { d: 'm19.07 4.93-1.41 1.41', key: 'cloud-sun-top-right' }],
    ['path', { d: 'M15.947 12.65a4 4 0 0 0-5.925-4.128', key: 'cloud-sun-arc' }],
    ['path', { d: 'M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z', key: 'cloud-sun-cloud' }]
  ],
  cloudy: [['path', { d: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z', key: 'cloud' }]],
  overcast: [
    ['path', { d: 'M17.5 21H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z', key: 'cloudy-front' }],
    ['path', { d: 'M22 10a3 3 0 0 0-3-3h-2.207a5.502 5.502 0 0 0-10.702.5', key: 'cloudy-back' }]
  ],
  fog: [
    ['path', { d: 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242', key: 'fog-cloud' }],
    ['path', { d: 'M16 17H7', key: 'fog-line-top' }],
    ['path', { d: 'M17 21H9', key: 'fog-line-bottom' }]
  ],
  light_rain: [
    ['path', { d: 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242', key: 'drizzle-cloud' }],
    ['path', { d: 'M8 19v1', key: 'drizzle-left-bottom' }],
    ['path', { d: 'M8 14v1', key: 'drizzle-left-top' }],
    ['path', { d: 'M16 19v1', key: 'drizzle-right-bottom' }],
    ['path', { d: 'M16 14v1', key: 'drizzle-right-top' }],
    ['path', { d: 'M12 21v1', key: 'drizzle-center-bottom' }],
    ['path', { d: 'M12 16v1', key: 'drizzle-center-top' }]
  ],
  rain: [
    ['path', { d: 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242', key: 'rain-cloud' }],
    ['path', { d: 'M16 14v6', key: 'rain-right' }],
    ['path', { d: 'M8 14v6', key: 'rain-left' }],
    ['path', { d: 'M12 16v6', key: 'rain-center' }]
  ],
  thunderstorm: [
    ['path', { d: 'M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973', key: 'lightning-cloud' }],
    ['path', { d: 'm13 12-3 5h4l-3 5', key: 'lightning-bolt' }]
  ],
  light_snow: [
    ['line', { x1: '2', x2: '22', y1: '12', y2: '12', key: 'snowflake-horizontal' }],
    ['line', { x1: '12', x2: '12', y1: '2', y2: '22', key: 'snowflake-vertical' }],
    ['path', { d: 'm20 16-4-4 4-4', key: 'snowflake-right' }],
    ['path', { d: 'm4 8 4 4-4 4', key: 'snowflake-left' }],
    ['path', { d: 'm16 4-4 4-4-4', key: 'snowflake-top' }],
    ['path', { d: 'm8 20 4-4 4 4', key: 'snowflake-bottom' }]
  ],
  snow: [
    ['path', { d: 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242', key: 'snow-cloud' }],
    ['path', { d: 'M8 15h.01', key: 'snow-left-top' }],
    ['path', { d: 'M8 19h.01', key: 'snow-left-bottom' }],
    ['path', { d: 'M12 17h.01', key: 'snow-center-top' }],
    ['path', { d: 'M12 21h.01', key: 'snow-center-bottom' }],
    ['path', { d: 'M16 15h.01', key: 'snow-right-top' }],
    ['path', { d: 'M16 19h.01', key: 'snow-right-bottom' }]
  ]
};

export const weatherTypeMapIconIds: Record<WeatherType, string> = {
  sunny: 'weather-icon-sunny',
  partly_cloudy: 'weather-icon-partly-cloudy',
  cloudy: 'weather-icon-cloudy',
  overcast: 'weather-icon-overcast',
  fog: 'weather-icon-fog',
  light_rain: 'weather-icon-light-rain',
  rain: 'weather-icon-rain',
  thunderstorm: 'weather-icon-thunderstorm',
  light_snow: 'weather-icon-light-snow',
  snow: 'weather-icon-snow'
};

export const weatherTypeMapIconEntries = Object.entries(weatherTypeMapIconIds) as Array<[WeatherType, string]>;

function escapeSvgAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function iconNodeToMarkup([name, attributes]: WeatherIconNode): string {
  const markupAttributes = Object.entries(attributes)
    .filter(([key]) => key !== 'key')
    .map(([key, value]) => `${key}="${escapeSvgAttribute(value)}"`)
    .join(' ');

  return `<${name} ${markupAttributes}/>`;
}

export function buildWeatherTypeMapIconDataUrl(type: WeatherType): string {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"',
    ' stroke="#fff" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round">',
    weatherTypeIconNodes[type].map(iconNodeToMarkup).join(''),
    '</svg>'
  ].join('');

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
