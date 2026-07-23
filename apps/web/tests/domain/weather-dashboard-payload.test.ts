/**
 * 文件说明: 覆盖天气应用快照组装成工具页 payload 时的数据切分和排序规则。
 * 对应文档: docs/plans/free-static-data-plan.md
 */
import { describe, expect, it } from 'vitest';
import type { City, DailyForecast, WeatherDataSnapshot } from 'weather-core/types';
import { buildCitySearchPayload, buildWeatherLayerPayload } from '@/domain/weather-dashboard-payload';

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
const snapshot: WeatherDataSnapshot = {
  version: 'test-weather',
  generatedAt: '2026-07-01T00:00:00.000Z',
  cityListVersion: 'test-cities',
  defaultDate: dates[0],
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
    const tiedSnapshot: WeatherDataSnapshot = {
      version: 'test-weather',
      generatedAt: '2026-07-01T00:00:00.000Z',
      cityListVersion: 'test-cities',
      defaultDate: testDates[0],
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

  it('normalizes admin2 URL regions to their admin1 parent for selectable filters', () => {
    const cities = [
      cityWith({
        id: 'kunming',
        names: { zh: '昆明', en: 'Kunming' },
        country: 'China',
        countryCode: 'CN',
        admin1: 'Yunnan',
        admin1GroupCode: '29',
        admin2: 'Kunming Shi',
        admin2Code: '5301',
        countryTier: 'C3',
        region: 'asia'
      }),
      cityWith({
        id: 'dali',
        names: { zh: '大理', en: 'Dali' },
        country: 'China',
        countryCode: 'CN',
        admin1: 'Yunnan',
        admin1GroupCode: '29',
        admin2: 'Dali Baizu Zizhizhou',
        admin2Code: '5329',
        countryTier: 'C3',
        region: 'asia'
      })
    ];
    const yunnanSnapshot: WeatherDataSnapshot = {
      version: 'test-weather',
      generatedAt: '2026-07-01T00:00:00.000Z',
      cityListVersion: 'test-cities',
      defaultDate: dates[0],
      cities,
      forecasts: cities.map((item) => forecast(dates[0], item.id)),
      availableDates: [dates[0]]
    };

    const payload = buildCitySearchPayload(yunnanSnapshot, {
      locale: 'en',
      searchParams: new URLSearchParams('region=admin2:CN.29.5301')
    });

    expect(payload.region).toBe('admin1:CN.29');
    expect(payload.resultItems.map((item) => item.city.id).sort()).toEqual(['dali', 'kunming']);
    expect(payload.regionSummaries.map((summary) => summary.id).sort()).toEqual(['admin2:CN.29.5301', 'admin2:CN.29.5329']);
  });
});
