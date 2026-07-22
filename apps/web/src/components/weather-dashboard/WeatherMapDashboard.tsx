/**
 * 文件说明: 承载 Weather Map 页面自己的地区、日期、图层、排序、地图数据和城市预报状态。
 * 对应文档: docs/product-design.md
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapLayer, RegionKey, WeatherFilter } from 'weather-core/types';
import { cityMatchesKeyword } from '@/domain/city-search';
import { type DisplayLocale } from '@/domain/format';
import { getMapRegionLayer } from '@/domain/regions';
import { getAlternateLocale } from '@/domain/site-prefs';
import {
  type DashboardWeatherMapResultItem,
  type MapDatesPayload,
  type WeatherToolPayload,
  type WeatherLayerDateData,
  type WeatherLayerPayload,
  getPrimaryRegionId,
  isDashboardCityFinderItem,
  parseWeatherFilterFromSearch,
  readDateFromSearch,
  readLayerFromSearch
} from '@/domain/weather-dashboard-shared';
import { WeatherMapFilterDock } from '../weather-filter-docks/WeatherMapFilterDock';
import { WorldWeatherMap } from '../WorldWeatherMap/WorldWeatherMap';
import {
  buildMapDatesApiUrl,
  buildWeatherLayerApiUrl,
  readSavedRegion,
  readSearch,
  replaceToolUrl,
  resultPageSize,
  saveRegion,
  syncToolNavigationLinks
} from './dashboardApi';
import { dashboardCopy } from './dashboardCopy';
import { useDelayedFlag, useRegionOptions, useSelectedCityForecasts, useTemperatureUnitPreference } from './dashboardHooks';
import { findDefaultSelectedResultItem } from './dashboardSelection';
import { ForecastPanel } from './ForecastPanel';
import type { SortDirection, WeatherMapSortKey } from './types';
import { weatherMapLayers } from './weatherMapLayers';
import {
  sortWeatherMapItems,
  weatherMapSortDirections,
  weatherMapSortOptions
} from './weatherMapSort';
import { WeatherMapResultsPanel } from './WeatherMapResultsPanel';

type WeatherMapDashboardProps = {
  locale: DisplayLocale;
  initialSearch: string;
};

type WeatherMapDaysCache = {
  key: string;
  days: Map<string, WeatherLayerDateData>;
};

function buildWeatherMapDaysCacheKey(locale: DisplayLocale, region: RegionKey, layer: MapLayer): string {
  return `${locale}:${region}:${layer}`;
}

function buildWeatherMapDashboardPayload(filters: MapDatesPayload, day: WeatherLayerDateData): WeatherToolPayload {
  return {
    tool: 'weather-map',
    region: filters.region,
    selectedDate: day.date,
    availableDates: filters.availableDates,
    regionAvailableDates: filters.regionAvailableDates,
    subRegionOptions: [],
    resultItems: day.resultItems,
    regionSummaries: day.regionSummaries,
    selectedCityForecasts: []
  };
}

export function WeatherMapDashboard({ locale, initialSearch }: WeatherMapDashboardProps) {
  const copy = dashboardCopy[locale];
  const temperatureUnit = useTemperatureUnitPreference(locale);
  const [weatherFilter, setWeatherFilter] = useState<WeatherFilter>(() => parseWeatherFilterFromSearch(initialSearch));
  const [selectedDate, setSelectedDate] = useState(() => readDateFromSearch(initialSearch, ''));
  const [layer, setLayer] = useState<MapLayer>(() => readLayerFromSearch(initialSearch));
  const [weatherMapSortKey, setWeatherMapSortKey] = useState<WeatherMapSortKey>(() => readLayerFromSearch(initialSearch));
  const [weatherMapSortDirection, setWeatherMapSortDirection] = useState<SortDirection>(() => weatherMapSortDirections[readLayerFromSearch(initialSearch)]);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [cityKeyword, setCityKeyword] = useState('');
  const [dashboardData, setDashboardData] = useState<WeatherToolPayload | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visibleResultLimit, setVisibleResultLimit] = useState(resultPageSize);
  const [isBrowserReady, setIsBrowserReady] = useState(false);
  const isApplyingPopState = useRef(false);
  const isApplyingPayloadDate = useRef(false);
  const weatherMapDaysCache = useRef<WeatherMapDaysCache | null>(null);
  const otherLocale = getAlternateLocale(locale);
  const primaryRegion = getPrimaryRegionId(weatherFilter.region);
  const { primaryRegionOptions, subRegionOptions } = useRegionOptions(locale, primaryRegion, isBrowserReady);
  const canSelectSubRegion = subRegionOptions.length > 1;
  const regionAvailableDates = dashboardData?.regionAvailableDates ?? [];
  const selectedDateIndex = Math.max(0, regionAvailableDates.indexOf(selectedDate));

  useEffect(() => {
    const search = readSearch() || initialSearch;
    const nextLayer = readLayerFromSearch(search);
    setWeatherFilter(parseWeatherFilterFromSearch(search, readSavedRegion()));
    setSelectedDate(readDateFromSearch(search, ''));
    setLayer(nextLayer);
    setWeatherMapSortKey(nextLayer);
    setWeatherMapSortDirection(weatherMapSortDirections[nextLayer]);
    setIsBrowserReady(true);
  }, [initialSearch]);

  useEffect(() => {
    const handlePopState = () => {
      isApplyingPopState.current = true;
      const search = readSearch();
      setWeatherFilter(parseWeatherFilterFromSearch(search, readSavedRegion()));
      setSelectedDate(readDateFromSearch(search, regionAvailableDates[0] ?? ''));
      setLayer(readLayerFromSearch(search));
      setSelectedCityId(null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [regionAvailableDates]);

  useEffect(() => {
    if (!isBrowserReady) return;
    if (isApplyingPopState.current) {
      isApplyingPopState.current = false;
      return;
    }
    replaceToolUrl(locale, 'weather-map', weatherFilter, selectedDate, layer);
  }, [isBrowserReady, layer, locale, selectedDate, weatherFilter]);

  useEffect(() => {
    if (!isBrowserReady) return;
    syncToolNavigationLinks(locale, otherLocale, 'weather-map', weatherFilter, selectedDate, layer);
  }, [isBrowserReady, layer, locale, otherLocale, selectedDate, weatherFilter]);

  useEffect(() => {
    if (!isBrowserReady) return;
    if (isApplyingPayloadDate.current) {
      isApplyingPayloadDate.current = false;
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsLoadingData(true);
      try {
        const filtersResponse = await fetch(buildMapDatesApiUrl(locale, weatherFilter, selectedDate), {
          signal: controller.signal
        });
        if (!filtersResponse.ok) throw new Error(`Weather filters request failed with ${filtersResponse.status}.`);
        const filtersPayload = (await filtersResponse.json()) as MapDatesPayload;
        const nextDate =
          selectedDate && filtersPayload.regionAvailableDates.includes(selectedDate)
            ? selectedDate
            : filtersPayload.selectedDate;
        const cacheKey = buildWeatherMapDaysCacheKey(locale, weatherFilter.region, layer);
        const cachedDay = weatherMapDaysCache.current?.key === cacheKey ? weatherMapDaysCache.current.days.get(nextDate) : null;
        let dayData = cachedDay ?? null;

        if (!dayData) {
          const dayResponse = await fetch(buildWeatherLayerApiUrl(locale, weatherFilter, nextDate, layer, true), {
            signal: controller.signal
          });
          if (!dayResponse.ok) throw new Error(`Weather map request failed with ${dayResponse.status}.`);
          const dayPayload = (await dayResponse.json()) as WeatherLayerPayload;
          dayData = dayPayload.days[0] ?? null;
          if (dayData) {
            const days = weatherMapDaysCache.current?.key === cacheKey ? weatherMapDaysCache.current.days : new Map<string, WeatherLayerDateData>();
            days.set(dayData.date, dayData);
            weatherMapDaysCache.current = { key: cacheKey, days };
          }
        }

        if (!dayData) throw new Error('Weather map request returned no day data.');

        setDashboardData(buildWeatherMapDashboardPayload(filtersPayload, dayData));
        setLoadError(null);
        if (dayData.date && dayData.date !== selectedDate) {
          isApplyingPayloadDate.current = true;
          setSelectedDate(dayData.date);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : 'Weather map request failed.');
      } finally {
        if (!controller.signal.aborted) setIsLoadingData(false);
      }
    }, 160);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isBrowserReady, layer, locale, selectedDate, weatherFilter]);

  useEffect(() => {
    if (!isBrowserReady) return;

    const cacheKey = buildWeatherMapDaysCacheKey(locale, weatherFilter.region, layer);
    if (weatherMapDaysCache.current?.key === cacheKey && weatherMapDaysCache.current.days.size >= 14) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(buildWeatherLayerApiUrl(locale, weatherFilter, '', layer, false), {
          signal: controller.signal
        });
        if (!response.ok) return;
        const payload = (await response.json()) as WeatherLayerPayload;
        const days = new Map(payload.days.map((day) => [day.date, day]));
        weatherMapDaysCache.current = { key: cacheKey, days };

        const activeDay = days.get(selectedDate);
        if (activeDay) {
          setDashboardData((current) =>
            current?.tool === 'weather-map' && current.region === weatherFilter.region
              ? {
                  ...current,
                  selectedDate: activeDay.date,
                  resultItems: activeDay.resultItems,
                  regionSummaries: activeDay.regionSummaries
                }
              : current
          );
        }
      } catch {
        if (controller.signal.aborted) return;
      }
    }, 650);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isBrowserReady, layer, locale, selectedDate, weatherFilter]);

  useEffect(() => {
    setWeatherMapSortKey(layer);
    setWeatherMapSortDirection(weatherMapSortDirections[layer]);
  }, [layer]);

  const resultItems = useMemo(() => {
    return (dashboardData?.resultItems ?? []).filter((item) => cityMatchesKeyword(item.city, cityKeyword));
  }, [cityKeyword, dashboardData?.resultItems]);
  const sortedResultItems = useMemo(() => {
    const weatherMapItems = resultItems.filter((item): item is DashboardWeatherMapResultItem => !isDashboardCityFinderItem(item));
    return sortWeatherMapItems(weatherMapItems, weatherMapSortKey, weatherMapSortDirection, locale);
  }, [locale, resultItems, weatherMapSortDirection, weatherMapSortKey]);
  const visibleResultItems = sortedResultItems.slice(0, visibleResultLimit);
  const defaultSelectedResultItem = useMemo(() => findDefaultSelectedResultItem(resultItems, locale), [locale, resultItems]);
  const selectedResultItem = resultItems.find((item) => item.city.id === selectedCityId) ?? defaultSelectedResultItem;
  const selectedCity = selectedResultItem?.city;
  const effectiveSelectedCityId = selectedCity?.id ?? null;
  const { forecasts: selectedForecasts, isLoading: isLoadingCityForecast } = useSelectedCityForecasts(
    locale,
    effectiveSelectedCityId,
    isBrowserReady
  );
  const shouldShowDashboardLoading = isLoadingData && !dashboardData;
  const shouldBlockDashboardRefresh = isLoadingData && Boolean(dashboardData);
  const shouldShowForecastLoading = shouldShowDashboardLoading || (isLoadingCityForecast && selectedForecasts.length === 0);
  const shouldBlockForecastRefresh = (shouldBlockDashboardRefresh || isLoadingCityForecast) && selectedForecasts.length > 0;
  const showDashboardRefreshOverlay = useDelayedFlag(shouldBlockDashboardRefresh, 300);
  const showForecastRefreshOverlay = useDelayedFlag(shouldBlockForecastRefresh, 300);
  const visibleCount = resultItems.length;
  const visibleRegionCount = dashboardData?.regionSummaries.length ?? 0;
  const selectedWeatherMapSortLabel = weatherMapSortOptions.find((option) => option.id === weatherMapSortKey)?.labels[locale] ?? '';

  useEffect(() => {
    setVisibleResultLimit(resultPageSize);
  }, [cityKeyword, dashboardData?.resultItems, weatherMapSortDirection, weatherMapSortKey]);

  const setRegion = useCallback((region: RegionKey) => {
    setWeatherFilter((current) => ({ ...current, region }));
    saveRegion(region);
    setSelectedCityId(null);
  }, []);

  return (
    <section className="workspace">
      <aside className="filter-panel" aria-label={copy.filterPanel}>
        <WeatherMapFilterDock
          locale={locale}
          primaryRegion={primaryRegion}
          currentRegion={weatherFilter.region}
          primaryRegionOptions={primaryRegionOptions}
          subRegionOptions={subRegionOptions}
          canSelectSubRegion={canSelectSubRegion}
          selectedDate={selectedDate}
          selectedDateIndex={selectedDateIndex}
          regionAvailableDates={regionAvailableDates}
          layer={layer}
          layers={weatherMapLayers}
          onPrimaryRegionChange={setRegion}
          onSubRegionChange={setRegion}
          onDateChange={setSelectedDate}
          onLayerChange={setLayer}
        />
      </aside>

      <section className="workspace-body" aria-label={copy.resultPanel}>
        <WeatherMapResultsPanel
          locale={locale}
          layer={layer}
          temperatureUnit={temperatureUnit}
          copy={copy}
          cityKeyword={cityKeyword}
          resultItems={resultItems}
          visibleResultItems={visibleResultItems}
          selectedCityId={effectiveSelectedCityId}
          visibleRegionCount={visibleRegionCount}
          visibleCount={visibleCount}
          loadError={loadError}
          isLoading={shouldShowDashboardLoading}
          isRefreshing={showDashboardRefreshOverlay}
          weatherMapSortKey={weatherMapSortKey}
          weatherMapSortDirection={weatherMapSortDirection}
          weatherMapSortOptions={weatherMapSortOptions}
          weatherMapSortDirections={weatherMapSortDirections}
          selectedWeatherMapSortLabel={selectedWeatherMapSortLabel}
          onCityKeywordChange={setCityKeyword}
          onSelectCity={setSelectedCityId}
          onWeatherMapSortKeyChange={setWeatherMapSortKey}
          onWeatherMapSortDirectionChange={setWeatherMapSortDirection}
          onLoadMore={() => setVisibleResultLimit((current) => current + resultPageSize)}
        />

        <ForecastPanel
          locale={locale}
          temperatureUnit={temperatureUnit}
          copy={copy}
          city={selectedCity}
          forecasts={selectedForecasts}
          isLoading={shouldShowForecastLoading}
          isRefreshing={showForecastRefreshOverlay}
        />

        <section className="map-column" aria-label={copy.mapPanel}>
          <WorldWeatherMap
            tool="weather-map"
            locale={locale}
            layer={layer}
            resultItems={resultItems}
            regionSummaries={dashboardData?.regionSummaries ?? []}
            dataRegion={dashboardData?.region ?? null}
            temperatureUnit={temperatureUnit}
            activeRegion={weatherFilter.region}
            regionLayer={getMapRegionLayer(weatherFilter.region)}
            selectedCityId={effectiveSelectedCityId}
            onSelectCity={setSelectedCityId}
            statusLabel={
              shouldShowDashboardLoading
                ? copy.loadingWeatherData
                : !dashboardData || resultItems.length === 0
                  ? copy.noMapData
                  : null
            }
            statusKind={shouldShowDashboardLoading ? 'loading' : 'empty'}
            isRefreshing={showDashboardRefreshOverlay}
            refreshLabel={copy.loadingWeatherData}
          />
        </section>
      </section>
    </section>
  );
}
