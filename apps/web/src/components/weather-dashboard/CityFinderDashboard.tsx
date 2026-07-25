/**
 * 文件说明: 承载 City Finder 页面自己的筛选状态、城市匹配请求、结果列表、十四天预报和地图联动。
 * 对应文档: docs/product-design.md
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DailyForecast, RegionKey, WeatherFilter } from 'weather-core/types';
import { cityMatchesKeyword } from '@/domain/city-search';
import { type DisplayLocale } from '@/domain/format';
import { dayMatchesFilter } from '@/domain/scoring';
import { getMessages } from '@/i18n';
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
import type { CityFocusRequest } from '../WorldWeatherMap/types';
import {
  readInitialToolSearch,
  readSearch,
  replaceToolUrl,
  saveToolSearch
} from './dashboardApi';
import { useDelayedFlag, useRegionOptions, useSelectedCityForecasts, useTemperatureUnitPreference } from './dashboardHooks';
import { CityFinderResultsPanel } from './CityFinderResultsPanel';
import { ForecastPanel } from './ForecastPanel';

type CityFinderDashboardProps = {
  locale: DisplayLocale;
  initialSearch: string;
};

export function CityFinderDashboard({ locale, initialSearch }: CityFinderDashboardProps) {
  const copy = getMessages(locale).dashboard;
  const temperatureUnit = useTemperatureUnitPreference(locale);
  const [weatherFilter, setWeatherFilter] = useState<WeatherFilter>(() => parseWeatherFilterFromSearch(initialSearch));
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [cityFocusRequest, setCityFocusRequest] = useState<CityFocusRequest | null>(null);
  const [listFocusRequest, setListFocusRequest] = useState<CityFocusRequest | null>(null);
  const [cityKeyword, setCityKeyword] = useState('');
  const [dashboardData, setDashboardData] = useState<WeatherToolPayload | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isBrowserReady, setIsBrowserReady] = useState(false);
  const isApplyingPopState = useRef(false);
  const isRestoringSavedState = useRef(false);
  const cityFocusRequestId = useRef(0);
  const listFocusRequestId = useRef(0);
  const primaryRegion = getPrimaryRegionId(weatherFilter.region);
  const { primaryRegionOptions, subRegionOptions } = useRegionOptions(locale, primaryRegion, isBrowserReady);
  const canSelectSubRegion = subRegionOptions.length > 1;

  useEffect(() => {
    const { search, restoredFromStorage } = readInitialToolSearch('city-finder', initialSearch);
    if (!restoredFromStorage) saveToolSearch('city-finder', search);
    isRestoringSavedState.current = restoredFromStorage;
    setWeatherFilter(parseWeatherFilterFromSearch(search));
    setIsBrowserReady(true);
  }, [initialSearch]);

  useEffect(() => {
    const handlePopState = () => {
      isApplyingPopState.current = true;
      const search = readSearch();
      saveToolSearch('city-finder', search);
      setWeatherFilter(parseWeatherFilterFromSearch(search));
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
    if (isRestoringSavedState.current) {
      isRestoringSavedState.current = false;
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
  const selectedResultItem = (dashboardData?.resultItems ?? []).find((item) => item.city.id === selectedCityId);
  const selectedCity = selectedResultItem?.city;
  const selectedMatchSummary = selectedResultItem && isDashboardCityFinderItem(selectedResultItem)
    ? copy.matchingFilterDays(selectedResultItem.matchDays, selectedResultItem.totalDays)
    : undefined;
  const selectedCityMatchesElevation =
    !selectedCity ||
    !weatherFilter.useElevation ||
    (selectedCity.elevationMeters >= weatherFilter.elevationMinMeters && selectedCity.elevationMeters <= weatherFilter.elevationMaxMeters);
  const { forecasts: selectedForecasts, isLoading: isLoadingCityForecast } = useSelectedCityForecasts(
    locale,
    selectedCityId,
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
  const highMatchCityCount = resultItems.filter(
    (item) => isDashboardCityFinderItem(item) && item.matchDays / Math.max(item.totalDays, 1) >= 0.7
  ).length;

  useEffect(() => {
    if (selectedCityId !== null) return;
    const firstCityId = resultItems[0]?.city.id;
    if (firstCityId) setSelectedCityId(firstCityId);
  }, [resultItems, selectedCityId]);

  const setRegion = useCallback((region: RegionKey) => {
    setWeatherFilter((current) => ({ ...current, region }));
  }, []);
  const selectCityFromResults = useCallback((cityId: string) => {
    cityFocusRequestId.current += 1;
    setSelectedCityId(cityId);
    setCityFocusRequest({ cityId, requestId: cityFocusRequestId.current });
  }, []);
  const selectCityFromMap = useCallback((cityId: string) => {
    listFocusRequestId.current += 1;
    setSelectedCityId(cityId);
    setListFocusRequest({ cityId, requestId: listFocusRequestId.current });
  }, []);
  const getSelectedForecastMatchState = useCallback(
    (forecast: DailyForecast, forecastIndex: number) =>
      selectedCityMatchesElevation &&
      forecastIndex < weatherFilter.dateWindowDays &&
      dayMatchesFilter(forecast, weatherFilter),
    [selectedCityMatchesElevation, weatherFilter]
  );

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

      <section className="workspace-body map-first-workspace-body" aria-label={copy.resultPanel}>
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
            selectedCityId={selectedCityId}
            cityFocusRequest={cityFocusRequest}
            onSelectCity={selectCityFromMap}
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

        <CityFinderResultsPanel
          locale={locale}
          temperatureUnit={temperatureUnit}
          copy={copy}
          cityKeyword={cityKeyword}
          resultItems={resultItems}
          selectedCityId={selectedCityId}
          listFocusRequest={listFocusRequest}
          visibleCount={visibleCount}
          highMatchCityCount={highMatchCityCount}
          loadError={loadError}
          isLoading={shouldShowDashboardLoading}
          isRefreshing={showDashboardRefreshOverlay}
          onCityKeywordChange={setCityKeyword}
          onSelectCity={selectCityFromResults}
        />

        <ForecastPanel
          locale={locale}
          temperatureUnit={temperatureUnit}
          copy={copy}
          city={selectedCity}
          matchSummary={selectedMatchSummary}
          getForecastMatchState={getSelectedForecastMatchState}
          forecasts={selectedForecasts}
          isLoading={shouldShowForecastLoading}
          isRefreshing={showForecastRefreshOverlay}
        />
      </section>
    </section>
  );
}
