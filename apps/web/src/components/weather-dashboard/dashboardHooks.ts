/**
 * 文件说明: 提供天气工具两个 React 页面组件复用的浏览器偏好、地区选项、城市预报和延迟刷新状态 Hook。
 * 对应文档: docs/plans/free-static-data-plan.md
 */

import { useEffect, useState } from 'react';
import type { DailyForecast, RegionKey } from 'weather-core/types';
import type { DisplayLocale, TemperatureUnit } from '@/domain/format';
import { loadCitySnapshot, loadWeatherSnapshot } from '@/domain/weather-data-source';
import {
  readStoredTemperatureUnit,
  saveLocalePreference,
  temperatureUnitChangeEvent
} from '@/domain/site-prefs';
import type { WeatherRegionOption } from '@/domain/weather-dashboard-shared';
import { buildCityForecastPayload, buildRegionsPayload, buildSubregionsPayload } from '@/domain/weather-dashboard-payload';

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

    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await loadCitySnapshot();
        if (!cancelled) setPrimaryRegionOptions(buildRegionsPayload(snapshot, { locale, searchParams: new URLSearchParams() }).regions);
      } catch {
        if (!cancelled) setPrimaryRegionOptions([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isBrowserReady, locale]);

  useEffect(() => {
    if (!isBrowserReady) return;

    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await loadCitySnapshot();
        const searchParams = new URLSearchParams({ region: primaryRegion });
        if (!cancelled) setSubRegionOptions(buildSubregionsPayload(snapshot, { locale, searchParams }).subRegions);
      } catch {
        if (!cancelled) setSubRegionOptions([]);
      }
    })();

    return () => {
      cancelled = true;
    };
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

    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      try {
        const snapshot = await loadWeatherSnapshot();
        const payload = buildCityForecastPayload(snapshot, { locale, searchParams: new URLSearchParams({ cityId }) });
        if (!cancelled && payload.cityId === cityId) setForecasts(payload.selectedCityForecasts);
      } catch {
        if (!cancelled) setForecasts([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cityId, isBrowserReady, locale]);

  return { forecasts, isLoading };
}
