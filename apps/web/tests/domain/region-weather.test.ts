/**
 * 文件说明: 覆盖地图区域着色所依赖的国家和一级行政区天气聚合规则。
 * 对应文档: docs/map-region-coloring.md
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

  it('groups detailed country travel weather by map partition code', () => {
    const california = city({ id: 'los-angeles', admin1: 'California', admin1GroupCode: 'CA' });
    const nevada = city({ id: 'las-vegas', admin1: 'Nevada', admin1GroupCode: 'NV' });
    const forecastsByCity = new Map([
      [california.id, [forecast({ cityId: california.id }), forecast({ cityId: california.id, weatherType: 'rain' })]],
      [nevada.id, [forecast({ cityId: nevada.id }), forecast({ cityId: nevada.id })]]
    ]);

    const summaries = buildCityFinderRegionSummaries([california, nevada], forecastsByCity, { ...filter, region: 'country:US' }, 'en');

    expect(summaries.map((summary) => summary.id).sort()).toEqual(['partition:US.CA', 'partition:US.NV']);
    expect(summaries.find((summary) => summary.id === 'partition:US.CA')).toMatchObject({
      level: 'partition',
      countryCode: 'US',
      partitionCode: 'CA',
      matchDays: 1,
      totalDays: 2
    });
  });

  it('keeps China partition summaries keyed by the same region contract as other countries', () => {
    const yunnan = city({
      id: 'kunming',
      country: 'China',
      countryCode: 'CN',
      admin1: 'Yunnan',
      admin1GroupCode: '29',
      region: 'asia',
      selectionReasons: ['fallback:china-admin2-representative']
    });

    const summaries = buildWeatherMapRegionSummaries([yunnan], [forecast({ cityId: yunnan.id })], '2026-07-21', 'country:CN', 'zh');

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: 'partition:CN.29',
      level: 'partition',
      countryCode: 'CN',
      partitionCode: '29',
      name: 'Yunnan'
    });
  });
});
