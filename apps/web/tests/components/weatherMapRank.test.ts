/**
 * 文件说明: 覆盖 Weather Map 结果列表默认排序和默认选中城市使用解码后的 city.rank。
 * 对应文档: docs/specs/22-weather-map-interactions.md
 */
import { describe, expect, it } from 'vitest';
import type { City, DailyForecast } from 'weather-core/types';
import { findDefaultSelectedResultItem } from '@/components/weather-dashboard/dashboardSelection';
import { sortWeatherMapItems } from '@/components/weather-dashboard/weatherMapSort';
import type { DashboardWeatherMapResultItem } from '@/domain/weather-dashboard-shared';

const baseCity: City = {
  id: 'sample-city',
  names: { en: 'Sample City', zh: '样例城市' },
  country: 'Sampleland',
  countryCode: 'SL',
  admin1: 'Sample Region',
  admin1Code: 'SR',
  latitude: 24,
  longitude: 118,
  timezone: 'UTC',
  population: 1_000_000,
  elevationMeters: 80,
  region: 'asia',
  selectionReasons: []
};

const baseForecast: DailyForecast = {
  cityId: baseCity.id,
  date: '2026-07-24',
  weatherCode: 1,
  weatherType: 'sunny',
  temperatureMinC: 22,
  temperatureMaxC: 30,
  temperatureMeanC: 26,
  humidityMeanPercent: 55,
  precipitationSumMm: 0,
  windSpeedMaxKmh: 10
};

function item(city: City, comfortScore: number): DashboardWeatherMapResultItem {
  return {
    tool: 'weather-map',
    city,
    forecast: { ...baseForecast, cityId: city.id },
    comfortScore
  };
}

describe('weather map rank behavior', () => {
  it('uses default city rank for the Weather Map default sort option', () => {
    const items = [
      item({ ...baseCity, id: 'large-ordinary-city', names: { en: 'Large Ordinary City', zh: '普通大城' }, population: 20_000_000, rank: 200 }, 0.9),
      item({ ...baseCity, id: 'major-capital', names: { en: 'Major Capital', zh: '首都' }, population: 2_000_000, rank: 1 }, 0.4),
      item({ ...baseCity, id: 'regional-seat', names: { en: 'Regional Seat', zh: '区域中心' }, population: 5_000_000, rank: 20 }, 0.8)
    ];

    expect(sortWeatherMapItems(items, 'default', 'asc', 'en').map((result) => result.city.id)).toEqual([
      'major-capital',
      'regional-seat',
      'large-ordinary-city'
    ]);
  });

  it('uses default city rank for the implicit selected city', () => {
    const items = [
      item({ ...baseCity, id: 'large-ordinary-city', names: { en: 'Large Ordinary City', zh: '普通大城' }, population: 20_000_000, rank: 200 }, 0.9),
      item({ ...baseCity, id: 'major-capital', names: { en: 'Major Capital', zh: '首都' }, population: 2_000_000, rank: 1 }, 0.4)
    ];

    expect(findDefaultSelectedResultItem(items, 'en')?.city.id).toBe('major-capital');
  });
});
