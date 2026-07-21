/**
 * 文件说明: 组织全球天气工具页的筛选状态、城市结果列表、地图和选中城市天气条。
 * 对应文档: docs/product-design.md
 */
'use client';

import * as Slider from '@radix-ui/react-slider';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  MapIcon,
  Mountain,
  Search,
  SlidersHorizontal,
  Snowflake,
  Sun,
  Cloudy,
  ThermometerSun
} from 'lucide-react';
import type {
  MapLayer,
  RegionKey,
  TravelFilter,
  ViewMode,
  WeatherType
} from 'weather-core/types';
import { cityMatchesKeyword } from '@/domain/city-search';
import { getMapRegionLayer, getPrimaryRegionOptions, getRegionGroup, getRegionLabel } from '@/domain/regions';
import {
  type DisplayLocale,
  type TemperatureUnit,
  formatCompactForecastDateLabel,
  formatDateLabel,
  formatCityName,
  formatCityRegion,
  formatCityRegionSegments,
  formatElevation,
  formatHumidity,
  formatTemperature,
  formatTemperatureRange,
  formatWeatherType
} from '@/domain/format';
import {
  applyWeatherPreset,
  allWeatherTypes,
  elevationFilterBounds,
  getWeatherPresetLabel,
  getWeatherTypeLabel,
  humidityFilterBounds,
  temperatureFilterBounds,
  weatherPresets
} from '@/domain/weather';
import { buildTopTabPath, buildToolPath, getToolPathSegment, resolveToolMode, topTabs } from '@/domain/navigation';
import {
  getAlternateLocale,
  readStoredTemperatureUnit,
  saveLocalePreference,
  temperatureUnitChangeEvent
} from '@/domain/site-prefs';
import {
  type WeatherDashboardPayload,
  buildFilterSearch,
  getPrimaryRegionId,
  isDashboardTravelItem,
  isSupportedRegion,
  parseTravelFilterFromSearch,
  readDateFromSearch,
  readLayerFromSearch
} from '@/domain/weather-dashboard-shared';
import { WorldWeatherMap } from './world-weather-map';

type WeatherDashboardProps = {
  locale: DisplayLocale;
  initialMode: ViewMode;
  initialSearch: string;
};

const weatherTypeIcons: Record<WeatherType, React.ReactNode> = {
  sunny: <Sun size={17} />,
  partly_cloudy: <CloudSun size={17} />,
  cloudy: <Cloud size={17} />,
  overcast: <Cloudy size={17} />,
  fog: <CloudFog size={17} />,
  light_rain: <CloudDrizzle size={17} />,
  rain: <CloudRain size={17} />,
  thunderstorm: <CloudLightning size={17} />,
  light_snow: <Snowflake size={17} />,
  snow: <CloudSnow size={17} />
};

const layers: { id: MapLayer; labels: Record<DisplayLocale, string> }[] = [
  { id: 'comfort', labels: { zh: '旅行适合', en: 'Comfort' } },
  { id: 'temperature', labels: { zh: '气温', en: 'Temperature' } },
  { id: 'weather', labels: { zh: '天气', en: 'Weather' } },
  { id: 'precipitation', labels: { zh: '降水', en: 'Rainfall' } },
  { id: 'humidity', labels: { zh: '湿度', en: 'RH' } },
  { id: 'elevation', labels: { zh: '海拔', en: 'Elevation' } }
];

const copy = {
  zh: {
    title: {
      travel: '按天气找城市',
      daily: '全球天气地图'
    },
    filterPanel: '天气筛选',
    resultPanel: '天气结果',
    mapPanel: '地图和选中城市天气',
    language: 'English',
    region: '地区',
    subRegion: '省份/州',
    time: '时间',
    nextDays: (days: number) => `未来 ${days} 天`,
    date: '日期',
    layer: '图层',
    quickFilters: '快速筛选',
    temperature: '气温',
    weather: '天气',
    humidity: '湿度',
    elevation: '海拔',
    all: '全部',
    coverageRegions: '覆盖区域',
    coverageCities: '覆盖城市',
    citySamples: '城市样本',
    highMatchCities: '高匹配城市',
    popularCities: '热门城市',
    citySearch: '搜索城市',
    citySearchPlaceholder: '搜索城市',
    noCityMatches: '没有匹配城市',
    suitableDays: (match: number, total: number) => `${match}/${total} 天适合`,
    average: '平均',
    dryDays: (days: number) => `少雨 ${days} 天`,
    humidityValue: (value: string) => `湿度 ${value}`,
    minTemperature: '最低温度',
    maxTemperature: '最高温度',
    minHumidity: '最低湿度',
    maxHumidity: '最高湿度',
    minElevation: '最低海拔',
    maxElevation: '最高海拔',
    precipitation: (value: number) => `降水 ${value} mm`
  },
  en: {
    title: {
      travel: 'Find cities by weather',
      daily: 'World weather map'
    },
    filterPanel: 'Weather filters',
    resultPanel: 'Weather results',
    mapPanel: 'Map and selected city forecast',
    language: '中文',
    region: 'Region',
    subRegion: 'State/province',
    time: 'Time',
    nextDays: (days: number) => `Next ${days} days`,
    date: 'Date',
    layer: 'Layer',
    quickFilters: 'Quick filters',
    temperature: 'Temperature',
    weather: 'Weather',
    humidity: 'RH',
    elevation: 'Elevation',
    all: 'All',
    coverageRegions: 'Regions',
    coverageCities: 'Cities',
    citySamples: 'City samples',
    highMatchCities: 'High matches',
    popularCities: 'Popular cities',
    citySearch: 'Search cities',
    citySearchPlaceholder: 'Search city',
    noCityMatches: 'No matching cities',
    suitableDays: (match: number, total: number) => `${match}/${total} suitable`,
    average: 'Avg',
    dryDays: (days: number) => `${days} low-rain days`,
    humidityValue: (value: string) => `RH ${value}`,
    minTemperature: 'Minimum temperature',
    maxTemperature: 'Maximum temperature',
    minHumidity: 'Minimum RH',
    maxHumidity: 'Maximum RH',
    minElevation: 'Minimum elevation',
    maxElevation: 'Maximum elevation',
    precipitation: (value: number) => `Rainfall ${value} mm`
  }
};

const regionStorageKey = 'weather-trip-region';
const resultPageSize = 80;

function readModeFromUrl(): ViewMode {
  if (typeof window === 'undefined') return 'travel';

  const mode = window.location.pathname.split('/').filter(Boolean).at(-1);
  return resolveToolMode(mode) ?? 'travel';
}

function readSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

function readSavedRegion(): RegionKey | null {
  if (typeof window === 'undefined') return null;
  const region = window.localStorage.getItem(regionStorageKey);
  return region && isSupportedRegion(region) ? region : null;
}

function saveRegion(region: RegionKey): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(regionStorageKey, region);
}

const modeQueryStorageKey = (mode: ViewMode) =>
  `weather-trip-query-${getToolPathSegment(mode)}`;

function saveModeQuery(mode: ViewMode, search: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(modeQueryStorageKey(mode), search);
}

function readSavedModeQuery(mode: ViewMode): string {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(modeQueryStorageKey(mode)) ?? '';
}

function buildDashboardUrl(
  locale: DisplayLocale,
  mode: ViewMode,
  travelFilter: TravelFilter,
  selectedDate: string,
  layer: MapLayer
): string {
  const search = buildFilterSearch(mode, travelFilter, selectedDate, layer);
  return `${buildToolPath(locale, mode)}${search ? `?${search}` : ''}`;
}

/** 切到另一工具 Tab 时用该 Tab 自己上次保存的 query，不复用当前 Tab 条件。 */
function buildToolTabUrl(locale: DisplayLocale, targetMode: ViewMode, currentMode: ViewMode): string {
  if (targetMode === currentMode) {
    if (typeof window === 'undefined') return buildToolPath(locale, targetMode);
    return `${window.location.pathname}${window.location.search}`;
  }

  const saved = readSavedModeQuery(targetMode);
  return `${buildToolPath(locale, targetMode)}${saved ? `?${saved}` : ''}`;
}

function replaceDashboardUrl(
  locale: DisplayLocale,
  mode: ViewMode,
  travelFilter: TravelFilter,
  selectedDate: string,
  layer: MapLayer
): void {
  const url = new URL(window.location.href);
  const search = buildFilterSearch(mode, travelFilter, selectedDate, layer);
  saveModeQuery(mode, search);
  const nextUrl = `${buildToolPath(locale, mode)}${search ? `?${search}` : ''}${url.hash}`;
  if (`${url.pathname}${url.search}${url.hash}` === nextUrl) return;

  window.history.replaceState(null, '', nextUrl);
}

function buildDashboardApiUrl(
  locale: DisplayLocale,
  mode: ViewMode,
  travelFilter: TravelFilter,
  selectedDate: string,
  layer: MapLayer,
  selectedCityId: string | null
): string {
  const params = new URLSearchParams(buildFilterSearch(mode, travelFilter, selectedDate, layer));
  params.set('locale', locale);
  params.set('mode', mode);
  if (selectedCityId) params.set('selectedCityId', selectedCityId);
  return `/api/weather-dashboard.json?${params.toString()}`;
}

export function WeatherDashboard({ locale, initialMode, initialSearch }: WeatherDashboardProps) {
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>(() => readStoredTemperatureUnit());
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => readDateFromSearch(initialSearch, ''));
  const [layer, setLayer] = useState<MapLayer>(() => readLayerFromSearch(initialSearch));
  const [travelFilter, setTravelFilter] = useState<TravelFilter>(() => parseTravelFilterFromSearch(initialSearch, readSavedRegion()));
  const [cityKeyword, setCityKeyword] = useState('');
  const [dashboardData, setDashboardData] = useState<WeatherDashboardPayload | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visibleResultLimit, setVisibleResultLimit] = useState(resultPageSize);
  const isApplyingPopState = useRef(false);
  const isApplyingPayloadDate = useRef(false);
  const otherLocale = getAlternateLocale(locale);

  const primaryRegionOptions = useMemo(() => getPrimaryRegionOptions(locale), [locale]);
  const primaryRegion = getPrimaryRegionId(travelFilter.region);
  const availableDates = dashboardData?.availableDates ?? [];
  const regionAvailableDates = dashboardData?.regionAvailableDates ?? [];
  const subRegionOptions = dashboardData?.subRegionOptions ?? [{ id: primaryRegion, label: copy[locale].all }];
  const canSelectSubRegion = subRegionOptions.length > 1;
  useEffect(() => {
    const handlePopState = () => {
      isApplyingPopState.current = true;
      const search = readSearch();
      setMode(readModeFromUrl());
      setTravelFilter(parseTravelFilterFromSearch(search, readSavedRegion()));
      setSelectedDate(readDateFromSearch(search, availableDates[0] ?? ''));
      setLayer(readLayerFromSearch(search));
      setSelectedCityId(null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [availableDates]);

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

  useEffect(() => {
    if (isApplyingPopState.current) {
      isApplyingPopState.current = false;
      return;
    }
    replaceDashboardUrl(locale, mode, travelFilter, selectedDate, layer);
  }, [layer, locale, mode, selectedDate, travelFilter]);

  useEffect(() => {
    if (isApplyingPayloadDate.current) {
      isApplyingPayloadDate.current = false;
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsLoadingData(true);
      try {
        const response = await fetch(buildDashboardApiUrl(locale, mode, travelFilter, selectedDate, layer, selectedCityId), {
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Weather data request failed with ${response.status}.`);
        const payload = (await response.json()) as WeatherDashboardPayload;
        setDashboardData(payload);
        setLoadError(null);
        if (payload.selectedDate && payload.selectedDate !== selectedDate) {
          isApplyingPayloadDate.current = true;
          setSelectedDate(payload.selectedDate);
        }
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
  }, [layer, locale, mode, selectedCityId, selectedDate, travelFilter]);

  const resultItems = useMemo(() => {
    return (dashboardData?.resultItems ?? []).filter((item) => cityMatchesKeyword(item.city, cityKeyword));
  }, [cityKeyword, dashboardData?.resultItems]);
  const visibleResultItems = resultItems.slice(0, visibleResultLimit);
  const selectedResultItem = resultItems.find((item) => item.city.id === selectedCityId) ?? resultItems[0];
  const selectedCity = selectedResultItem?.city;
  const selectedForecasts = dashboardData?.selectedCityForecasts ?? [];
  const effectiveSelectedCityId = selectedCity?.id ?? null;
  const selectedDateIndex = Math.max(0, regionAvailableDates.indexOf(selectedDate));
  const selectedWeatherSummary =
    travelFilter.weatherTypes.length === allWeatherTypes.length
      ? copy[locale].all
      : travelFilter.weatherTypes.map((type) => getWeatherTypeLabel(type, locale)).join(locale === 'zh' ? '、' : ', ');

  const visibleCount = resultItems.length;
  const visibleRegionCount = dashboardData?.regionSummaries.length ?? 0;
  const excellentCount =
    mode === 'travel'
      ? resultItems.filter((item) => isDashboardTravelItem(item) && item.matchDays / Math.max(item.totalDays, 1) >= 0.7).length
      : resultItems.length;

  useEffect(() => {
    setVisibleResultLimit(resultPageSize);
  }, [cityKeyword, dashboardData?.resultItems, mode]);

  useEffect(() => {
    if (!cityKeyword) return;
    const firstResultCityId = resultItems[0]?.city.id ?? null;
    const selectedCityIsVisible = Boolean(selectedCityId && resultItems.some((item) => item.city.id === selectedCityId));
    if (firstResultCityId && !selectedCityIsVisible) setSelectedCityId(firstResultCityId);
  }, [cityKeyword, resultItems, selectedCityId]);

  const setRegion = useCallback(
    (region: RegionKey) => {
      setTravelFilter((current) => ({ ...current, region }));
      saveRegion(region);
      setSelectedCityId(null);
    },
    []
  );

  const setPrimaryRegion = useCallback(
    (region: RegionKey) => {
      setRegion(region);
    },
    [setRegion]
  );

  const setSubRegion = useCallback(
    (region: RegionKey) => {
      setRegion(region);
    },
    [setRegion]
  );

  const toggleWeatherType = useCallback((type: WeatherType) => {
    setTravelFilter((current) => {
      const exists = current.weatherTypes.includes(type);
      const weatherTypes = exists ? current.weatherTypes.filter((item) => item !== type) : [...current.weatherTypes, type];
      return { ...current, weatherTypes: weatherTypes.length > 0 ? weatherTypes : current.weatherTypes };
    });
  }, []);

  return (
    <main className="app-shell">
      <header className="site-nav app-site-nav">
        <a className="brand" href={buildTopTabPath(locale, 'landing')}>Weather Trip</a>
        <nav className="tabs" aria-label="Weather Trip">
          {topTabs.map((tab) => {
            const href =
              tab.id === 'landing'
                ? buildTopTabPath(locale, tab.id)
                : buildToolTabUrl(locale, tab.id === 'weather-map' ? 'daily' : 'travel', mode);
            const active = tab.id !== 'landing' && tab.id === getToolPathSegment(mode);

            return (
              <a key={tab.id} className={active ? 'is-active' : ''} href={href}>
                {tab.labels[locale]}
              </a>
            );
          })}
        </nav>
        <div className="nav-actions">
          <button
            type="button"
            className="nav-icon-btn"
            data-unit-toggle
            aria-label={locale === 'zh' ? '切换摄氏度与华氏度' : 'Switch Celsius / Fahrenheit'}
            aria-pressed={temperatureUnit === 'f'}
            title={locale === 'zh' ? '切换摄氏度与华氏度' : 'Switch Celsius / Fahrenheit'}
          >
            <span className="unit-label" data-unit-label suppressHydrationWarning>
              {temperatureUnit === 'f' ? '°F' : '°C'}
            </span>
          </button>
          <a
            className="nav-icon-btn"
            href={buildDashboardUrl(otherLocale, mode, travelFilter, selectedDate, layer)}
            data-locale-link={otherLocale}
            aria-label={copy[locale].language}
            title={copy[locale].language}
          >
            <svg
              className="nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path>
              <path d="M2 12h20"></path>
            </svg>
          </a>
        </div>
      </header>
      <section className="workspace">
        <aside className="filter-panel" aria-label={copy[locale].filterPanel}>
          <section className="control-surface" aria-label={copy[locale].filterPanel}>
            <div className="filter-grid">
              <label className="field">
                <span>
                  <SlidersHorizontal size={15} />
                  {copy[locale].region}
                </span>
                <select value={primaryRegion} onChange={(event) => setPrimaryRegion(event.target.value as RegionKey)}>
                  {Array.from(new Set(primaryRegionOptions.map((option) => getRegionGroup(option, locale)))).map((group) => (
                    <optgroup key={group} label={group}>
                      {primaryRegionOptions
                        .filter((option) => getRegionGroup(option, locale) === group)
                        .map((region) => (
                          <option key={region.id} value={region.id}>
                            {getRegionLabel(region, locale)}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label className={`field ${canSelectSubRegion ? '' : 'is-disabled'}`}>
                <span>
                  <MapIcon size={15} />
                  {copy[locale].subRegion}
                </span>
                <select
                  value={canSelectSubRegion ? travelFilter.region : primaryRegion}
                  disabled={!canSelectSubRegion}
                  onChange={(event) => setSubRegion(event.target.value as RegionKey)}
                >
                  {subRegionOptions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="filter-grid">
              {mode === 'travel' ? (
                <label className="field time-field">
                  <span>
                    <CalendarDays size={15} />
                    {copy[locale].time}
                  </span>
                  <select
                    value={travelFilter.dateWindowDays}
                    onChange={(event) =>
                      setTravelFilter((current) => ({ ...current, dateWindowDays: Number(event.target.value) }))
                    }
                  >
                    <option value={3}>{copy[locale].nextDays(3)}</option>
                    <option value={5}>{copy[locale].nextDays(5)}</option>
                    <option value={7}>{copy[locale].nextDays(7)}</option>
                    <option value={10}>{copy[locale].nextDays(10)}</option>
                    <option value={14}>{copy[locale].nextDays(14)}</option>
                  </select>
                </label>
              ) : (
                <>
                  <div className="field date-slider-field">
                    <span>
                      <CalendarDays size={15} />
                      {copy[locale].date} {selectedDate ? formatDateLabel(selectedDate, locale) : ''}
                    </span>
                    <Slider.Root
                      className="date-slider"
                      value={[selectedDateIndex]}
                      min={0}
                      max={Math.max(regionAvailableDates.length - 1, 0)}
                      step={1}
                      disabled={regionAvailableDates.length <= 1}
                      onValueChange={([dateIndex]) => setSelectedDate(regionAvailableDates[dateIndex] ?? selectedDate)}
                    >
                      <Slider.Track className="date-slider-track">
                        <Slider.Range className="date-slider-range" />
                      </Slider.Track>
                      <Slider.Thumb className="date-slider-thumb" aria-label={copy[locale].date} />
                    </Slider.Root>
                  </div>
                  <div className="field layer-field">
                    <span>
                      <MapIcon size={15} />
                      {copy[locale].layer}
                    </span>
                    <div className="layer-button-row" aria-label={copy[locale].layer}>
                      {layers.map((item) => (
                        <button
                          key={item.id}
                          className={layer === item.id ? 'is-active' : ''}
                          type="button"
                          onClick={() => setLayer(item.id)}
                        >
                          {item.labels[locale]}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {mode === 'travel' ? (
              <div className="filter-group">
                <span className="filter-group-title">{copy[locale].quickFilters}</span>
                <div className="preset-row" aria-label={copy[locale].quickFilters}>
                  {weatherPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setTravelFilter((current) => applyWeatherPreset(current, preset))}
                    >
                      {getWeatherPresetLabel(preset, locale)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {mode === 'travel' ? (
              <div className="filter-group">
                <label className="filter-check">
                  <input
                    type="checkbox"
                    checked={travelFilter.useTemperature}
                    onChange={(event) =>
                      setTravelFilter((current) => ({ ...current, useTemperature: event.target.checked }))
                    }
                  />
                  <span className="filter-heading-label">
                    <ThermometerSun size={15} />
                    {copy[locale].temperature}
                  </span>
                  <small className="filter-heading-value">
                    {formatTemperature(travelFilter.temperatureMinC, temperatureUnit)} -{' '}
                    {formatTemperature(travelFilter.temperatureMaxC, temperatureUnit)}
                  </small>
                </label>
                <div className={`range-field ${travelFilter.useTemperature ? '' : 'is-disabled'}`}>
                  <Slider.Root
                    className="temperature-slider"
                    value={[travelFilter.temperatureMinC, travelFilter.temperatureMaxC]}
                    min={temperatureFilterBounds.minC}
                    max={temperatureFilterBounds.maxC}
                    step={1}
                    minStepsBetweenThumbs={1}
                    disabled={!travelFilter.useTemperature}
                    onValueChange={([temperatureMinC, temperatureMaxC]) =>
                      setTravelFilter((current) => ({
                        ...current,
                        temperatureMinC,
                        temperatureMaxC
                      }))
                    }
                  >
                    <Slider.Track className="temperature-slider-track">
                      <Slider.Range className="temperature-slider-range" />
                    </Slider.Track>
                    <Slider.Thumb className="temperature-slider-thumb" aria-label={copy[locale].minTemperature} />
                    <Slider.Thumb className="temperature-slider-thumb" aria-label={copy[locale].maxTemperature} />
                  </Slider.Root>
                </div>
              </div>
            ) : null}

            {mode === 'travel' ? (
              <div className="filter-group">
                <label className="filter-check">
                  <input
                    type="checkbox"
                    checked={travelFilter.useWeather}
                    onChange={(event) => setTravelFilter((current) => ({ ...current, useWeather: event.target.checked }))}
                  />
                  <span className="filter-heading-label">
                    <CloudSun size={15} />
                    {copy[locale].weather}
                  </span>
                  <small className="filter-heading-value">{selectedWeatherSummary}</small>
                </label>
                <div className={`weather-chip-row ${travelFilter.useWeather ? '' : 'is-disabled'}`} aria-label={copy[locale].weather}>
                  {allWeatherTypes.map((type) => (
                    <button
                      key={type}
                      className={travelFilter.weatherTypes.includes(type) ? 'is-selected' : ''}
                      type="button"
                      title={getWeatherTypeLabel(type, locale)}
                      aria-label={getWeatherTypeLabel(type, locale)}
                      disabled={!travelFilter.useWeather}
                      onClick={() => toggleWeatherType(type)}
                    >
                      {weatherTypeIcons[type]}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {mode === 'travel' ? (
              <div className="filter-group">
                <label className="filter-check">
                  <input
                    type="checkbox"
                    checked={travelFilter.useHumidity}
                    onChange={(event) =>
                      setTravelFilter((current) => ({ ...current, useHumidity: event.target.checked }))
                    }
                  />
                  <span className="filter-heading-label">
                    <Droplets size={15} />
                    {copy[locale].humidity}
                  </span>
                  <small className="filter-heading-value">
                    {formatHumidity(travelFilter.humidityMinPercent)} - {formatHumidity(travelFilter.humidityMaxPercent)}
                  </small>
                </label>
                <div className={`range-field ${travelFilter.useHumidity ? '' : 'is-disabled'}`}>
                  <Slider.Root
                    className="humidity-slider"
                    value={[travelFilter.humidityMinPercent, travelFilter.humidityMaxPercent]}
                    min={humidityFilterBounds.minPercent}
                    max={humidityFilterBounds.maxPercent}
                    step={1}
                    minStepsBetweenThumbs={1}
                    disabled={!travelFilter.useHumidity}
                    onValueChange={([humidityMinPercent, humidityMaxPercent]) =>
                      setTravelFilter((current) => ({
                        ...current,
                        humidityMinPercent,
                        humidityMaxPercent
                      }))
                    }
                  >
                    <Slider.Track className="humidity-slider-track">
                      <Slider.Range className="humidity-slider-range" />
                    </Slider.Track>
                    <Slider.Thumb className="humidity-slider-thumb" aria-label={copy[locale].minHumidity} />
                    <Slider.Thumb className="humidity-slider-thumb" aria-label={copy[locale].maxHumidity} />
                  </Slider.Root>
                </div>
              </div>
            ) : null}

            {mode === 'travel' ? (
              <div className="filter-group">
                <label className="filter-check">
                  <input
                    type="checkbox"
                    checked={travelFilter.useElevation}
                    onChange={(event) =>
                      setTravelFilter((current) => ({ ...current, useElevation: event.target.checked }))
                    }
                  />
                  <span className="filter-heading-label">
                    <Mountain size={15} />
                    {copy[locale].elevation}
                  </span>
                  <small className="filter-heading-value">
                    {formatElevation(travelFilter.elevationMinMeters, locale)} - {formatElevation(travelFilter.elevationMaxMeters, locale)}
                  </small>
                </label>
                <div className={`range-field ${travelFilter.useElevation ? '' : 'is-disabled'}`}>
                  <Slider.Root
                    className="elevation-slider"
                    value={[travelFilter.elevationMinMeters, travelFilter.elevationMaxMeters]}
                    min={elevationFilterBounds.minMeters}
                    max={elevationFilterBounds.maxMeters}
                    step={100}
                    minStepsBetweenThumbs={1}
                    disabled={!travelFilter.useElevation}
                    onValueChange={([elevationMinMeters, elevationMaxMeters]) =>
                      setTravelFilter((current) => ({
                        ...current,
                        elevationMinMeters,
                        elevationMaxMeters
                      }))
                    }
                  >
                    <Slider.Track className="elevation-slider-track">
                      <Slider.Range className="elevation-slider-range" />
                    </Slider.Track>
                    <Slider.Thumb className="elevation-slider-thumb" aria-label={copy[locale].minElevation} />
                    <Slider.Thumb className="elevation-slider-thumb" aria-label={copy[locale].maxElevation} />
                  </Slider.Root>
                </div>
              </div>
            ) : null}
          </section>
        </aside>

        <aside className="results-panel" aria-label={copy[locale].resultPanel}>
          <div className="summary-grid">
            <div>
              <span>{visibleRegionCount > 0 ? copy[locale].coverageRegions : copy[locale].coverageCities}</span>
              <strong>{visibleRegionCount > 0 ? visibleRegionCount : visibleCount}</strong>
            </div>
            <div>
              <span>{copy[locale].citySamples}</span>
              <strong>{visibleCount}</strong>
            </div>
            <div>
              <span>{mode === 'travel' ? copy[locale].highMatchCities : copy[locale].popularCities}</span>
              <strong>{excellentCount}</strong>
            </div>
          </div>

          <label className="city-search-field">
            <span className="sr-only">{copy[locale].citySearch}</span>
            <Search size={16} aria-hidden="true" />
            <input
              value={cityKeyword}
              onChange={(event) => setCityKeyword(event.target.value)}
              type="search"
              placeholder={copy[locale].citySearchPlaceholder}
              aria-label={copy[locale].citySearch}
            />
          </label>

          {loadError ? <div className="data-status">{loadError}</div> : null}
          {isLoadingData && !dashboardData ? (
            <div className="empty-results">{locale === 'zh' ? '正在加载天气数据' : 'Loading weather data'}</div>
          ) : resultItems.length > 0 ? (
            <div className="ranking-list-frame">
              <ol className="ranking-list">
                {visibleResultItems.map((item) => {
                  const city = item.city;
                  const active = effectiveSelectedCityId === city.id;
                  const primary = isDashboardTravelItem(item)
                    ? copy[locale].suitableDays(item.matchDays, item.totalDays)
                    : formatTemperatureRange(item.forecast.temperatureMinC, item.forecast.temperatureMaxC, locale, temperatureUnit);
                  const secondary = isDashboardTravelItem(item)
                    ? `${copy[locale].average} ${formatTemperature(item.averageTemperatureC, temperatureUnit)} · ${copy[locale].dryDays(
                        item.totalDays - item.rainDays
                      )}`
                    : `${formatWeatherType(item.forecast.weatherType, locale)} · ${copy[locale].humidityValue(
                        formatHumidity(item.forecast.humidityMeanPercent)
                      )}`;

                  return (
                    <li key={city.id}>
                      <button className={active ? 'is-active' : ''} type="button" onClick={() => setSelectedCityId(city.id)}>
                        <span className="city-name-line">{formatCityName(city, locale)}</span>
                        <span className="city-result-meta">
                          <small className="city-region-label">{formatCityRegion(city, locale)}</small>
                          <small className="city-weather-label">{secondary}</small>
                          <b>{primary}</b>
                        </span>
                      </button>
                    </li>
                  );
                })}
                {visibleResultLimit < resultItems.length ? (
                  <li className="load-more-results-item">
                    <button
                      className="load-more-results"
                      type="button"
                      onClick={() => setVisibleResultLimit((current) => current + resultPageSize)}
                    >
                      {locale === 'zh' ? `加载更多 ${Math.min(resultPageSize, resultItems.length - visibleResultLimit)} 个` : `Load ${Math.min(
                        resultPageSize,
                        resultItems.length - visibleResultLimit
                      )} more`}
                    </button>
                  </li>
                ) : null}
              </ol>
            </div>
          ) : (
            <div className="empty-results">{copy[locale].noCityMatches}</div>
          )}
        </aside>

        <section className="map-column" aria-label={copy[locale].mapPanel}>
          {selectedCity ? (
            <section className="map-forecast-panel" aria-label={locale === 'zh' ? '选中城市天气' : 'Selected city forecast'}>
              <div className="map-forecast-heading">
                <strong>{formatCityName(selectedCity, locale)}</strong>
                <span>{[...formatCityRegionSegments(selectedCity, locale), formatElevation(selectedCity.elevationMeters, locale)].join(' · ')}</span>
              </div>
              <div className="forecast-strip">
                {selectedForecasts.slice(0, 14).map((forecast) => (
                  <div key={`${forecast.cityId}-${forecast.date}`} className="forecast-day">
                    <div className="forecast-day-heading">
                      <span>{formatCompactForecastDateLabel(forecast.date, locale)}</span>
                      <span
                        className="forecast-icon"
                        title={formatWeatherType(forecast.weatherType, locale)}
                        aria-label={formatWeatherType(forecast.weatherType, locale)}
                      >
                        {weatherTypeIcons[forecast.weatherType]}
                      </span>
                    </div>
                    <div
                      className="forecast-day-values"
                      title={`${formatWeatherType(forecast.weatherType, locale)} · ${copy[locale].humidityValue(formatHumidity(
                        forecast.humidityMeanPercent
                      ))} · ${copy[locale].precipitation(forecast.precipitationSumMm)}`}
                    >
                      <strong>{formatTemperatureRange(forecast.temperatureMinC, forecast.temperatureMaxC, locale, temperatureUnit)}</strong>
                      <small
                        className="forecast-humidity"
                        title={copy[locale].humidityValue(formatHumidity(forecast.humidityMeanPercent))}
                        aria-label={copy[locale].humidityValue(formatHumidity(forecast.humidityMeanPercent))}
                      >
                        <Droplets size={13} aria-hidden="true" />
                        <span>{formatHumidity(forecast.humidityMeanPercent)}</span>
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <WorldWeatherMap
            mode={mode}
            locale={locale}
            layer={layer}
            resultItems={resultItems}
            regionSummaries={dashboardData?.regionSummaries ?? []}
            temperatureUnit={temperatureUnit}
            activeRegion={travelFilter.region}
            regionLayer={getMapRegionLayer(travelFilter.region)}
            selectedCityId={effectiveSelectedCityId}
            onSelectCity={setSelectedCityId}
          />
        </section>
      </section>
    </main>
  );
}
