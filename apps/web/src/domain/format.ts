/**
 * 文件说明: 提供天气、温度、海拔和日期等前端格式化方法。
 * 对应文档: docs/product-design.md
 */
import type { City, WeatherType } from 'weather-core/types';
import { getWeatherTypeLabel } from './weather';

export type DisplayLocale = 'zh' | 'en';
export type TemperatureUnit = 'c' | 'f';

const countryDisplayNames: Record<DisplayLocale, Intl.DisplayNames> = {
  zh: new Intl.DisplayNames(['zh-CN'], { type: 'region' }),
  en: new Intl.DisplayNames(['en-US'], { type: 'region' })
};

function formatCountry(city: City, locale: DisplayLocale): string {
  return city.countryCode ? countryDisplayNames[locale].of(city.countryCode) ?? city.country : city.country;
}

export function formatCityName(city: City, locale: DisplayLocale = 'zh'): string {
  return city.names[locale];
}

export function formatCityRegionSegments(city: City, locale: DisplayLocale = 'zh'): string[] {
  const country = formatCountry(city, locale);
  const admin = locale === 'zh' ? city.admin1LocalName ?? city.admin1 : city.admin1;
  return [country, admin].filter((part): part is string => Boolean(part));
}

export function formatCityLocation(city: City, locale: DisplayLocale = 'zh'): string {
  return [...formatCityRegionSegments(city, locale), formatCityName(city, locale)].filter(Boolean).join(' ');
}

export function formatCityRegion(city: City, locale: DisplayLocale = 'zh'): string {
  return formatCityRegionSegments(city, locale).join(locale === 'zh' ? '' : ' ');
}

export function celsiusToFahrenheit(value: number): number {
  return (value * 9) / 5 + 32;
}

export function formatTemperature(value: number, unit: TemperatureUnit = 'c'): string {
  const displayValue = unit === 'f' ? celsiusToFahrenheit(value) : value;
  return `${Math.round(displayValue)}°${unit.toUpperCase()}`;
}

export function formatTemperatureRange(
  min: number,
  max: number,
  locale: DisplayLocale = 'zh',
  unit: TemperatureUnit = 'c'
): string {
  const displayMin = unit === 'f' ? celsiusToFahrenheit(min) : min;
  const displayMax = unit === 'f' ? celsiusToFahrenheit(max) : max;
  const separator = locale === 'zh' ? '~' : '-';
  return `${Math.round(displayMin)}${separator}${Math.round(displayMax)}°${unit.toUpperCase()}`;
}

export function formatCompactTemperatureRange(
  min: number,
  max: number,
  locale: DisplayLocale = 'zh',
  unit: TemperatureUnit = 'c'
): string {
  const displayMin = unit === 'f' ? celsiusToFahrenheit(min) : min;
  const displayMax = unit === 'f' ? celsiusToFahrenheit(max) : max;
  const separator = locale === 'zh' ? '~' : '-';
  return `${Math.round(displayMin)}${separator}${Math.round(displayMax)}°${unit.toUpperCase()}`;
}

export function formatElevation(value: number, locale: DisplayLocale = 'zh'): string {
  return `${Math.round(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')} m`;
}

export function formatHumidity(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatWeatherType(type: WeatherType, locale: DisplayLocale = 'zh'): string {
  return getWeatherTypeLabel(type, locale);
}

export function formatDateLabel(date: string, locale: DisplayLocale = 'zh'): string {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'short'
  }).format(new Date(`${date}T12:00:00Z`));
}

export function formatCompactForecastDateLabel(date: string, locale: DisplayLocale = 'zh'): string {
  const value = new Date(`${date}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    timeZone: 'UTC',
    weekday: 'short'
  }).format(value);

  return `${value.getUTCMonth() + 1}.${value.getUTCDate()} ${weekday}`;
}
