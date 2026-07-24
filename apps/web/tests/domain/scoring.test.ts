/**
 * 文件说明: 覆盖天气筛选、舒适度评分和静态快照地区派生这些会影响推荐结果的核心规则。
 * 对应文档: docs/plans/free-static-data-plan.md
 */
import { describe, expect, it } from 'vitest';
import type { City, DailyForecast, WeatherDataSnapshot, WeatherFilter } from 'weather-core/types';
import { buildWeatherMapCityWeather, calculateBestStreak, dayMatchesFilter, scoreCityFinderMatch } from '@/domain/scoring';
import { getRegionGroup, getSortedRegionOptions } from '@/domain/regions';
import { buildRegionsPayload } from '@/domain/weather-dashboard-payload';
import { weatherSnapshotFromForecasts } from './weatherSnapshotTestFixture';

const city: City = {
  id: 'test',
  names: {
    zh: '测试城市',
    en: 'Test City'
  },
  country: 'Testland',
  latitude: 1,
  longitude: 1,
  timezone: 'UTC',
  elevationMeters: 12,
  region: 'asia'
};

const filter: WeatherFilter = {
  dateWindowDays: 3,
  useTemperature: true,
  temperatureMinC: 15,
  temperatureMaxC: 30,
  useHumidity: false,
  humidityMinPercent: 40,
  humidityMaxPercent: 70,
  usePrecipitation: false,
  precipitationMinMm: 0,
  precipitationMaxMm: 5,
  useWind: false,
  windSpeedMinKmh: 0,
  windSpeedMaxKmh: 30,
  useElevation: false,
  elevationMinMeters: 0,
  elevationMaxMeters: 5000,
  useWeather: true,
  weatherTypes: ['sunny', 'partly_cloudy'],
  region: 'world'
};

function forecast(partial: Partial<DailyForecast>): DailyForecast {
  return {
    cityId: city.id,
    date: '2026-07-21',
    weatherCode: 0,
    weatherType: 'sunny',
    temperatureMinC: 20,
    temperatureMaxC: 28,
    temperatureMeanC: 24,
    humidityMeanPercent: 55,
    precipitationSumMm: 0,
    ...partial
  };
}

function cityWith(partial: Partial<City>): City {
  return {
    ...city,
    ...partial,
    id: partial.id ?? city.id,
    names: partial.names ?? city.names
  };
}

describe('travel scoring', () => {
  it('requires min and max temperatures to stay inside the selected range', () => {
    expect(dayMatchesFilter(forecast({ temperatureMeanC: 24, weatherType: 'sunny' }), filter)).toBe(true);
    expect(dayMatchesFilter(forecast({ temperatureMinC: 14, temperatureMeanC: 24, weatherType: 'sunny' }), filter)).toBe(false);
    expect(dayMatchesFilter(forecast({ temperatureMaxC: 31, temperatureMeanC: 24, weatherType: 'sunny' }), filter)).toBe(false);
    expect(dayMatchesFilter(forecast({ temperatureMeanC: 24, weatherType: 'rain' }), filter)).toBe(false);
  });

  it('skips disabled temperature or weather filters', () => {
    expect(
      dayMatchesFilter(forecast({ temperatureMinC: 2, temperatureMaxC: 40, weatherType: 'sunny' }), {
        ...filter,
        useTemperature: false
      })
    ).toBe(true);
    expect(
      dayMatchesFilter(forecast({ temperatureMeanC: 24, weatherType: 'rain' }), {
        ...filter,
        useWeather: false
      })
    ).toBe(true);
  });

  it('requires humidity to stay inside the selected range when enabled', () => {
    expect(
      dayMatchesFilter(forecast({ humidityMeanPercent: 55 }), {
        ...filter,
        useHumidity: true
      })
    ).toBe(true);
    expect(
      dayMatchesFilter(forecast({ humidityMeanPercent: 85 }), {
        ...filter,
        useHumidity: true
      })
    ).toBe(false);
  });

  it('scores cities by matching days within the selected window', () => {
    const score = scoreCityFinderMatch(
      city,
      [
        forecast({ date: '2026-07-21', temperatureMeanC: 24 }),
        forecast({ date: '2026-07-22', temperatureMinC: 13, temperatureMeanC: 19 }),
        forecast({ date: '2026-07-23', weatherType: 'partly_cloudy' }),
        forecast({ date: '2026-07-24', temperatureMeanC: 24 })
      ],
      filter
    );

    expect(score.matchDays).toBe(2);
    expect(score.totalDays).toBe(3);
    expect(score.bestStreakDays).toBe(1);
  });

  it('calculates the longest consecutive matching streak', () => {
    expect(calculateBestStreak([true, true, false, true, true, true])).toBe(3);
  });

  it('sorts single-day weather by default city rank instead of weather comfort', () => {
    const cities = [
      cityWith({ id: 'regional-hub', names: { zh: '区域大城', en: 'Regional Hub' }, population: 12_000_000, rank: 2 }),
      cityWith({ id: 'mid-sized-city', names: { zh: '中型城市', en: 'Mid-sized City' }, population: 2_000_000, rank: 1 }),
      cityWith({ id: 'large-city', names: { zh: '大型城市', en: 'Large City' }, population: 8_000_000, rank: 3 })
    ];
    const forecasts = [
      forecast({ cityId: 'regional-hub', weatherType: 'sunny', temperatureMeanC: 24 }),
      forecast({ cityId: 'mid-sized-city', weatherType: 'rain', temperatureMeanC: 34 }),
      forecast({ cityId: 'large-city', weatherType: 'sunny', temperatureMeanC: 24 })
    ];

    expect(buildWeatherMapCityWeather(cities, forecasts, '2026-07-21', 'world').map((item) => item.city.id)).toEqual([
      'mid-sized-city',
      'regional-hub',
      'large-city'
    ]);
  });

  it('keeps all supported static weather points available in the global view', () => {
    const detailedChinaCity = cityWith({
      id: 'cn-prefecture-representative',
      country: 'China',
      countryCode: 'CN',
      admin1GroupCode: '29',
      selectionReasons: ['fallback:china-admin2-representative']
    });
    const globalChinaCity = cityWith({
      id: 'cn-tourism-city',
      country: 'China',
      countryCode: 'CN',
      admin1GroupCode: '29',
      selectionReasons: ['tourism:curated', 'fallback:china-admin2-representative']
    });
    const forecasts = [
      forecast({ cityId: detailedChinaCity.id }),
      forecast({ cityId: globalChinaCity.id })
    ];

    expect(buildWeatherMapCityWeather([detailedChinaCity, globalChinaCity], forecasts, '2026-07-21', 'world').map((item) => item.city.id)).toEqual([
      'cn-prefecture-representative',
      'cn-tourism-city'
    ]);
    expect(buildWeatherMapCityWeather([detailedChinaCity, globalChinaCity], forecasts, '2026-07-21', 'country:CN').map((item) => item.city.id)).toEqual([
      'cn-prefecture-representative',
      'cn-tourism-city'
    ]);
    expect(buildWeatherMapCityWeather([detailedChinaCity, globalChinaCity], forecasts, '2026-07-21', 'admin1:CN.29').map((item) => item.city.id)).toEqual([
      'cn-prefecture-representative',
      'cn-tourism-city'
    ]);
  });
});

describe('region sorting', () => {
  it('keeps fixed regions in product order and derives detailed country options from the snapshot', () => {
    const zhRegions = getSortedRegionOptions('zh').filter((option) => getRegionGroup(option, 'zh') === '大区').map((option) => option.id);
    const countryCities = [
      cityWith({ id: 'de-city', country: 'Germany', countryCode: 'DE', region: 'europe', countryTier: 'C1' }),
      cityWith({ id: 'us-city', country: 'United States', countryCode: 'US', region: 'north_america', countryTier: 'C2' }),
      cityWith({ id: 'fr-city', country: 'France', countryCode: 'FR', region: 'europe', countryTier: 'C3' }),
      cityWith({ id: 'cn-city', country: 'China', countryCode: 'CN', region: 'asia', countryTier: 'C3' })
    ];
    const snapshot: WeatherDataSnapshot = weatherSnapshotFromForecasts({
      cities: countryCities,
      dates: ['2026-07-21'],
      forecasts: countryCities.map((item) => forecast({ cityId: item.id })),
      defaultDate: '2026-07-21'
    });
    const zhCountries = buildRegionsPayload(snapshot, { locale: 'zh', searchParams: new URLSearchParams() })
      .regions.filter((option) => option.group === '地区/国家')
      .map((option) => option.label);
    const enCountries = buildRegionsPayload(snapshot, { locale: 'en', searchParams: new URLSearchParams() })
      .regions.filter((option) => option.group === 'Countries')
      .map((option) => option.label);

    expect(zhRegions).toEqual(['world', 'asia', 'east_asia', 'southeast_asia', 'europe', 'north_america', 'south_america', 'africa', 'oceania']);
    expect(zhCountries).toEqual(['法国', '美国', '中国']);
    expect(enCountries).toEqual(['China', 'France', 'United States']);
  });
});
