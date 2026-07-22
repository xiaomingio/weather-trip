/**
 * 文件说明: 渲染天气工具页城市结果列表，并按结果类型显示匹配指标或地图图层指标。
 * 对应文档: docs/tool-responsive-layout.md
 */
'use client';

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
import type { DashboardPanelCopy } from './types';

type ResultsListProps = {
  locale: DisplayLocale;
  layer: MapLayer;
  temperatureUnit: TemperatureUnit;
  copy: DashboardPanelCopy;
  resultItems: DashboardResultItem[];
  visibleResultItems: DashboardResultItem[];
  selectedCityId: string | null;
  onSelectCity: (cityId: string) => void;
  onLoadMore: () => void;
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
  visibleResultItems,
  selectedCityId,
  onSelectCity,
  onLoadMore
}: ResultsListProps) {
  if (resultItems.length === 0) return <div className="empty-results">{copy.noCityMatches}</div>;

  return (
    <div className="ranking-list-frame">
      <ol className="ranking-list">
        {visibleResultItems.map((item) => {
          const city = item.city;
          const active = selectedCityId === city.id;
          const isTravelItem = isDashboardCityFinderItem(item);
          const primary = isTravelItem
            ? copy.suitableDays(item.matchDays, item.totalDays)
            : formatWeatherMapLayerMetric(item, layer, locale, temperatureUnit);
          const secondary = isTravelItem
            ? `${copy.average} ${formatTemperature(item.averageTemperatureC, temperatureUnit)}`
            : null;

          return (
            <li key={city.id}>
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
        {visibleResultItems.length < resultItems.length ? (
          <li className="load-more-results-item">
            <button className="load-more-results" type="button" onClick={onLoadMore}>
              {locale === 'zh' ? '加载更多' : 'Load more'}
            </button>
          </li>
        ) : null}
      </ol>
    </div>
  );
}
