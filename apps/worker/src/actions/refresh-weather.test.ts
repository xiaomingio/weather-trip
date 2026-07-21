/**
 * 文件说明: 验证天气刷新 action 的新鲜度门禁，避免服务重启后短时间内重复请求天气源。
 * 对应文档: docs/data-flow.md
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { City, DailyForecast } from 'weather-core/types';
import type { WeatherDatabase } from 'weather-db';
import { fetchForecastBatch } from '../open-meteo.js';
import { refreshWeather } from './refresh-weather.js';

vi.mock('../open-meteo.js', () => ({
  fetchForecastBatch: vi.fn()
}));

function city(id: string): City {
  return {
    id,
    names: { zh: id, en: id },
    country: 'Testland',
    latitude: 0,
    longitude: 0,
    timezone: 'UTC',
    elevationMeters: 0,
    region: 'asia'
  };
}

function forecast(cityId: string, date: string): DailyForecast {
  return {
    cityId,
    date,
    weatherCode: 0,
    weatherType: 'sunny',
    temperatureMinC: 20,
    temperatureMaxC: 24,
    temperatureMeanC: 22,
    humidityMeanPercent: 50,
    precipitationSumMm: 0
  };
}

function forecastWindow(cityId: string, startDate: string, days: number): DailyForecast[] {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    return forecast(cityId, date.toISOString().slice(0, 10));
  });
}

function createMockDb(params: {
  cities: City[];
  forecasts: DailyForecast[];
  lastSuccessAt?: Date;
}): WeatherDatabase {
  return {
    pool: {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        const normalizedSql = sql.replace(/\s+/g, ' ').trim();

        if (normalizedSql.includes('create table if not exists')) {
          return { rows: [] };
        }

        if (normalizedSql.startsWith('select geo_names_cities.*')) {
          return {
            rows: params.cities.map((item) => ({
              id: item.id,
              ascii_name: item.names.en,
              name: item.names.en,
              country_code: 'US',
              latitude: item.latitude,
              longitude: item.longitude,
              timezone: item.timezone,
              elevation: item.elevationMeters,
              dem: item.elevationMeters,
              continent_code: 'NA',
              selection_reasons: []
            }))
          };
        }

        if (normalizedSql.startsWith('select * from daily_forecasts')) {
          return {
            rows: params.forecasts.map((item) => ({
              city_id: item.cityId,
              date: item.date,
              weather_code: item.weatherCode,
              weather_type: item.weatherType,
              temperature_min_c: item.temperatureMinC,
              temperature_max_c: item.temperatureMaxC,
              temperature_mean_c: item.temperatureMeanC,
              humidity_mean_percent: item.humidityMeanPercent,
              precipitation_probability_max: item.precipitationProbabilityMax ?? null,
              precipitation_sum_mm: item.precipitationSumMm,
              wind_speed_max_kmh: item.windSpeedMaxKmh ?? null
            }))
          };
        }

        if (normalizedSql.startsWith('select * from refresh_status')) {
          expect(values).toEqual(['weather:refresh-daily']);
          return {
            rows: params.lastSuccessAt
              ? [
                  {
                    key: 'weather:refresh-daily',
                    last_success_at: params.lastSuccessAt,
                    last_complete_at: params.lastSuccessAt,
                    last_error_type: null,
                    last_error_message: null
                  }
                ]
              : []
          };
        }

        return { rows: [] };
      }),
      connect: vi.fn(async () => ({
        query: vi.fn(async () => ({ rows: [] })),
        release: vi.fn()
      })),
      end: vi.fn()
    },
    close: async () => {}
  } as unknown as WeatherDatabase;
}

describe('refreshWeather', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T00:00:00.000Z'));
    vi.mocked(fetchForecastBatch).mockReset();
  });

  it('skips Open-Meteo when the last successful complete cache refresh is less than 12 hours old', async () => {
    const testCity = city('city-a');
    const db = createMockDb({
      cities: [testCity],
      forecasts: forecastWindow(testCity.id, '2026-07-21', 14),
      lastSuccessAt: new Date('2026-07-20T20:00:00.000Z')
    });

    await expect(refreshWeather(db)).resolves.toMatchObject({
      cities: 1,
      citiesFetched: 0,
      forecastsUpserted: 0,
      skipped: true,
      reason: 'fresh'
    });
    expect(fetchForecastBatch).not.toHaveBeenCalled();
  });
});
