/**
 * 文件说明: 渲染选中城市十四天预报中的单日天气卡片。
 * 对应文档: docs/tool-responsive-layout.md
 */
'use client';

import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Cloudy,
  Snowflake,
  Sun
} from 'lucide-react';
import type { DailyForecast, WeatherType } from 'weather-core/types';
import {
  type DisplayLocale,
  type TemperatureUnit,
  formatCompactForecastDateLabel,
  formatHumidity,
  formatTemperature,
  formatTemperatureRange,
  formatWeatherType
} from '@/domain/format';
import type { DashboardPanelCopy } from './types';

type ForecastDayCardProps = {
  cityName: string;
  forecast: DailyForecast;
  locale: DisplayLocale;
  temperatureUnit: TemperatureUnit;
  copy: DashboardPanelCopy;
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

export function ForecastDayCard({ cityName, forecast, locale, temperatureUnit, copy }: ForecastDayCardProps) {
  const precipitationProbability = formatPrecipitationProbability(forecast.precipitationProbabilityMax);
  const windSpeed = formatWindSpeed(forecast.windSpeedMaxKmh);
  const forecastTitle = buildForecastDayTitle(cityName, forecast, locale, temperatureUnit);

  return (
    <div className="forecast-day" title={forecastTitle}>
      <div className="forecast-day-heading">
        <strong className="forecast-date">{formatCompactForecastDateLabel(forecast.date, locale)}</strong>
        <span className="forecast-icon" aria-label={formatWeatherType(forecast.weatherType, locale)}>
          {weatherTypeIcons[forecast.weatherType]}
        </span>
        <span className={`forecast-temperature ${temperatureToneClass(forecast.temperatureMeanC)}`}>
          {formatTemperatureRange(forecast.temperatureMinC, forecast.temperatureMaxC, locale, temperatureUnit)}
        </span>
      </div>
      <dl className="forecast-day-metrics">
        {precipitationProbability ? (
          <div className="forecast-metric forecast-metric-precipitation-probability">
            <dt>{copy.forecastPrecipitationProbability}</dt>
            <dd>{precipitationProbability}</dd>
          </div>
        ) : null}
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
