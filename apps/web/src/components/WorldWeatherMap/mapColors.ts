/**
 * 文件说明: 提供 WorldWeatherMap 图层、图例和点位渲染共用的颜色与数值格式化函数。
 * 对应文档: docs/product-design.md
 */

import { celsiusToFahrenheit, type TemperatureUnit } from '@/domain/format';

const elevationColorStops = [
  { maxMeters: 100, color: '#4f9d86', gradientPosition: 0 },
  { maxMeters: 500, color: '#8fae5d', gradientPosition: 22 },
  { maxMeters: 1500, color: '#d1b55f', gradientPosition: 48 },
  { maxMeters: 3000, color: '#a96f4b', gradientPosition: 74 },
  { color: '#e6e2d3', gradientPosition: 100 }
] satisfies Array<{ maxMeters?: number; color: string; gradientPosition: number }>;

export function temperatureColor(value: number): string {
  if (value <= 0) return '#6ca6ff';
  if (value <= 12) return '#48b7c7';
  if (value <= 22) return '#51b778';
  if (value <= 30) return '#e5aa31';
  return '#d86449';
}

export function weatherColor(type: string): string {
  if (type === 'sunny' || type === 'partly_cloudy') return '#e6ae2f';
  if (type === 'light_rain' || type === 'rain' || type === 'thunderstorm') return '#3f88c5';
  if (type === 'light_snow' || type === 'snow') return '#8fb8d8';
  if (type === 'fog') return '#87909a';
  return '#6d7f68';
}

export function elevationColor(value: number): string {
  return elevationColorStops.find((stop) => stop.maxMeters === undefined || value < stop.maxMeters)?.color ?? '#e6e2d3';
}

export function elevationGradient(): string {
  const stops = elevationColorStops.map((stop) => `${stop.color} ${stop.gradientPosition}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

export function humidityColor(value: number): string {
  if (value < 30) return '#c99a45';
  if (value <= 70) return '#4f9d86';
  if (value <= 85) return '#3f88c5';
  return '#7568a8';
}

export function precipitationColor(value: number): string {
  const opacity = Math.max(0.3, Math.min(1, value / 24 + 0.2));
  return `rgba(43, 116, 181, ${opacity})`;
}

export function windColor(value: number): string {
  const normalized = Math.max(0, Math.min(1, value / 80));
  return interpolateColor([89, 156, 178], [121, 98, 157], normalized);
}

export function comfortColor(value: number): string {
  if (value >= 0.72) return '#2fa36b';
  if (value >= 0.45) return '#d0a02f';
  return '#c35b4b';
}

function interpolateColor(from: [number, number, number], to: [number, number, number], progress: number): string {
  const ratio = Math.max(0, Math.min(1, progress));
  const [red, green, blue] = from.map((channel, index) => Math.round(channel + (to[index] - channel) * ratio));
  return `rgb(${red}, ${green}, ${blue})`;
}

export function relativeMatchColor(value: number, min: number, max: number): string {
  if (max <= min) return value > 0 ? '#d0a02f' : '#c35b4b';

  const normalized = (value - min) / (max - min);
  if (normalized <= 0.5) return interpolateColor([195, 91, 75], [208, 160, 47], normalized / 0.5);
  return interpolateColor([208, 160, 47], [47, 163, 107], (normalized - 0.5) / 0.5);
}

export function normalizeRangeValue(value: number, min: number, max: number): number {
  if (max <= min) return value > 0 ? 0.55 : 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

export function temperatureMarkerText(valueC: number, unit: TemperatureUnit): string {
  const value = unit === 'f' ? celsiusToFahrenheit(valueC) : valueC;
  return `${Math.round(value)}°`;
}

export function temperatureLabel(valueC: number, unit: TemperatureUnit): string {
  const value = unit === 'f' ? celsiusToFahrenheit(valueC) : valueC;
  return `${Math.round(value)}°${unit.toUpperCase()}`;
}
