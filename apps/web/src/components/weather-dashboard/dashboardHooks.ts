/**
 * 文件说明: 提供天气工具两个 React 页面组件复用的浏览器偏好、地区选项、城市预报和延迟刷新状态 Hook。
 * 对应文档: docs/data-flow.md
 */

import { useEffect, useState } from 'react';
import type { DailyForecast, RegionKey } from 'weather-core/types';
import type { DisplayLocale, TemperatureUnit } from '@/domain/format';
import {
  readStoredTemperatureUnit,
  saveLocalePreference,
  temperatureUnitChangeEvent
} from '@/domain/site-prefs';
import type { CityForecastPayload, RegionsPayload, SubregionsPayload, WeatherRegionOption } from '@/domain/weather-dashboard-shared';
import { buildCityForecastApiUrl, buildRegionsApiUrl, buildSubregionsApiUrl } from './dashboardApi';

export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [active, delayMs]);

  return visible;
}

export function useTemperatureUnitPreference(locale: DisplayLocale): TemperatureUnit {
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>('c');

  useEffect(() => {
    const syncTemperatureUnit = () => setTemperatureUnit(readStoredTemperatureUnit());
    const handleUnitChange = (event: Event) => {
      const unit = (event as CustomEvent<{ unit?: TemperatureUnit }>).detail?.unit;
      setTemperatureUnit(unit === 'f' ? 'f' : 'c');
    };

    syncTemperatureUnit();
    window.addEventListener('storage', syncTemperatureUnit);
    window.addEventListener(temperatureUnitChangeEvent, handleUnitChange as EventListener);
    return () => {
      window.removeEventListener('storage', syncTemperatureUnit);
      window.removeEventListener(temperatureUnitChangeEvent, handleUnitChange as EventListener);
    };
  }, []);

  useEffect(() => {
    saveLocalePreference(locale);
  }, [locale]);

  return temperatureUnit;
}

export function useRegionOptions(
  locale: DisplayLocale,
  primaryRegion: RegionKey,
  isBrowserReady: boolean
): {
  primaryRegionOptions: WeatherRegionOption[];
  subRegionOptions: WeatherRegionOption[];
} {
  const [primaryRegionOptions, setPrimaryRegionOptions] = useState<WeatherRegionOption[]>([]);
  const [subRegionOptions, setSubRegionOptions] = useState<WeatherRegionOption[]>([]);

  useEffect(() => {
    if (!isBrowserReady) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(buildRegionsApiUrl(locale), {
          signal: controller.signal
        });
        if (!response.ok) return;
        const payload = (await response.json()) as RegionsPayload;
        setPrimaryRegionOptions(payload.regions);
      } catch {
        if (!controller.signal.aborted) setPrimaryRegionOptions([]);
      }
    })();

    return () => controller.abort();
  }, [isBrowserReady, locale]);

  useEffect(() => {
    if (!isBrowserReady) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(buildSubregionsApiUrl(locale, primaryRegion), {
          signal: controller.signal
        });
        if (!response.ok) return;
        const payload = (await response.json()) as SubregionsPayload;
        setSubRegionOptions(payload.subRegions);
      } catch {
        if (!controller.signal.aborted) setSubRegionOptions([]);
      }
    })();

    return () => controller.abort();
  }, [isBrowserReady, locale, primaryRegion]);

  return { primaryRegionOptions, subRegionOptions };
}

export function useSelectedCityForecasts(
  locale: DisplayLocale,
  cityId: string | null,
  isBrowserReady: boolean
): {
  forecasts: DailyForecast[];
  isLoading: boolean;
} {
  const [forecasts, setForecasts] = useState<DailyForecast[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isBrowserReady) return;
    if (!cityId) {
      setForecasts([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    void (async () => {
      try {
        const response = await fetch(buildCityForecastApiUrl(locale, cityId), {
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`City forecast request failed with ${response.status}.`);
        const payload = (await response.json()) as CityForecastPayload;
        if (payload.cityId === cityId) setForecasts(payload.selectedCityForecasts);
      } catch {
        if (!controller.signal.aborted) setForecasts([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [cityId, isBrowserReady, locale]);

  return { forecasts, isLoading };
}
