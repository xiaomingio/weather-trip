/**
 * 文件说明: 覆盖公开天气二进制包的编码、解码、矩阵寻址和基础错包校验。
 * 对应文档: docs/specs/43-weather-matrix-performance.md
 */
import { describe, expect, it } from 'vitest';
import {
  decodeWeatherForecastBin,
  encodeWeatherForecastBin,
  readForecastDay,
  readForecastsForDate,
  sourceElevationForCity,
  type WeatherCurrentWire,
  type WeatherForecastBinInputRow
} from '../src/static-data.js';

const dates = ['2026-07-21', '2026-07-22'];
const rows: WeatherForecastBinInputRow[] = [
  {
    cityId: 'city-a',
    sourceElevationM: 123,
    days: [
      [0, 18.1, 25.2, 21.7, 55, 0.4, 12.3],
      [61, 17, 24, 20.2, 80, 8.8, null]
    ]
  },
  {
    cityId: 'city-b',
    sourceElevationM: null,
    days: [
      [3, -2.5, 4.1, 1.2, 68, 0, 18],
      null
    ]
  }
];

function current(byteLength: number, currentDates = dates): WeatherCurrentWire {
  return {
    v: 'test-weather',
    g: '2026-07-21T00:00:00.000Z',
    dd: currentDates[0] ?? '',
    ds: currentDates,
    cv: 'test-cities',
    f: 'weather/forecast-14d/test.bin',
    fb: byteLength,
    fh: 'test-hash'
  };
}

describe('weather forecast bin', () => {
  it('stores cityId and date dictionaries before date-major numeric matrices', () => {
    const bin = encodeWeatherForecastBin(dates, rows);
    const matrix = decodeWeatherForecastBin(current(bin.byteLength), bin);

    expect(matrix.cityIds).toEqual(['city-a', 'city-b']);
    expect(matrix.dates).toEqual(dates);
    expect(sourceElevationForCity(matrix, 'city-a')).toBe(123);
    expect(sourceElevationForCity(matrix, 'city-b')).toBeNull();
    expect(readForecastDay(matrix, 'city-a', '2026-07-21')).toMatchObject({
      cityId: 'city-a',
      date: '2026-07-21',
      weatherCode: 0,
      temperatureMinC: 18.1,
      temperatureMaxC: 25.2,
      temperatureMeanC: 21.7,
      humidityMeanPercent: 55,
      precipitationSumMm: 0.4,
      windSpeedMaxKmh: 12.3
    });
    expect(readForecastDay(matrix, 'city-b', '2026-07-22')).toBeNull();
    expect(readForecastsForDate(matrix, '2026-07-21').map((forecast) => forecast.cityId)).toEqual(['city-a', 'city-b']);
  });

  it('rejects a current entry whose date array does not match the bin dictionary', () => {
    const bin = encodeWeatherForecastBin(dates, rows);

    expect(() => decodeWeatherForecastBin(current(bin.byteLength, ['2026-07-22', '2026-07-23']), bin)).toThrow(
      'Forecast bin dates do not match current.ds.'
    );
  });
});
