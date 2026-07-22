/**
 * 文件说明: 覆盖天气工具服务端响应组装中的接口级数据切分规则。
 * 对应文档: docs/data-flow.md
 */
import { describe, expect, it } from 'vitest';
import type { WeatherSnapshot } from 'weather-db';
import type { City, DailyForecast } from 'weather-core/types';
import { buildCitySearchPayload, buildWeatherLayerPayload } from '@/domain/weather-dashboard-server';

const city: City = {
  id: 'test-city',
  names: { zh: '测试城', en: 'Test City' },
  country: 'Testland',
  countryCode: 'US',
  admin1: 'California',
  admin1Code: 'CA',
  admin1GroupCode: 'CA',
  latitude: 34,
  longitude: -118,
  timezone: 'UTC',
  population: 1_000_000,
  elevationMeters: 80,
  region: 'north_america',
  selectionReasons: ['population:country-profile']
};

function cityWith(overrides: Partial<City>): City {
  return {
    ...city,
    ...overrides,
    names: overrides.names ?? city.names,
    selectionReasons: overrides.selectionReasons ?? city.selectionReasons
  };
}

function forecast(date: string, cityId = city.id, overrides: Partial<DailyForecast> = {}): DailyForecast {
  return {
    cityId,
    date,
    weatherCode: 0,
    weatherType: 'sunny',
    temperatureMinC: 18,
    temperatureMaxC: 26,
    temperatureMeanC: 22,
    humidityMeanPercent: 50,
    precipitationSumMm: 0,
    windSpeedMaxKmh: 12,
    ...overrides
  };
}

const dates = Array.from({ length: 15 }, (_, index) => `2026-07-${String(index + 1).padStart(2, '0')}`);
const snapshot: WeatherSnapshot = {
  cities: [city],
  forecasts: dates.map((date) => forecast(date)),
  availableDates: dates
};

describe('weather map day payload', () => {
  it('returns only the requested date when date is provided', () => {
    const payload = buildWeatherLayerPayload(snapshot, {
      locale: 'en',
      searchParams: new URLSearchParams('region=world&date=2026-07-05&layer=temperature')
    });

    expect(payload.selectedDate).toBe('2026-07-05');
    expect(payload.days.map((day) => day.date)).toEqual(['2026-07-05']);
  });

  it('returns the first 14 available dates when date is omitted', () => {
    const payload = buildWeatherLayerPayload(snapshot, {
      locale: 'en',
      searchParams: new URLSearchParams('region=world&layer=temperature')
    });

    expect(payload.selectedDate).toBe('2026-07-01');
    expect(payload.days.map((day) => day.date)).toEqual(dates.slice(0, 14));
  });
});

describe('city search payload', () => {
  it('uses population as the fallback sort when travel scores tie', () => {
    const cities = [
      cityWith({ id: 'small-city', names: { zh: '小城', en: 'Small City' }, population: 1_000_000 }),
      cityWith({ id: 'large-city', names: { zh: '大城', en: 'Large City' }, population: 8_000_000 }),
      cityWith({ id: 'regional-hub', names: { zh: '区域中心', en: 'Regional Hub' }, population: 12_000_000 })
    ];
    const testDates = dates.slice(0, 3);
    const tiedSnapshot: WeatherSnapshot = {
      cities,
      forecasts: cities.flatMap((item) => testDates.map((date) => forecast(date, item.id))),
      availableDates: testDates
    };

    const payload = buildCitySearchPayload(tiedSnapshot, {
      locale: 'en',
      searchParams: new URLSearchParams('region=world')
    });

    expect(payload.resultItems.map((item) => item.city.id)).toEqual(['regional-hub', 'large-city', 'small-city']);
  });
});
