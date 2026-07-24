/**
 * 文件说明: 渲染选中城市的标题信息、十四天预报列表和预报加载状态。
 * 对应文档: docs/specs/21-tool-responsive-layout.md
 */
'use client';

import type { City, DailyForecast } from 'weather-core/types';
import {
  type DisplayLocale,
  type TemperatureUnit,
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
  forecasts: DailyForecast[];
  isLoading: boolean;
  isRefreshing: boolean;
};

export function ForecastPanel({ locale, temperatureUnit, copy, city, forecasts, isLoading, isRefreshing }: ForecastPanelProps) {
  const cityName = city ? formatCityName(city, locale) : '';

  return (
    <section className="forecast-column" aria-label={copy.forecastPanel}>
      <section className={`map-forecast-panel${city ? '' : ' is-empty'}`} aria-label={copy.forecastPanel}>
        {city ? (
          <div className="map-forecast-heading">
            <strong>{cityName}</strong>
            <span>{[...formatCityRegionSegments(city, locale), formatElevation(city.elevationMeters, locale)].join(' · ')}</span>
          </div>
        ) : null}
        {isLoading ? (
          <div className="panel-loading-state forecast-panel-state" role="status">{copy.loadingWeatherData}</div>
        ) : city && forecasts.length > 0 ? (
          <div className="forecast-strip">
            {forecasts.slice(0, 14).map((forecast) => (
              <ForecastDayCard
                key={`${forecast.cityId}-${forecast.date}`}
                cityName={cityName}
                forecast={forecast}
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
