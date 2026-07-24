/**
 * 文件说明: 覆盖 WorldWeatherMap 点位避让密度随 zoom 和点数变化的交互规则。
 * 对应文档: docs/specs/22-weather-map-interactions.md
 */
import { describe, expect, it } from 'vitest';
import type { City, DailyForecast } from 'weather-core/types';
import { buildMapPoints, buildPointGeojson, markerCellSize } from '@/components/WorldWeatherMap/mapMarkers';
import type { DashboardCityFinderResultItem, DashboardWeatherMapResultItem } from '@/domain/weather-dashboard-shared';

const city: City = {
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

const forecast: DailyForecast = {
  cityId: city.id,
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

describe('map marker density', () => {
  it('keeps sparse global views readable', () => {
    expect(markerCellSize(1.4, 3000)).toBe(64);
    expect(markerCellSize(2.4, 3000)).toBe(56);
  });

  it('continues decluttering dense country views when zoomed out', () => {
    expect(markerCellSize(5.2, 337)).toBe(34);
    expect(markerCellSize(5.2, 80)).toBe(0);
  });

  it('shows all markers after the user zooms in enough', () => {
    expect(markerCellSize(6, 337)).toBe(0);
  });
});

describe('map marker comfort labels', () => {
  it('shows weather map comfort scores as percentages on city markers', () => {
    const item: DashboardWeatherMapResultItem = {
      tool: 'weather-map',
      city,
      forecast,
      comfortScore: 0.82
    };

    expect(
      buildMapPoints({
        tool: 'weather-map',
        resultItems: [item],
        layer: 'comfort',
        locale: 'en',
        temperatureUnit: 'c',
        selectedCityId: null,
        hasRegionLayer: true
      })[0]
    ).toMatchObject({
      markerText: '82%',
      tooltip: 'Sample City, Sample Region, Sierra Leone · 82%',
      size: 34
    });
  });

  it('shows city finder match ratios as percentages on comfort markers', () => {
    const item: DashboardCityFinderResultItem = {
      tool: 'city-finder',
      city,
      matchDays: 3,
      totalDays: 4,
      score: 0.75,
      averageTemperatureC: 24,
      averagePrecipitationMm: 0,
      averageHumidityPercent: 55,
      averageWindSpeedKmh: 10,
      rainDays: 0,
      bestStreakDays: 3,
      weatherType: 'sunny'
    };

    expect(
      buildMapPoints({
        tool: 'city-finder',
        resultItems: [item],
        layer: 'comfort',
        locale: 'en',
        temperatureUnit: 'c',
        selectedCityId: null,
        hasRegionLayer: true
      })[0]
    ).toMatchObject({
      markerText: '75%',
      tooltip: 'Sample City, Sample Region, Sierra Leone · 75%',
      size: 34
    });
  });

  it('passes marker tooltips through to the map source', () => {
    const item: DashboardWeatherMapResultItem = {
      tool: 'weather-map',
      city,
      forecast,
      comfortScore: 0.82
    };
    const points = buildMapPoints({
      tool: 'weather-map',
      resultItems: [item],
      layer: 'weather',
      locale: 'en',
      temperatureUnit: 'c',
      selectedCityId: null,
      hasRegionLayer: true
    });

    expect(buildPointGeojson(points).features[0].properties.tooltip).toBe('Sample City, Sample Region, Sierra Leone · Sunny');
  });

  it('uses default city rank as the marker declutter priority', () => {
    const lowerRankCity: City = {
      ...city,
      id: 'major-capital',
      names: { zh: '首都', en: 'Major Capital' },
      rank: 1
    };
    const higherRankCity: City = {
      ...city,
      id: 'large-ordinary-city',
      names: { zh: '普通大城', en: 'Large Ordinary City' },
      population: 20_000_000,
      rank: 200
    };
    const points = buildMapPoints({
      tool: 'weather-map',
      resultItems: [
        { tool: 'weather-map', city: lowerRankCity, forecast: { ...forecast, cityId: lowerRankCity.id }, comfortScore: 0.6 },
        { tool: 'weather-map', city: higherRankCity, forecast: { ...forecast, cityId: higherRankCity.id }, comfortScore: 0.9 }
      ],
      layer: 'comfort',
      locale: 'en',
      temperatureUnit: 'c',
      selectedCityId: null,
      hasRegionLayer: true
    });
    const sortKeys = Object.fromEntries(buildPointGeojson(points).features.map((feature) => [feature.properties.cityId, feature.properties.sortKey]));

    expect(sortKeys['major-capital']).toBeGreaterThan(sortKeys['large-ordinary-city']);
  });
});
