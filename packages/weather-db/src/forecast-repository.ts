/**
 * 文件说明: 写入和更新城市每日天气预报数据。
 * 对应文档: docs/data-flow.md
 */

import type { DailyForecast } from 'weather-core/types';
import type { WeatherDatabase } from './types.js';

export async function upsertForecasts(db: WeatherDatabase, forecasts: DailyForecast[]): Promise<void> {
  const client = await db.pool.connect();
  try {
    await client.query('begin');
    for (const forecast of forecasts) {
      await client.query(
        `
          insert into daily_forecasts (
            city_id, date, weather_code, weather_type, temperature_min_c, temperature_max_c,
            temperature_mean_c, humidity_mean_percent, precipitation_probability_max,
            precipitation_sum_mm, wind_speed_max_kmh, fetched_at
          )
          values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
          on conflict (city_id, date) do update set
            weather_code = excluded.weather_code,
            weather_type = excluded.weather_type,
            temperature_min_c = excluded.temperature_min_c,
            temperature_max_c = excluded.temperature_max_c,
            temperature_mean_c = excluded.temperature_mean_c,
            humidity_mean_percent = excluded.humidity_mean_percent,
            precipitation_probability_max = excluded.precipitation_probability_max,
            precipitation_sum_mm = excluded.precipitation_sum_mm,
            wind_speed_max_kmh = excluded.wind_speed_max_kmh,
            fetched_at = now()
        `,
        [
          forecast.cityId,
          forecast.date,
          forecast.weatherCode,
          forecast.weatherType,
          forecast.temperatureMinC,
          forecast.temperatureMaxC,
          forecast.temperatureMeanC,
          forecast.humidityMeanPercent,
          forecast.precipitationProbabilityMax ?? null,
          forecast.precipitationSumMm,
          forecast.windSpeedMaxKmh ?? null
        ]
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
