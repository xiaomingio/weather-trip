/**
 * 文件说明: 渲染选中城市的标题信息、十四天预报列表和预报加载状态。
 * 对应文档: docs/specs/21-tool-responsive-layout.md
 */
'use client';

import type { City, DailyForecast } from 'weather-core/types';
import {
  type DisplayLocale,
  type TemperatureUnit,
  formatCityLocationPath,
  formatCityName,
  formatCityRegionSegments,
  formatElevation
} from '@/domain/format';
import { ForecastDayCard } from './ForecastDayCard';
import { RefreshOverlay } from './RefreshOverlay';
import type { DashboardPanelCopy } from './types';

type ForecastPanelProps = {
  locale: DisplayLocale;
  temperatureUnit: TemperatureUnit;
  copy: DashboardPanelCopy;
  city: City | undefined;
  matchSummary?: string;
  getForecastMatchState?: (forecast: DailyForecast, forecastIndex: number) => boolean;
  forecasts: DailyForecast[];
  isLoading: boolean;
  isRefreshing: boolean;
};

export function ForecastPanel({
  locale,
  temperatureUnit,
  copy,
  city,
  matchSummary,
  getForecastMatchState,
  forecasts,
  isLoading,
  isRefreshing
}: ForecastPanelProps) {
  const cityName = city ? formatCityName(city, locale) : '';
  const cityTitle = city ? formatCityLocationPath(city, locale) : '';

  return (
    <section className="forecast-column" aria-label={copy.forecastPanel}>
      <section className={`map-forecast-panel${city ? '' : ' is-empty'}`} aria-label={copy.forecastPanel}>
        {city ? (
          <div className="map-forecast-heading">
            <strong>{cityName}</strong>
            <span className="map-forecast-location">{[...formatCityRegionSegments(city, locale), formatElevation(city.elevationMeters, locale)].join(' · ')}</span>
            {matchSummary ? <span className="map-forecast-match-summary">{matchSummary}</span> : null}
          </div>
        ) : null}
        {isLoading ? (
          <div className="panel-loading-state forecast-panel-state" role="status">{copy.loadingWeatherData}</div>
        ) : city && forecasts.length > 0 ? (
          <div className="forecast-strip">
            {forecasts.slice(0, 14).map((forecast, forecastIndex) => (
              <ForecastDayCard
                key={`${forecast.cityId}-${forecast.date}`}
                cityName={cityTitle}
                forecast={forecast}
                filterMatch={getForecastMatchState?.(forecast, forecastIndex)}
                locale={locale}
                temperatureUnit={temperatureUnit}
                copy={copy}
              />
            ))}
          </div>
        ) : (
          <div className="forecast-panel-state">{copy.noForecastData}</div>
        )}
        {isRefreshing ? <RefreshOverlay label={copy.loadingWeatherData} /> : null}
      </section>
    </section>
  );
}
