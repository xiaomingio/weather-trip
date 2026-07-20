/**
 * 文件说明: 调用 Open-Meteo Forecast API，并把响应转换为内部每日天气预报记录。
 * 参考资料: https://open-meteo.com/en/docs
 * 对应文档: docs/data-flow.md
 */
import type { City, DailyForecast } from 'weather-core/types';
import { weatherCodeToType } from 'weather-core/weather-code';

const forecastEndpoint = 'https://api.open-meteo.com/v1/forecast';
const dailyVariables = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'temperature_2m_mean',
  'relative_humidity_2m_mean',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max'
];

const maxFetchAttempts = 5;
const rateLimitDelayMs = 65000;

function buildForecastUrl(cities: City[], forecastDays: number): string {
  const params = new URLSearchParams({
    latitude: cities.map((city) => city.latitude).join(','),
    longitude: cities.map((city) => city.longitude).join(','),
    daily: dailyVariables.join(','),
    forecast_days: String(forecastDays),
    timezone: 'auto'
  });

  return `${forecastEndpoint}?${params.toString()}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchJson(url: string): Promise<unknown> {
  for (let attempt = 1; attempt <= maxFetchAttempts; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json'
      }
    });

    if (response.ok) {
      return response.json();
    }

    const body = await response.text();
    if (response.status === 429 && attempt < maxFetchAttempts) {
      const retryAfterSeconds = Number(response.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfterSeconds)
        ? Math.max(retryAfterSeconds * 1000, rateLimitDelayMs)
        : rateLimitDelayMs;
      console.log(`Open-Meteo rate limit reached. Retrying in ${Math.round(waitMs / 1000)}s (${attempt}/${maxFetchAttempts}).`);
      await delay(waitMs);
      continue;
    }

    throw new Error(`Open-Meteo request failed with ${response.status}: ${body.slice(0, 300)}`);
  }

  throw new Error('Open-Meteo request failed after retry attempts.');
}

function toNumber(value: unknown, field: string, cityId: string, date: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Number(value.toFixed(1));
  throw new Error(`Missing ${field} for ${cityId} on ${date}`);
}

function toOptionalInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.round(value);
}

function forecastsFromResponse(city: City, response: unknown): DailyForecast[] {
  const daily = (response as { daily?: Record<string, unknown[]> }).daily;
  if (!daily?.time?.length) {
    throw new Error(`Open-Meteo returned no daily forecast for ${city.id}`);
  }

  return daily.time.map((dateValue, index) => {
    const date = String(dateValue);
    const weatherCode = Math.round(toNumber(daily.weather_code?.[index], 'weather_code', city.id, date));
    const temperatureMinC = toNumber(daily.temperature_2m_min?.[index], 'temperature_2m_min', city.id, date);
    const temperatureMaxC = toNumber(daily.temperature_2m_max?.[index], 'temperature_2m_max', city.id, date);
    const temperatureMeanC = toNumber(daily.temperature_2m_mean?.[index], 'temperature_2m_mean', city.id, date);
    const humidityMeanPercent = toNumber(daily.relative_humidity_2m_mean?.[index], 'relative_humidity_2m_mean', city.id, date);
    const precipitationSumMm = toNumber(daily.precipitation_sum?.[index] ?? 0, 'precipitation_sum', city.id, date);

    return {
      cityId: city.id,
      date,
      weatherCode,
      weatherType: weatherCodeToType(weatherCode),
      temperatureMinC,
      temperatureMaxC,
      temperatureMeanC,
      humidityMeanPercent,
      precipitationProbabilityMax: toOptionalInteger(daily.precipitation_probability_max?.[index]),
      precipitationSumMm,
      windSpeedMaxKmh: toOptionalInteger(daily.wind_speed_10m_max?.[index])
    };
  });
}

export async function fetchForecastBatch(cities: City[], forecastDays: number): Promise<DailyForecast[]> {
  const data = await fetchJson(buildForecastUrl(cities, forecastDays));
  const responses = Array.isArray(data) ? data : [data];

  if (responses.length !== cities.length) {
    throw new Error(`Open-Meteo returned ${responses.length} locations for ${cities.length} requested cities`);
  }

  return responses.flatMap((response, index) => forecastsFromResponse(cities[index], response));
}
