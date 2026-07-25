/**
 * 文件说明: 渲染天气工具页城市结果列表，并按结果类型显示匹配指标或地图图层指标。
 * 对应文档: docs/specs/21-tool-responsive-layout.md
 */
'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { MapLayer } from 'weather-core/types';
import {
  type DisplayLocale,
  type TemperatureUnit,
  formatCityName,
  formatCityRegion,
  formatElevation,
  formatHumidity,
  formatTemperature,
  formatWeatherType
} from '@/domain/format';
import {
  type DashboardWeatherMapResultItem,
  type DashboardResultItem,
  isDashboardCityFinderItem
} from '@/domain/weather-dashboard-shared';
import type { CityFocusRequest } from '../WorldWeatherMap/types';
import type { DashboardPanelCopy } from './types';

const virtualRowHeight = 51;
const virtualListOverscan = 8;

type ResultsListProps = {
  locale: DisplayLocale;
  layer: MapLayer;
  temperatureUnit: TemperatureUnit;
  copy: DashboardPanelCopy;
  resultItems: DashboardResultItem[];
  selectedCityId: string | null;
  cityFocusRequest: CityFocusRequest | null;
  onSelectCity: (cityId: string) => void;
};

function formatWeatherMapLayerMetric(
  item: DashboardWeatherMapResultItem,
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

export function ResultsList({
  locale,
  layer,
  temperatureUnit,
  copy,
  resultItems,
  selectedCityId,
  cityFocusRequest,
  onSelectCity
}: ResultsListProps) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const handledCityFocusRequestIdRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const visibleRange = useMemo(() => {
    if (resultItems.length === 0) return { start: 0, end: 0 };

    const viewportRows = Math.ceil(viewportHeight / virtualRowHeight);
    const start = Math.max(0, Math.floor(scrollTop / virtualRowHeight) - virtualListOverscan);
    const end = Math.min(resultItems.length, start + viewportRows + virtualListOverscan * 2 + 1);
    return { start, end };
  }, [resultItems.length, scrollTop, viewportHeight]);
  const virtualItems = resultItems.slice(visibleRange.start, visibleRange.end);
  const topSpacerHeight = visibleRange.start * virtualRowHeight;
  const bottomSpacerHeight = Math.max(0, (resultItems.length - visibleRange.end) * virtualRowHeight);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const updateViewportHeight = () => setViewportHeight(list.clientHeight);
    updateViewportHeight();

    const observer = new ResizeObserver(updateViewportHeight);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !cityFocusRequest) return;
    if (handledCityFocusRequestIdRef.current === cityFocusRequest.requestId) return;
    handledCityFocusRequestIdRef.current = cityFocusRequest.requestId;

    const selectedIndex = resultItems.findIndex((item) => item.city.id === cityFocusRequest.cityId);
    if (selectedIndex < 0) return;
    const targetTop = selectedIndex * virtualRowHeight;
    const targetBottom = targetTop + virtualRowHeight;
    const comfortableTop = list.scrollTop + virtualRowHeight;
    const comfortableBottom = list.scrollTop + list.clientHeight - virtualRowHeight;
    if (targetTop >= comfortableTop && targetBottom <= comfortableBottom) return;

    list.scrollTo({
      top: Math.max(0, targetTop - (list.clientHeight - virtualRowHeight) / 2),
      behavior: 'auto'
    });
  }, [cityFocusRequest, resultItems]);

  if (resultItems.length === 0) return <div className="empty-results">{copy.noCityMatches}</div>;

  return (
    <div className="ranking-list-frame">
      <ol
        ref={listRef}
        className="ranking-list virtual-ranking-list"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <li className="virtual-ranking-list-spacer" style={{ height: topSpacerHeight }} aria-hidden="true" />
        {virtualItems.map((item) => {
          const city = item.city;
          const active = selectedCityId === city.id;
          const isTravelItem = isDashboardCityFinderItem(item);
          const rowStyle = { '--virtual-row-height': `${virtualRowHeight}px` } as CSSProperties;
          const primary = isTravelItem
            ? copy.suitableDays(item.matchDays, item.totalDays)
            : formatWeatherMapLayerMetric(item, layer, locale, temperatureUnit);
          const secondary = isTravelItem
            ? `${copy.average} ${formatTemperature(item.averageTemperatureC, temperatureUnit)}`
            : null;

          return (
            <li key={city.id} className="virtual-ranking-list-row" style={rowStyle}>
              <button className={active ? 'is-active' : ''} type="button" onClick={() => onSelectCity(city.id)}>
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
        <li className="virtual-ranking-list-spacer" style={{ height: bottomSpacerHeight }} aria-hidden="true" />
      </ol>
    </div>
  );
}
