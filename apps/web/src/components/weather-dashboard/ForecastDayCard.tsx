/**
 * 文件说明: 渲染选中城市十四天预报中的单日天气卡片。
 * 对应文档: docs/specs/21-tool-responsive-layout.md
 */
'use client';

import type { DailyForecast } from 'weather-core/types';
import { WeatherTypeIcon } from '@/components/WeatherTypeIcon';
import {
  type DisplayLocale,
  type TemperatureUnit,
  formatCompactForecastDateLabel,
  formatHumidity,
  formatTemperature,
  formatTemperatureRange,
  formatWeatherType
} from '@/domain/format';
import { messages, type AppMessages } from '@/i18n';
import type { DashboardPanelCopy } from './types';

type ForecastDayCardTooltipMessages = AppMessages['ui']['forecastDayCardTooltip'];

type ForecastDayCardProps = {
  cityName: string;
  forecast: DailyForecast;
  filterMatch?: boolean;
  locale: DisplayLocale;
  temperatureUnit: TemperatureUnit;
  copy: DashboardPanelCopy;
};

function formatPrecipitation(value: number): string {
  return `${value.toFixed(value > 0 && value < 1 ? 1 : 0)} mm`;
}

function formatPrecipitationProbability(value: number): string {
  return `${Math.round(value)}%`;
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
  temperatureUnit: TemperatureUnit,
  labels: ForecastDayCardTooltipMessages
): string {
  const precipitationProbability = formatPrecipitationProbability(forecast.precipitationProbabilityMax);
  const windSpeed = formatWindSpeed(forecast.windSpeedMaxKmh);

  return [
    cityName,
    `${formatCompactForecastDateLabel(forecast.date, locale)} · ${formatWeatherType(forecast.weatherType, locale)}`,
    `${labels.temperature}: ${formatTemperatureRange(forecast.temperatureMinC, forecast.temperatureMaxC, locale, temperatureUnit)}`,
    `${labels.averageTemperature}: ${formatTemperature(forecast.temperatureMeanC, temperatureUnit)}`,
    `${labels.humidity}: ${formatHumidity(forecast.humidityMeanPercent)}`,
    `${labels.precipitation}: ${formatPrecipitation(forecast.precipitationSumMm)}`,
    `${labels.precipitationProbability}: ${precipitationProbability}`,
    windSpeed ? `${labels.wind}: ${windSpeed}` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

export function ForecastDayCard({ cityName, forecast, filterMatch, locale, temperatureUnit, copy }: ForecastDayCardProps) {
  const precipitationProbability = formatPrecipitationProbability(forecast.precipitationProbabilityMax);
  const windSpeed = formatWindSpeed(forecast.windSpeedMaxKmh);
  const tooltipCopy = messages[locale].ui.forecastDayCardTooltip;
  const forecastTitle = buildForecastDayTitle(cityName, forecast, locale, temperatureUnit, tooltipCopy);
  const filterMatchClassName = typeof filterMatch === 'boolean' ? ` is-filter-${filterMatch ? 'match' : 'miss'}` : '';

  return (
    <div className={`forecast-day${filterMatchClassName}`} title={forecastTitle}>
      <div className="forecast-day-heading">
        <strong className="forecast-date">{formatCompactForecastDateLabel(forecast.date, locale)}</strong>
        <span className="forecast-icon" aria-label={formatWeatherType(forecast.weatherType, locale)}>
          <WeatherTypeIcon type={forecast.weatherType} size={17} />
        </span>
        <span className={`forecast-temperature ${temperatureToneClass(forecast.temperatureMeanC)}`}>
          {formatTemperatureRange(forecast.temperatureMinC, forecast.temperatureMaxC, locale, temperatureUnit)}
        </span>
      </div>
      <dl className="forecast-day-metrics">
        <div className="forecast-metric forecast-metric-precipitation-probability">
          <dt>{copy.forecastPrecipitationProbability}</dt>
          <dd>{precipitationProbability}</dd>
        </div>
        <div className="forecast-metric forecast-metric-humidity">
          <dt>{copy.forecastHumidity}</dt>
          <dd>{formatHumidity(forecast.humidityMeanPercent)}</dd>
        </div>
        <div className="forecast-metric forecast-metric-precipitation">
          <dt>{copy.forecastPrecipitation}</dt>
          <dd>{formatPrecipitation(forecast.precipitationSumMm)}</dd>
        </div>
        {windSpeed ? (
          <div className="forecast-metric forecast-metric-wind">
            <dt>{copy.forecastWind}</dt>
            <dd>{windSpeed}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
