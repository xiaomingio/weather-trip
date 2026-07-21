/**
 * 文件说明: 组织全球天气工具页的筛选状态、城市结果列表、地图和选中城市天气条。
 * 对应文档: docs/product-design.md
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Search,
  Snowflake,
  Sun,
  Cloudy
} from 'lucide-react';
import type {
  DailyForecast,
  MapLayer,
  RegionKey,
  TravelFilter,
  ViewMode,
  WeatherType
} from 'weather-core/types';
import { cityMatchesKeyword } from '@/domain/city-search';
import { getMapRegionLayer, getPrimaryRegionOptions } from '@/domain/regions';
import {
  type DisplayLocale,
  type TemperatureUnit,
  formatCompactForecastDateLabel,
  formatCityName,
  formatCityRegion,
  formatCityRegionSegments,
  formatElevation,
  formatHumidity,
  formatTemperature,
  formatTemperatureRange,
  formatWeatherType
} from '@/domain/format';
import { allWeatherTypes, getWeatherTypeLabel } from '@/domain/weather';
import { buildToolPath, buildTopTabPath, getToolPathSegment, resolveToolMode } from '@/domain/navigation';
import {
  getAlternateLocale,
  readStoredTemperatureUnit,
  saveLocalePreference,
  temperatureUnitChangeEvent
} from '@/domain/site-prefs';
import {
  type DashboardDailyResultItem,
  type WeatherDashboardPayload,
  buildFilterSearch,
  getPrimaryRegionId,
  isDashboardTravelItem,
  isSupportedRegion,
  parseTravelFilterFromSearch,
  readDateFromSearch,
  readLayerFromSearch
} from '@/domain/weather-dashboard-shared';
import { DailyMapFilterDock, TravelFilterDock } from './weather-filter-docks';
import { WorldWeatherMap } from './world-weather-map';

type WeatherDashboardProps = {
  locale: DisplayLocale;
  initialMode: ViewMode;
  initialSearch: string;
};

type DailySortKey = MapLayer | 'population';
type SortDirection = 'asc' | 'desc';

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
  { id: 'weather', labels: { zh: '天气', en: 'Weather' } },
  { id: 'temperature', labels: { zh: '气温', en: 'Temperature' } },
  { id: 'humidity', labels: { zh: '湿度', en: 'Humidity' } },
  { id: 'precipitation', labels: { zh: '降水', en: 'Rainfall' } },
  { id: 'wind', labels: { zh: '风速', en: 'Wind' } },
  { id: 'elevation', labels: { zh: '海拔', en: 'Elevation' } },
  { id: 'comfort', labels: { zh: '舒适度', en: 'Comfort' } }
];

const dailySortOptions: { id: DailySortKey; labels: Record<DisplayLocale, string> }[] = [
  { id: 'population', labels: { zh: '人口', en: 'Population' } },
  ...layers
];

const dailySortDirections: Record<DailySortKey, SortDirection> = {
  population: 'desc',
  weather: 'asc',
  temperature: 'desc',
  humidity: 'asc',
  precipitation: 'asc',
  wind: 'asc',
  elevation: 'asc',
  comfort: 'desc'
};

const weatherSortRank: Record<WeatherType, number> = {
  sunny: 0,
  partly_cloudy: 1,
  cloudy: 2,
  overcast: 3,
  fog: 4,
  light_rain: 5,
  rain: 6,
  thunderstorm: 7,
  light_snow: 8,
  snow: 9
};

const copy = {
  zh: {
    title: {
      travel: '按天气找城市',
      daily: '全球天气地图'
    },
    filterPanel: '天气筛选',
    resultPanel: '天气结果',
    forecastPanel: '选中城市天气',
    mapPanel: '地图',
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
    sort: '排序',
    sortAscending: '升序',
    sortDescending: '降序',
    coverageRegions: '覆盖区域',
    coverageCities: '覆盖城市',
    citySamples: '城市样本',
    highMatchCities: '高匹配城市',
    citySearch: '搜索城市',
    citySearchPlaceholder: '搜索城市',
    noCityMatches: '没有匹配城市',
    loadingWeatherData: '正在加载天气数据',
    noForecastData: '暂无城市天气',
    noMapData: '暂无地图数据',
    suitableDays: (match: number, total: number) => `${match}/${total} 天适合`,
    average: '平均',
    dryDays: (days: number) => `少雨 ${days} 天`,
    humidityValue: (value: string) => `湿度 ${value}`,
    forecastHumidity: '湿度',
    forecastPrecipitation: '雨量',
    forecastPrecipitationProbability: '雨率',
    forecastWind: '风力',
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
    forecastPanel: 'Selected city forecast',
    mapPanel: 'Map',
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
    sort: 'Sort',
    sortAscending: 'Ascending',
    sortDescending: 'Descending',
    coverageRegions: 'Regions',
    coverageCities: 'Cities',
    citySamples: 'City samples',
    highMatchCities: 'High matches',
    citySearch: 'Search cities',
    citySearchPlaceholder: 'Search city',
    noCityMatches: 'No matching cities',
    loadingWeatherData: 'Loading weather data',
    noForecastData: 'No city forecast',
    noMapData: 'No map data',
    suitableDays: (match: number, total: number) => `${match}/${total} suitable`,
    average: 'Avg',
    dryDays: (days: number) => `${days} low-rain days`,
    humidityValue: (value: string) => `RH ${value}`,
    forecastHumidity: 'RH',
    forecastPrecipitation: 'PCPN',
    forecastPrecipitationProbability: 'POP',
    forecastWind: 'WSPD',
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
const resultPageSize = 50;

function formatDailyLayerMetric(
  item: DashboardDailyResultItem,
  layer: MapLayer,
  locale: DisplayLocale,
  temperatureUnit: TemperatureUnit
): string {
  if (layer === 'weather') return formatWeatherType(item.forecast.weatherType, locale);
  if (layer === 'temperature') return formatTemperature(item.forecast.temperatureMeanC, temperatureUnit);
  if (layer === 'humidity') return formatHumidity(item.forecast.humidityMeanPercent);
  if (layer === 'precipitation') return `${item.forecast.precipitationSumMm.toFixed(1)} mm`;
  if (layer === 'wind') return `${Math.round(item.forecast.windSpeedMaxKmh ?? 0)} km/h`;
  if (layer === 'elevation') return formatElevation(item.city.elevationMeters, locale);
  return `${Math.round(item.comfortScore * 100)}%`;
}

function dailySortValue(item: DashboardDailyResultItem, sortKey: DailySortKey): number {
  if (sortKey === 'population') return item.city.population ?? 0;
  if (sortKey === 'weather') return weatherSortRank[item.forecast.weatherType];
  if (sortKey === 'temperature') return item.forecast.temperatureMeanC;
  if (sortKey === 'humidity') return item.forecast.humidityMeanPercent;
  if (sortKey === 'precipitation') return item.forecast.precipitationSumMm;
  if (sortKey === 'wind') return item.forecast.windSpeedMaxKmh ?? 0;
  if (sortKey === 'elevation') return item.city.elevationMeters;
  return item.comfortScore;
}

function sortDailyItems(
  items: DashboardDailyResultItem[],
  sortKey: DailySortKey,
  direction: SortDirection,
  locale: DisplayLocale
): DashboardDailyResultItem[] {
  return [...items].sort((left, right) => {
    const leftValue = dailySortValue(left, sortKey);
    const rightValue = dailySortValue(right, sortKey);

    if (rightValue !== leftValue) return direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;

    const populationComparison = (right.city.population ?? 0) - (left.city.population ?? 0);
    if (populationComparison !== 0) return populationComparison;
    return formatCityName(left.city, locale).localeCompare(formatCityName(right.city, locale), locale === 'zh' ? 'zh-CN' : 'en-US');
  });
}

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

function formatPrecipitation(value: number): string {
  return `${value.toFixed(value > 0 && value < 1 ? 1 : 0)} mm`;
}

function formatPrecipitationProbability(value: number | undefined): string | null {
  return typeof value === 'number' ? `${Math.round(value)}%` : null;
}

function formatWindSpeed(value: number | undefined): string | null {
  return typeof value === 'number' ? `${Math.round(value)} km/h` : null;
}

function temperatureToneClass(valueC: number): string {
  if (valueC < 0) return 'is-freezing';
  if (valueC < 12) return 'is-cold';
  if (valueC < 24) return 'is-mild';
  if (valueC < 32) return 'is-warm';
  return 'is-hot';
}

function buildForecastDayTitle(
  cityName: string,
  forecast: DailyForecast,
  locale: DisplayLocale,
  temperatureUnit: TemperatureUnit
): string {
  const precipitationProbability = formatPrecipitationProbability(forecast.precipitationProbabilityMax);
  const windSpeed = formatWindSpeed(forecast.windSpeedMaxKmh);
  const labels =
    locale === 'zh'
      ? {
          temperature: '气温',
          averageTemperature: '平均气温',
          humidity: '湿度',
          precipitation: '雨量',
          precipitationProbability: '降雨概率',
          wind: '风力'
        }
      : {
          temperature: 'Temperature',
          averageTemperature: 'Average temperature',
          humidity: 'Relative humidity',
          precipitation: 'Precipitation',
          precipitationProbability: 'Probability of precipitation',
          wind: 'Wind speed'
        };

  return [
    cityName,
    `${formatCompactForecastDateLabel(forecast.date, locale)} · ${formatWeatherType(forecast.weatherType, locale)}`,
    `${labels.temperature}: ${formatTemperatureRange(forecast.temperatureMinC, forecast.temperatureMaxC, locale, temperatureUnit)}`,
    `${labels.averageTemperature}: ${formatTemperature(forecast.temperatureMeanC, temperatureUnit)}`,
    `${labels.humidity}: ${formatHumidity(forecast.humidityMeanPercent)}`,
    `${labels.precipitation}: ${formatPrecipitation(forecast.precipitationSumMm)}`,
    precipitationProbability ? `${labels.precipitationProbability}: ${precipitationProbability}` : null,
    windSpeed ? `${labels.wind}: ${windSpeed}` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

export function WeatherDashboard({ locale, initialMode, initialSearch }: WeatherDashboardProps) {
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>(() => readStoredTemperatureUnit());
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => readDateFromSearch(initialSearch, ''));
  const [layer, setLayer] = useState<MapLayer>(() => readLayerFromSearch(initialSearch));
  const [dailySortKey, setDailySortKey] = useState<DailySortKey>(() => readLayerFromSearch(initialSearch));
  const [dailySortDirection, setDailySortDirection] = useState<SortDirection>(() => dailySortDirections[readLayerFromSearch(initialSearch)]);
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
    const localeLink = document.querySelector<HTMLAnchorElement>('[data-dashboard-locale-link]');
    if (localeLink) localeLink.href = buildDashboardUrl(otherLocale, mode, travelFilter, selectedDate, layer);

    const activeTabId = getToolPathSegment(mode);
    for (const tabLink of document.querySelectorAll<HTMLAnchorElement>('[data-top-tab-id]')) {
      const tabId = tabLink.dataset.topTabId;
      tabLink.classList.toggle('is-active', tabId === activeTabId);
      if (tabId === 'landing') {
        tabLink.href = buildTopTabPath(locale, 'landing');
      } else if (tabId === 'weather-map') {
        tabLink.href = buildToolTabUrl(locale, 'daily', mode);
      } else if (tabId === 'city-finder') {
        tabLink.href = buildToolTabUrl(locale, 'travel', mode);
      }
    }
  }, [layer, locale, mode, otherLocale, selectedDate, travelFilter]);

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

  useEffect(() => {
    if (mode !== 'daily') return;
    setDailySortKey(layer);
    setDailySortDirection(dailySortDirections[layer]);
  }, [layer, mode]);

  const resultItems = useMemo(() => {
    return (dashboardData?.resultItems ?? []).filter((item) => cityMatchesKeyword(item.city, cityKeyword));
  }, [cityKeyword, dashboardData?.resultItems]);
  const sortedResultItems = useMemo(() => {
    if (mode !== 'daily') return resultItems;
    const dailyItems = resultItems.filter((item): item is DashboardDailyResultItem => !isDashboardTravelItem(item));
    return sortDailyItems(dailyItems, dailySortKey, dailySortDirection, locale);
  }, [dailySortDirection, dailySortKey, locale, mode, resultItems]);
  const visibleResultItems = sortedResultItems.slice(0, visibleResultLimit);
  const selectedResultItem = sortedResultItems.find((item) => item.city.id === selectedCityId) ?? sortedResultItems[0];
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
  const selectedDailySortLabel = dailySortOptions.find((option) => option.id === dailySortKey)?.labels[locale] ?? '';
  const highMatchCityCount = resultItems.filter(
    (item) => isDashboardTravelItem(item) && item.matchDays / Math.max(item.totalDays, 1) >= 0.7
  ).length;

  useEffect(() => {
    setVisibleResultLimit(resultPageSize);
  }, [cityKeyword, dailySortDirection, dailySortKey, dashboardData?.resultItems, mode]);

  useEffect(() => {
    if (!cityKeyword) return;
    const firstResultCityId = sortedResultItems[0]?.city.id ?? null;
    const selectedCityIsVisible = Boolean(selectedCityId && resultItems.some((item) => item.city.id === selectedCityId));
    if (firstResultCityId && !selectedCityIsVisible) setSelectedCityId(firstResultCityId);
  }, [cityKeyword, resultItems, selectedCityId, sortedResultItems]);

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

  return (
    <section className="workspace">
      <aside className="filter-panel" aria-label={copy[locale].filterPanel}>
          {mode === 'travel' ? (
            <TravelFilterDock
              locale={locale}
              temperatureUnit={temperatureUnit}
              travelFilter={travelFilter}
              setTravelFilter={setTravelFilter}
              primaryRegion={primaryRegion}
              currentRegion={travelFilter.region}
              primaryRegionOptions={primaryRegionOptions}
              subRegionOptions={subRegionOptions}
              canSelectSubRegion={canSelectSubRegion}
              selectedWeatherSummary={selectedWeatherSummary}
              onPrimaryRegionChange={setPrimaryRegion}
              onSubRegionChange={setSubRegion}
            />
          ) : (
            <DailyMapFilterDock
              locale={locale}
              primaryRegion={primaryRegion}
              currentRegion={travelFilter.region}
              primaryRegionOptions={primaryRegionOptions}
              subRegionOptions={subRegionOptions}
              canSelectSubRegion={canSelectSubRegion}
              selectedDate={selectedDate}
              selectedDateIndex={selectedDateIndex}
              regionAvailableDates={regionAvailableDates}
              layer={layer}
              layers={layers}
              onPrimaryRegionChange={setPrimaryRegion}
              onSubRegionChange={setSubRegion}
              onDateChange={setSelectedDate}
              onLayerChange={setLayer}
            />
          )}
        </aside>

        <section className="workspace-body" aria-label={copy[locale].resultPanel}>
          <aside className="results-panel" aria-label={copy[locale].resultPanel}>
            <div className={`summary-grid${mode === 'daily' ? ' summary-grid-daily' : ''}`}>
              {mode === 'daily' ? (
                <>
                  <div>
                    <span>{copy[locale].coverageRegions}</span>
                    <strong>{visibleRegionCount}</strong>
                  </div>
                  <div>
                    <span>{copy[locale].coverageCities}</span>
                    <strong>{visibleCount}</strong>
                  </div>
                  <div className="summary-sort-field">
                    <div className="summary-sort-copy">
                      <button
                        type="button"
                        className="summary-sort-direction"
                        onClick={() => setDailySortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
                        aria-label={dailySortDirection === 'asc' ? copy[locale].sortAscending : copy[locale].sortDescending}
                        title={dailySortDirection === 'asc' ? copy[locale].sortAscending : copy[locale].sortDescending}
                      >
                        <span>{copy[locale].sort}</span>
                        {dailySortDirection === 'asc' ? <ArrowUp size={15} aria-hidden="true" /> : <ArrowDown size={15} aria-hidden="true" />}
                      </button>
                      <span className="summary-sort-select-shell">
                        <span className="summary-sort-value">{selectedDailySortLabel}</span>
                        <select
                          value={dailySortKey}
                          onChange={(event) => {
                            const sortKey = event.target.value as DailySortKey;
                            setDailySortKey(sortKey);
                            setDailySortDirection(dailySortDirections[sortKey]);
                          }}
                          aria-label={copy[locale].sort}
                        >
                          {dailySortOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.labels[locale]}
                            </option>
                          ))}
                        </select>
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span>{visibleRegionCount > 0 ? copy[locale].coverageRegions : copy[locale].coverageCities}</span>
                    <strong>{visibleRegionCount > 0 ? visibleRegionCount : visibleCount}</strong>
                  </div>
                  <div>
                    <span>{copy[locale].citySamples}</span>
                    <strong>{visibleCount}</strong>
                  </div>
                  <div>
                    <span>{copy[locale].highMatchCities}</span>
                    <strong>{highMatchCityCount}</strong>
                  </div>
                </>
              )}
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
              <div className="panel-loading-state" role="status">{copy[locale].loadingWeatherData}</div>
            ) : resultItems.length > 0 ? (
              <div className="ranking-list-frame">
                <ol className="ranking-list">
                  {visibleResultItems.map((item) => {
                    const city = item.city;
                    const active = effectiveSelectedCityId === city.id;
                    const isTravelItem = isDashboardTravelItem(item);
                    const primary = isTravelItem
                      ? copy[locale].suitableDays(item.matchDays, item.totalDays)
                      : formatDailyLayerMetric(item, layer, locale, temperatureUnit);
                    const secondary = isTravelItem
                      ? `${copy[locale].average} ${formatTemperature(item.averageTemperatureC, temperatureUnit)}`
                      : null;

                    return (
                      <li key={city.id}>
                        <button className={active ? 'is-active' : ''} type="button" onClick={() => setSelectedCityId(city.id)}>
                          <span className="city-name-line">{formatCityName(city, locale)}</span>
                          <span className="city-result-meta">
                            <small className="city-region-label">{formatCityRegion(city, locale)}</small>
                            {secondary ? <small className="city-weather-label">{secondary}</small> : null}
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
                        {locale === 'zh' ? '加载更多' : 'Load more'}
                      </button>
                    </li>
                  ) : null}
                </ol>
              </div>
            ) : (
              <div className="empty-results">{copy[locale].noCityMatches}</div>
            )}
          </aside>

          <section className="forecast-column" aria-label={copy[locale].forecastPanel}>
            <section className={`map-forecast-panel${selectedCity ? '' : ' is-empty'}`} aria-label={copy[locale].forecastPanel}>
              {selectedCity ? (
                <div className="map-forecast-heading">
                  <strong>{formatCityName(selectedCity, locale)}</strong>
                  <span>{[...formatCityRegionSegments(selectedCity, locale), formatElevation(selectedCity.elevationMeters, locale)].join(' · ')}</span>
                </div>
              ) : null}
              {isLoadingData && !dashboardData ? (
                <div className="panel-loading-state forecast-panel-state" role="status">{copy[locale].loadingWeatherData}</div>
              ) : selectedCity && selectedForecasts.length > 0 ? (
                <div className="forecast-strip">
                  {selectedForecasts.slice(0, 14).map((forecast) => {
                    const precipitationProbability = formatPrecipitationProbability(forecast.precipitationProbabilityMax);
                    const windSpeed = formatWindSpeed(forecast.windSpeedMaxKmh);
                    const forecastTitle = buildForecastDayTitle(formatCityName(selectedCity, locale), forecast, locale, temperatureUnit);

                    return (
                      <div key={`${forecast.cityId}-${forecast.date}`} className="forecast-day" title={forecastTitle}>
                        <div className="forecast-day-heading">
                          <strong className="forecast-date">{formatCompactForecastDateLabel(forecast.date, locale)}</strong>
                          <span
                            className="forecast-icon"
                            aria-label={formatWeatherType(forecast.weatherType, locale)}
                          >
                            {weatherTypeIcons[forecast.weatherType]}
                          </span>
                          <span className={`forecast-temperature ${temperatureToneClass(forecast.temperatureMeanC)}`}>
                            {formatTemperatureRange(forecast.temperatureMinC, forecast.temperatureMaxC, locale, temperatureUnit)}
                          </span>
                        </div>
                        <dl className="forecast-day-metrics">
                          {precipitationProbability ? (
                            <div className="forecast-metric forecast-metric-precipitation-probability">
                              <dt>{copy[locale].forecastPrecipitationProbability}</dt>
                              <dd>{precipitationProbability}</dd>
                            </div>
                          ) : null}
                          <div className="forecast-metric forecast-metric-humidity">
                            <dt>{copy[locale].forecastHumidity}</dt>
                            <dd>{formatHumidity(forecast.humidityMeanPercent)}</dd>
                          </div>
                          <div className="forecast-metric forecast-metric-precipitation">
                            <dt>{copy[locale].forecastPrecipitation}</dt>
                            <dd>{formatPrecipitation(forecast.precipitationSumMm)}</dd>
                          </div>
                          {windSpeed ? (
                            <div className="forecast-metric forecast-metric-wind">
                              <dt>{copy[locale].forecastWind}</dt>
                              <dd>{windSpeed}</dd>
                            </div>
                          ) : null}
                        </dl>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="forecast-panel-state">{copy[locale].noForecastData}</div>
              )}
            </section>
          </section>

          <section className="map-column" aria-label={copy[locale].mapPanel}>
            <WorldWeatherMap
              mode={mode}
              locale={locale}
              layer={layer}
              resultItems={resultItems}
              regionSummaries={dashboardData?.regionSummaries ?? []}
              dataRegion={dashboardData?.region ?? null}
              temperatureUnit={temperatureUnit}
              activeRegion={travelFilter.region}
              regionLayer={getMapRegionLayer(travelFilter.region)}
              selectedCityId={effectiveSelectedCityId}
              onSelectCity={setSelectedCityId}
              statusLabel={
                isLoadingData && !dashboardData
                  ? copy[locale].loadingWeatherData
                  : !dashboardData || resultItems.length === 0
                    ? copy[locale].noMapData
                    : null
              }
              statusKind={isLoadingData && !dashboardData ? 'loading' : 'empty'}
            />
          </section>
        </section>
    </section>
  );
}
