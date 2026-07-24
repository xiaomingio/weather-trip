/**
 * 文件说明: 为天气 domain 测试把易读的 DailyForecast fixture 转成真实二进制矩阵快照。
 * 对应文档: docs/specs/43-weather-matrix-performance.md
 */
import type { City, DailyForecast, WeatherDataSnapshot } from 'weather-core/types';
import { decodeWeatherForecastBin, encodeWeatherForecastBin, type WeatherCurrentWire, type WeatherForecastBinInputRow } from 'weather-core/static-data';

export function forecastMatrixFromDailyForecasts(cities: City[], dates: string[], forecasts: DailyForecast[]): WeatherDataSnapshot['forecastMatrix'] {
  const forecastsByCityDate = new Map(forecasts.map((forecast) => [`${forecast.cityId}\n${forecast.date}`, forecast]));
  const rows: WeatherForecastBinInputRow[] = cities.map((city) => ({
    cityId: city.id,
    sourceElevationM: city.elevationMeters,
    days: dates.map((date) => {
      const forecast = forecastsByCityDate.get(`${city.id}\n${date}`);
      if (!forecast) return null;
      return [
        forecast.weatherCode,
        forecast.temperatureMinC,
        forecast.temperatureMaxC,
        forecast.temperatureMeanC,
        forecast.humidityMeanPercent,
        forecast.precipitationSumMm,
        forecast.windSpeedMaxKmh ?? null
      ];
    })
  }));
  const bin = encodeWeatherForecastBin(dates, rows);
  const current: WeatherCurrentWire = {
    v: 'test-weather',
    g: '2026-07-01T00:00:00.000Z',
    dd: dates[0] ?? '',
    ds: dates,
    cv: 'test-cities',
    f: 'weather/forecast-14d/test.bin',
    fb: bin.byteLength
  };

  return decodeWeatherForecastBin(current, bin);
}

export function weatherSnapshotFromForecasts(params: {
  cities: City[];
  dates: string[];
  forecasts: DailyForecast[];
  defaultDate?: string;
}): WeatherDataSnapshot {
  return {
    version: 'test-weather',
    generatedAt: '2026-07-01T00:00:00.000Z',
    cityListVersion: 'test-cities',
    defaultDate: params.defaultDate ?? params.dates[0] ?? '',
    availableDates: params.dates,
    cities: params.cities,
    forecastMatrix: forecastMatrixFromDailyForecasts(params.cities, params.dates, params.forecasts)
  };
}
