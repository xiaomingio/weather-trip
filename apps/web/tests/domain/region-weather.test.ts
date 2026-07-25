/**
 * 文件说明: 覆盖地图区域着色所依赖的国家、一级行政区和二级行政区天气聚合规则。
 * 对应文档: docs/plans/free-static-data-plan.md
 */
import { describe, expect, it } from 'vitest';
import type { City, DailyForecast, WeatherFilter } from 'weather-core/types';
import { buildWeatherMapRegionSummaries, buildCityFinderRegionSummaries } from '@/domain/region-weather';

const baseCity: City = {
  id: 'city',
  names: { zh: '测试城市', en: 'Test City' },
  country: 'Testland',
  countryCode: 'US',
  admin1: 'California',
  admin1Code: 'CA',
  admin1GroupCode: 'CA',
  latitude: 1,
  longitude: 1,
  timezone: 'UTC',
  population: 1_000_000,
  elevationMeters: 20,
  region: 'north_america',
  selectionReasons: ['population:country-profile']
};

const filter: WeatherFilter = {
  dateWindowDays: 2,
  useTemperature: true,
  temperatureMinC: 10,
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
  weatherTypes: ['sunny'],
  region: 'world'
};

function city(partial: Partial<City>): City {
  return {
    ...baseCity,
    ...partial,
    id: partial.id ?? baseCity.id,
    names: partial.names ?? baseCity.names
  };
}

function forecast(partial: Partial<DailyForecast>): DailyForecast {
  return {
    cityId: partial.cityId ?? baseCity.id,
    date: '2026-07-21',
    weatherCode: 0,
    weatherType: 'sunny',
    temperatureMinC: 18,
    temperatureMaxC: 25,
    temperatureMeanC: 22,
    humidityMeanPercent: 55,
    precipitationSumMm: 0,
    ...partial
  };
}

describe('map region weather summaries', () => {
  it('groups global daily weather by country', () => {
    const summaries = buildWeatherMapRegionSummaries(
      [
        city({ id: 'us-city', countryCode: 'US', country: 'United States' }),
        city({ id: 'jp-city', countryCode: 'JP', country: 'Japan', region: 'asia' })
      ],
      [forecast({ cityId: 'us-city', temperatureMeanC: 24 }), forecast({ cityId: 'jp-city', temperatureMeanC: 18 })],
      '2026-07-21',
      'world',
      'en'
    );

    expect(summaries.map((summary) => summary.id).sort()).toEqual(['country:JP', 'country:US']);
    expect(summaries.find((summary) => summary.id === 'country:US')).toMatchObject({
      level: 'country',
      countryCode: 'US',
      cityCount: 1
    });
  });

  it('groups C2 country travel weather by admin1 region key', () => {
    const california = city({ id: 'los-angeles', admin1: 'California', admin1GroupCode: 'CA', countryTier: 'C2' });
    const nevada = city({ id: 'las-vegas', admin1: 'Nevada', admin1GroupCode: 'NV', countryTier: 'C2' });
    const forecastsByCity = new Map([
      [california.id, [forecast({ cityId: california.id }), forecast({ cityId: california.id, weatherType: 'rain' })]],
      [nevada.id, [forecast({ cityId: nevada.id }), forecast({ cityId: nevada.id })]]
    ]);

    const summaries = buildCityFinderRegionSummaries([california, nevada], forecastsByCity, { ...filter, region: 'country:US' }, 'en');

    expect(summaries.map((summary) => summary.id).sort()).toEqual(['admin1:US.CA', 'admin1:US.NV']);
    expect(summaries.find((summary) => summary.id === 'admin1:US.CA')).toMatchObject({
      level: 'admin1',
      countryCode: 'US',
      admin1Code: 'CA',
      matchDays: 1,
      totalDays: 2
    });
  });

  it('uses associated city samples as the region elevation source', () => {
    const lowCity = city({ id: 'low-city', admin1: 'California', admin1GroupCode: 'CA', countryTier: 'C2', elevationMeters: 100 });
    const highCity = city({ id: 'high-city', admin1: 'California', admin1GroupCode: 'CA', countryTier: 'C2', elevationMeters: 300 });

    const summaries = buildWeatherMapRegionSummaries(
      [lowCity, highCity],
      [forecast({ cityId: lowCity.id }), forecast({ cityId: highCity.id })],
      '2026-07-21',
      'country:US',
      'en'
    );

    expect(summaries).toEqual([
      expect.objectContaining({
        id: 'admin1:US.CA',
        cityCount: 2,
        forecastCount: 2,
        elevationMeters: 200
      })
    ]);
  });

  it('groups C3 country detail weather by admin2 region key', () => {
    const yunnan = city({
      id: 'kunming',
      country: 'China',
      countryCode: 'CN',
      admin1: 'Yunnan',
      admin1GroupCode: '29',
      admin2: 'Kunming Shi',
      admin2Code: '5301',
      countryTier: 'C3',
      region: 'asia',
      selectionReasons: ['coverage-override:admin2']
    });

    const summaries = buildWeatherMapRegionSummaries([yunnan], [forecast({ cityId: yunnan.id })], '2026-07-21', 'country:CN', 'zh');

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: 'admin2:CN.29.5301',
      level: 'admin2',
      countryCode: 'CN',
      admin1Code: '29',
      admin2Code: '5301',
      forecastCount: 1,
      name: 'Kunming Shi'
    });
  });

  it('uses the same C3 city to region mapping for City Finder and Weather Map coloring', () => {
    const dali = city({
      id: 'dali',
      country: 'China',
      countryCode: 'CN',
      admin1: 'Yunnan',
      admin1GroupCode: '29',
      admin2: 'Dali Baizu Zizhizhou',
      admin2Code: '5329',
      countryTier: 'C3',
      region: 'asia',
      selectionReasons: ['coverage-override:admin2']
    });
    const daliForecast = forecast({ cityId: dali.id });
    const weatherMapSummaries = buildWeatherMapRegionSummaries([dali], [daliForecast], '2026-07-21', 'country:CN', 'zh');
    const cityFinderSummaries = buildCityFinderRegionSummaries(
      [dali],
      new Map([[dali.id, [daliForecast]]]),
      { ...filter, region: 'country:CN' },
      'zh'
    );

    expect(cityFinderSummaries.map((summary) => summary.id)).toEqual(weatherMapSummaries.map((summary) => summary.id));
    expect(cityFinderSummaries[0]).toMatchObject({
      id: 'admin2:CN.29.5329',
      level: 'admin2',
      countryCode: 'CN',
      admin1Code: '29',
      admin2Code: '5329'
    });
  });

  it('groups China direct municipalities by admin1 because their city sample represents the whole municipality', () => {
    const shanghai = city({
      id: 'shanghai',
      names: { zh: '上海', en: 'Shanghai' },
      country: 'China',
      countryCode: 'CN',
      admin1: 'Shanghai',
      admin1LocalName: '上海',
      admin1GroupCode: '23',
      admin2: 'Songjiang District',
      admin2LocalName: '松江区',
      admin2Code: '310117',
      countryTier: 'C3',
      region: 'asia',
      selectionReasons: ['coverage-override:admin2']
    });

    const summaries = buildWeatherMapRegionSummaries([shanghai], [forecast({ cityId: shanghai.id })], '2026-07-21', 'country:CN', 'zh');

    expect(summaries).toEqual([
      expect.objectContaining({
        id: 'admin1:CN.23',
        level: 'admin1',
        countryCode: 'CN',
        admin1Code: '23',
        admin2Code: undefined,
        forecastCount: 1,
        name: '上海'
      })
    ]);
  });

  it('groups Hong Kong, Macau and Taiwan cities into China companion C3 regions', () => {
    const hongKong = city({
      id: 'hong-kong',
      names: { zh: '香港', en: 'Hong Kong' },
      country: 'Hong Kong SAR China',
      countryCode: 'HK',
      admin1: undefined,
      admin1Code: undefined,
      admin1GroupCode: undefined,
      admin2: undefined,
      admin2Code: undefined,
      countryTier: 'C1',
      region: 'asia'
    });
    const macau = city({
      id: 'macau',
      names: { zh: '澳门', en: 'Macau' },
      country: 'Macao SAR China',
      countryCode: 'MO',
      admin1: undefined,
      admin1Code: undefined,
      admin1GroupCode: undefined,
      admin2: undefined,
      admin2Code: undefined,
      countryTier: 'C1',
      region: 'asia'
    });
    const taiwan = city({
      id: 'taipei',
      names: { zh: '台北', en: 'Taipei' },
      country: 'Taiwan',
      countryCode: 'TW',
      admin1: undefined,
      admin1Code: undefined,
      admin1GroupCode: undefined,
      admin2: undefined,
      admin2Code: undefined,
      countryTier: 'C1',
      region: 'asia'
    });

    const summaries = buildWeatherMapRegionSummaries(
      [hongKong, macau, taiwan],
      [forecast({ cityId: hongKong.id }), forecast({ cityId: macau.id }), forecast({ cityId: taiwan.id })],
      '2026-07-21',
      'country:CN',
      'zh'
    );

    expect(summaries.map((summary) => summary.id).sort()).toEqual(['admin2:CN.HK.810000', 'admin2:CN.MO.820000', 'admin2:CN.TW.710000']);
    expect(summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'admin2:CN.HK.810000',
          level: 'admin2',
          countryCode: 'CN',
          admin1Code: 'HK',
          admin2Code: '810000',
          forecastCount: 1
        }),
        expect.objectContaining({
          id: 'admin2:CN.MO.820000',
          level: 'admin2',
          countryCode: 'CN',
          admin1Code: 'MO',
          admin2Code: '820000',
          forecastCount: 1
        }),
        expect.objectContaining({
          id: 'admin2:CN.TW.710000',
          level: 'admin2',
          countryCode: 'CN',
          admin1Code: 'TW',
          admin2Code: '710000',
          forecastCount: 1
        })
      ])
    );
  });

  it('keeps C3 admin2 regions visible when a city has no weather row', () => {
    const xiantao = city({
      id: 'xiantao',
      names: { zh: '仙桃', en: 'Xiantao' },
      country: 'China',
      countryCode: 'CN',
      admin1: 'Hubei',
      admin1GroupCode: '12',
      admin2: 'Xiantao',
      admin2LocalName: '仙桃',
      admin2Code: '12324200',
      countryTier: 'C3',
      elevationMeters: 36,
      region: 'asia'
    });

    const summaries = buildWeatherMapRegionSummaries([xiantao], [], '2026-07-21', 'admin1:CN.12', 'zh');

    expect(summaries).toEqual([
      expect.objectContaining({
        id: 'admin2:CN.12.12324200',
        level: 'admin2',
        cityCount: 1,
        forecastCount: 0,
        elevationMeters: 36,
        name: '仙桃'
      })
    ]);
  });

  it('does not fall back to admin1 coloring for C3 country cities without admin2', () => {
    const cityWithoutAdmin2 = city({
      id: 'xiamen',
      country: 'China',
      countryCode: 'CN',
      admin1: 'Fujian',
      admin1GroupCode: '07',
      countryTier: 'C3',
      region: 'asia'
    });

    const summaries = buildWeatherMapRegionSummaries(
      [cityWithoutAdmin2],
      [forecast({ cityId: cityWithoutAdmin2.id })],
      '2026-07-21',
      'country:CN',
      'zh'
    );

    expect(summaries).toEqual([]);
  });
});
