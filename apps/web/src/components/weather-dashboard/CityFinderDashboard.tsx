/**
 * 文件说明: 承载 City Finder 页面自己的筛选状态、城市匹配请求、结果列表、十四天预报和地图联动。
 * 对应文档: docs/product-design.md
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RegionKey, WeatherFilter } from 'weather-core/types';
import { cityMatchesKeyword } from '@/domain/city-search';
import { type DisplayLocale } from '@/domain/format';
import { loadWeatherSnapshot } from '@/domain/weather-data-source';
import { buildCitySearchPayload } from '@/domain/weather-dashboard-payload';
import { allWeatherTypes, getWeatherTypeLabel } from '@/domain/weather';
import {
  type WeatherToolPayload,
  buildFilterSearch,
  getPrimaryRegionId,
  isDashboardCityFinderItem,
  parseWeatherFilterFromSearch
} from '@/domain/weather-dashboard-shared';
import { CityFinderFilterDock } from '../weather-filter-docks/CityFinderFilterDock';
import { WorldWeatherMap } from '../WorldWeatherMap/WorldWeatherMap';
import {
  readSavedRegion,
  readSearch,
  replaceToolUrl,
  resultPageSize,
  saveRegion,
  saveSearchRegion
} from './dashboardApi';
import { dashboardCopy } from './dashboardCopy';
import { useDelayedFlag, useRegionOptions, useSelectedCityForecasts, useTemperatureUnitPreference } from './dashboardHooks';
import { findDefaultSelectedResultItem } from './dashboardSelection';
import { CityFinderResultsPanel } from './CityFinderResultsPanel';
import { ForecastPanel } from './ForecastPanel';

type CityFinderDashboardProps = {
  locale: DisplayLocale;
  initialSearch: string;
};

export function CityFinderDashboard({ locale, initialSearch }: CityFinderDashboardProps) {
  const copy = dashboardCopy[locale];
  const temperatureUnit = useTemperatureUnitPreference(locale);
  const [weatherFilter, setWeatherFilter] = useState<WeatherFilter>(() => parseWeatherFilterFromSearch(initialSearch));
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [cityKeyword, setCityKeyword] = useState('');
  const [dashboardData, setDashboardData] = useState<WeatherToolPayload | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visibleResultLimit, setVisibleResultLimit] = useState(resultPageSize);
  const [isBrowserReady, setIsBrowserReady] = useState(false);
  const isApplyingPopState = useRef(false);
  const primaryRegion = getPrimaryRegionId(weatherFilter.region);
  const { primaryRegionOptions, subRegionOptions } = useRegionOptions(locale, primaryRegion, isBrowserReady);
  const canSelectSubRegion = subRegionOptions.length > 1;

  useEffect(() => {
    const search = readSearch() || initialSearch;
    saveSearchRegion(search);
    setWeatherFilter(parseWeatherFilterFromSearch(search, readSavedRegion()));
    setIsBrowserReady(true);
  }, [initialSearch]);

  useEffect(() => {
    const handlePopState = () => {
      isApplyingPopState.current = true;
      const search = readSearch();
      saveSearchRegion(search);
      setWeatherFilter(parseWeatherFilterFromSearch(search, readSavedRegion()));
      setSelectedCityId(null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!isBrowserReady) return;
    if (isApplyingPopState.current) {
      isApplyingPopState.current = false;
      return;
    }
    replaceToolUrl(locale, 'city-finder', weatherFilter, '', 'weather');
  }, [isBrowserReady, locale, weatherFilter]);

  useEffect(() => {
    if (!isBrowserReady) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsLoadingData(true);
      try {
        const snapshot = await loadWeatherSnapshot();
        if (controller.signal.aborted) return;
        const payload = buildCitySearchPayload(snapshot, {
          locale,
          searchParams: new URLSearchParams(buildFilterSearch('city-finder', weatherFilter, '', 'weather'))
        });
        setDashboardData(payload);
        setLoadError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : 'Weather data request failed.');
      } finally {
        if (!controller.signal.aborted) setIsLoadingData(false);
      }
    }, 160);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isBrowserReady, locale, weatherFilter]);

  const resultItems = useMemo(() => {
    return (dashboardData?.resultItems ?? []).filter((item) => cityMatchesKeyword(item.city, cityKeyword));
  }, [cityKeyword, dashboardData?.resultItems]);
  const visibleResultItems = resultItems.slice(0, visibleResultLimit);
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
  const selectedWeatherSummary =
    weatherFilter.weatherTypes.length === allWeatherTypes.length
      ? copy.all
      : weatherFilter.weatherTypes.map((type) => getWeatherTypeLabel(type, locale)).join(locale === 'zh' ? '、' : ', ');
  const visibleCount = resultItems.length;
  const visibleRegionCount = dashboardData?.regionSummaries.length ?? 0;
  const highMatchCityCount = resultItems.filter(
    (item) => isDashboardCityFinderItem(item) && item.matchDays / Math.max(item.totalDays, 1) >= 0.7
  ).length;

  useEffect(() => {
    setVisibleResultLimit(resultPageSize);
  }, [cityKeyword, dashboardData?.resultItems]);

  const setRegion = useCallback((region: RegionKey) => {
    setWeatherFilter((current) => ({ ...current, region }));
    saveRegion(region);
    setSelectedCityId(null);
  }, []);

  return (
    <section className="workspace">
      <aside className="filter-panel" aria-label={copy.filterPanel}>
        <CityFinderFilterDock
          locale={locale}
          temperatureUnit={temperatureUnit}
          weatherFilter={weatherFilter}
          setWeatherFilter={setWeatherFilter}
          primaryRegion={primaryRegion}
          currentRegion={weatherFilter.region}
          primaryRegionOptions={primaryRegionOptions}
          subRegionOptions={subRegionOptions}
          canSelectSubRegion={canSelectSubRegion}
          selectedWeatherSummary={selectedWeatherSummary}
          onPrimaryRegionChange={setRegion}
          onSubRegionChange={setRegion}
        />
      </aside>

      <section className="workspace-body" aria-label={copy.resultPanel}>
        <CityFinderResultsPanel
          locale={locale}
          temperatureUnit={temperatureUnit}
          copy={copy}
          cityKeyword={cityKeyword}
          resultItems={resultItems}
          visibleResultItems={visibleResultItems}
          selectedCityId={effectiveSelectedCityId}
          visibleRegionCount={visibleRegionCount}
          visibleCount={visibleCount}
          highMatchCityCount={highMatchCityCount}
          loadError={loadError}
          isLoading={shouldShowDashboardLoading}
          isRefreshing={showDashboardRefreshOverlay}
          onCityKeywordChange={setCityKeyword}
          onSelectCity={setSelectedCityId}
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
            tool="city-finder"
            locale={locale}
            layer="comfort"
            resultItems={resultItems}
            regionSummaries={dashboardData?.regionSummaries ?? []}
            dataRegion={dashboardData?.region ?? null}
            temperatureUnit={temperatureUnit}
            activeRegion={weatherFilter.region}
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
