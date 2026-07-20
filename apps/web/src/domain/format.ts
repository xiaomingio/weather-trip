/**
 * 文件说明: 提供天气、温度、海拔和日期等前端格式化方法。
 * 对应文档: docs/product-design.md
 */
import type { City, WeatherType } from 'weather-core/types';
import { getWeatherTypeLabel } from './weather';

export type DisplayLocale = 'zh' | 'en';

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

export function formatCityLocation(city: City, locale: DisplayLocale = 'zh'): string {
  const country = formatCountry(city, locale);
  const admin = locale === 'zh' ? city.admin1LocalName ?? city.admin1 : city.admin1;
  return [country, admin, formatCityName(city, locale)].filter(Boolean).join(' ');
}

export function formatCityRegion(city: City, locale: DisplayLocale = 'zh'): string {
  const country = formatCountry(city, locale);
  const admin = locale === 'zh' ? city.admin1LocalName ?? city.admin1 : city.admin1;
  return [country, admin].filter(Boolean).join(locale === 'zh' ? '' : ' ');
}

export function formatTemperature(value: number): string {
  return `${Math.round(value)}°C`;
}

export function formatTemperatureRange(min: number, max: number, locale: DisplayLocale = 'zh'): string {
  return locale === 'zh' ? `${Math.round(min)}~${Math.round(max)}°C` : `${Math.round(min)}-${Math.round(max)}°C`;
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
