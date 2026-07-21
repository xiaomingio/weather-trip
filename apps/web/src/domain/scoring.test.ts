/**
 * 文件说明: 覆盖天气筛选和舒适度评分这些会影响推荐结果的核心规则。
 * 对应文档: docs/product-design.md
 */
import { describe, expect, it } from 'vitest';
import type { City, DailyForecast, TravelFilter } from 'weather-core/types';
import { buildDailyWeather, calculateBestStreak, dayMatchesFilter, scoreCityTravel } from './scoring';
import { getRegionGroup, getRegionLabel, getSortedRegionOptions } from './regions';

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

const filter: TravelFilter = {
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
    const score = scoreCityTravel(
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

  it('sorts single-day weather by population instead of weather comfort', () => {
    const cities = [
      cityWith({ id: 'regional-hub', names: { zh: '区域大城', en: 'Regional Hub' }, population: 12_000_000 }),
      cityWith({ id: 'mid-sized-city', names: { zh: '中型城市', en: 'Mid-sized City' }, population: 2_000_000 }),
      cityWith({ id: 'large-city', names: { zh: '大型城市', en: 'Large City' }, population: 8_000_000 })
    ];
    const forecasts = [
      forecast({ cityId: 'regional-hub', weatherType: 'sunny', temperatureMeanC: 24 }),
      forecast({ cityId: 'mid-sized-city', weatherType: 'rain', temperatureMeanC: 34 }),
      forecast({ cityId: 'large-city', weatherType: 'sunny', temperatureMeanC: 24 })
    ];

    expect(buildDailyWeather(cities, forecasts, '2026-07-21', 'world').map((item) => item.city.id)).toEqual([
      'regional-hub',
      'large-city',
      'mid-sized-city'
    ]);
  });

  it('keeps detailed China fallback cities inside China regions instead of the global view', () => {
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

    expect(buildDailyWeather([detailedChinaCity, globalChinaCity], forecasts, '2026-07-21', 'world').map((item) => item.city.id)).toEqual([
      'cn-tourism-city'
    ]);
    expect(buildDailyWeather([detailedChinaCity, globalChinaCity], forecasts, '2026-07-21', 'country:CN').map((item) => item.city.id)).toEqual([
      'cn-prefecture-representative',
      'cn-tourism-city'
    ]);
    expect(
      buildDailyWeather([detailedChinaCity, globalChinaCity], forecasts, '2026-07-21', 'province:530000').map((item) => item.city.id)
    ).toEqual(['cn-prefecture-representative', 'cn-tourism-city']);
  });
});

describe('region sorting', () => {
  it('keeps regions in product order and sorts countries by locale names', () => {
    const zhOptions = getSortedRegionOptions('zh');
    const zhRegions = zhOptions.filter((option) => getRegionGroup(option, 'zh') === '大区').map((option) => option.id);
    const zhCountries = zhOptions
      .filter((option) => getRegionGroup(option, 'zh') === '国家/地区')
      .map((option) => getRegionLabel(option, 'zh'));
    const enCountries = getSortedRegionOptions('en')
      .filter((option) => getRegionGroup(option, 'en') === 'Countries')
      .map((option) => getRegionLabel(option, 'en'));

    expect(zhRegions).toEqual(['world', 'asia', 'east_asia', 'southeast_asia', 'europe', 'north_america', 'south_america', 'africa', 'oceania']);
    expect(zhCountries.slice(0, 3)).toEqual(['澳大利亚', '德国', '法国']);
    expect(enCountries.slice(0, 3)).toEqual(['Australia', 'Canada', 'China']);
  });
});
