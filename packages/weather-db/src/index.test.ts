/**
 * 文件说明: 验证天气数据库读写辅助中的纯数据契约，覆盖全球城市与局部天气缓存并存的日期可用性。
 * 对应文档: docs/data-flow.md
 */
import { describe, expect, it } from 'vitest';
import type { City, DailyForecast } from 'weather-core/types';
import { getAvailableDates, readCities, type WeatherDatabase } from './index.js';

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

describe('getAvailableDates', () => {
  it('keeps dates that have partial forecast coverage while the worker fills global cities', () => {
    expect(getAvailableDates([city('a'), city('b')], [forecast('a', '2026-07-21')])).toEqual(['2026-07-21']);
  });

  it('does not expose dates when there are no cities or forecasts', () => {
    expect(getAvailableDates([], [forecast('a', '2026-07-21')])).toEqual([]);
    expect(getAvailableDates([city('a')], [])).toEqual([]);
  });
});

describe('readCities', () => {
  it('normalizes GeoNames Chinese alternate names to simplified Chinese', async () => {
    const db = {
      pool: {
        query: async () => ({
          rows: [
            {
              id: 'geonames-361058',
              name: 'Alexandria',
              ascii_name: 'Alexandria',
              city_zh_name: '亞歷山卓',
              country_code: 'EG',
              admin1_code: '06',
              admin1_ascii_name: 'Alexandria',
              admin1_zh_name: '亞歷山大省',
              latitude: 31.2,
              longitude: 29.92,
              timezone: 'Africa/Cairo',
              population: 5_263_542,
              elevation: 9,
              dem: 9,
              continent_code: 'AF',
              selection_reasons: ['test']
            }
          ]
        })
      },
      close: async () => {}
    } as unknown as WeatherDatabase;

    await expect(readCities(db)).resolves.toMatchObject([
      {
        names: { zh: '亚历山卓', en: 'Alexandria' },
        admin1LocalName: '亚历山大省'
      }
    ]);
  });
});
