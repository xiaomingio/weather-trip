/**
 * 文件说明: 管理 Weather Trip 跨页面共享的用户偏好，包括界面语言和温度单位。
 * 对应文档: docs/product-design.md
 */
import type { DisplayLocale, TemperatureUnit } from './format';

export const temperatureUnitStorageKey = 'weather-trip-temp-unit';
export const localeStorageKey = 'weather-trip-locale';
export const temperatureUnitChangeEvent = 'weather-trip-temp-unit-change';
export const localeChangeEvent = 'weather-trip-locale-change';

export function normalizeTemperatureUnit(value: string | null | undefined): TemperatureUnit {
  return value === 'f' ? 'f' : 'c';
}

export function normalizeLocale(value: string | null | undefined, fallback: DisplayLocale = 'en'): DisplayLocale {
  if (value === 'zh' || value === 'en') return value;
  return fallback;
}

export function readStoredTemperatureUnit(): TemperatureUnit {
  if (typeof window === 'undefined') return 'c';
  return normalizeTemperatureUnit(window.localStorage.getItem(temperatureUnitStorageKey));
}

export function saveLocalePreference(locale: DisplayLocale): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(localeStorageKey, locale);
  document.documentElement.dataset.locale = locale;
  window.dispatchEvent(
    new CustomEvent(localeChangeEvent, {
      detail: { locale }
    })
  );
}

export function getAlternateLocale(locale: DisplayLocale): DisplayLocale {
  return locale === 'zh' ? 'en' : 'zh';
}
