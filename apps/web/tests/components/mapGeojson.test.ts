/**
 * 文件说明: 覆盖 WorldWeatherMap GeoJSON 边界计算在大规模坐标输入下的稳定性。
 * 对应文档: docs/specs/10-product-design.md
 */
import { describe, expect, it } from 'vitest';
import type { City, RegionWeatherSummary } from 'weather-core/types';
import {
  buildBoundsFromPoints,
  buildGeojsonBounds,
  buildSelectedRegionOutlineGeojson,
  decorateRegionGeojson,
  normalizeRegionGeojson,
  regionGeojsonAsset
} from '@/components/WorldWeatherMap/mapGeojson';

describe('map GeoJSON bounds', () => {
  it('builds bounds for large admin boundary point sets without overflowing the call stack', () => {
    const points = Array.from({ length: 130_000 }, (_, index) => [
      70 + (index % 80) * 0.5,
      15 + (index % 40) * 0.25
    ]) as [number, number][];

    const bounds = buildBoundsFromPoints(points);

    expect(bounds?.getSouth()).toBe(15);
    expect(bounds?.getNorth()).toBe(24.75);
    expect(bounds?.getWest()).toBe(70);
    expect(bounds?.getEast()).toBe(109.5);
  });
});

describe('map GeoJSON asset selection', () => {
  const summary: RegionWeatherSummary = {
    id: 'admin1:US.CA',
    level: 'admin1',
    countryCode: 'US',
    admin1Code: 'CA',
    name: 'California',
    cityCount: 1,
    forecastCount: 1,
    weatherType: 'sunny',
    temperatureMeanC: 20,
    humidityMeanPercent: 50,
    elevationMeters: 80,
    precipitationSumMm: 0,
    windSpeedMaxKmh: 10,
    comfortScore: 0.9,
    matchDays: 1,
    totalDays: 1
  };
  const city: City = {
    id: 'los-angeles',
    names: { zh: '洛杉矶', en: 'Los Angeles' },
    country: 'United States',
    countryCode: 'US',
    admin1: 'California',
    admin1Code: 'CA',
    admin1GroupCode: 'CA',
    latitude: 34,
    longitude: -118,
    timezone: 'UTC',
    population: 4_000_000,
    elevationMeters: 80,
    region: 'north_america',
    selectionReasons: []
  };

  it('uses the world boundary package for C2 countries without country detail geojson', () => {
    expect(regionGeojsonAsset('country:US', [summary], [{ ...city, countryTier: 'C2' }])).toMatchObject({
      key: 'world',
      url: '/data/geo/world.geojson',
      layer: 'world'
    });
  });

  it('uses country detail geojson for C3 countries', () => {
    expect(
      regionGeojsonAsset('country:CN', [{ ...summary, id: 'admin2:CN.29.5301', level: 'admin2', countryCode: 'CN' }], [
        { ...city, country: 'China', countryCode: 'CN', countryTier: 'C3' }
      ])
    ).toMatchObject({
      key: 'country:CN',
      url: '/data/geo/countries/CN.geojson',
      layer: 'country'
    });
  });
});

describe('map GeoJSON decoration', () => {
  it('keeps no-weather regions visible as low-opacity no-metric blocks', () => {
    const geojson = decorateRegionGeojson(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { regionKey: 'admin2:CN.12.12324200' },
            geometry: { type: 'Polygon', coordinates: [] }
          }
        ]
      },
      [
        {
          id: 'admin2:CN.12.12324200',
          level: 'admin2',
          countryCode: 'CN',
          admin1Code: '12',
          admin2Code: '12324200',
          name: '仙桃市',
          cityCount: 1,
          forecastCount: 0,
          weatherType: 'cloudy',
          temperatureMeanC: 0,
          humidityMeanPercent: 0,
          elevationMeters: 36,
          precipitationSumMm: 0,
          windSpeedMaxKmh: 0,
          comfortScore: 0,
          matchDays: 0,
          totalDays: 0
        }
      ],
      'country',
      'country',
      'admin1:CN.12',
      'weather-map',
      'temperature',
      'zh',
      'c'
    );

    expect(geojson.features[0].properties).toMatchObject({
      isVisibleRegion: true,
      hasCity: true,
      hasMetricData: false,
      fillColor: '#2f3531',
      fillOpacity: 0.08,
      label: '仙桃 暂无数据'
    });
  });

  it('keeps boundary-only regions visible as low-opacity no-metric blocks', () => {
    const geojson = decorateRegionGeojson(
      normalizeRegionGeojson({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              regionKey: 'boundary:CN.13.659004',
              labelZh: '五家渠',
              labelEn: 'Wujiaqu',
              hasCity: false
            },
            geometry: { type: 'Polygon', coordinates: [] }
          }
        ]
      }),
      [],
      'country',
      'country',
      'admin1:CN.13',
      'weather-map',
      'temperature',
      'en',
      'c'
    );

    expect(geojson.features[0].properties).toMatchObject({
      isVisibleRegion: true,
      hasCity: false,
      hasMetricData: false,
      fillColor: '#2f3531',
      fillOpacity: 0.08,
      label: 'Wujiaqu No data'
    });
  });

  it('does not treat parent fallback boundaries as no-metric weather regions', () => {
    const geojson = decorateRegionGeojson(
      normalizeRegionGeojson({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              regionKey: 'admin1:CN.01',
              labelZh: '安徽',
              labelEn: 'Anhui',
              hasCity: true
            },
            geometry: { type: 'Polygon', coordinates: [] }
          }
        ]
      }),
      [],
      'country',
      'country',
      'country:CN',
      'weather-map',
      'temperature',
      'zh',
      'c'
    );

    expect(geojson.features[0].properties).toMatchObject({
      isVisibleRegion: false,
      isNoMetricRegion: false,
      fillOpacity: 0
    });
  });

  it('does not show boundary-only regions outside the selected admin1 scope', () => {
    const geojson = decorateRegionGeojson(
      normalizeRegionGeojson({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              regionKey: 'boundary:CN.13.659004',
              labelZh: '五家渠',
              labelEn: 'Wujiaqu',
              hasCity: false
            },
            geometry: { type: 'Polygon', coordinates: [] }
          }
        ]
      }),
      [],
      'country',
      'country',
      'admin1:CN.12',
      'weather-map',
      'temperature',
      'zh',
      'c'
    );

    expect(geojson.features[0].properties).toMatchObject({
      isVisibleRegion: false,
      label: ''
    });
  });
});

describe('selected region outline GeoJSON', () => {
  const geojson = normalizeRegionGeojson({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { regionKey: 'admin1:FR.11' },
        geometry: { type: 'Polygon', coordinates: [] }
      },
      {
        type: 'Feature',
        properties: { regionKey: 'admin1:FR.93' },
        geometry: { type: 'Polygon', coordinates: [] }
      },
      {
        type: 'Feature',
        properties: { regionKey: 'admin2:FR.11.75' },
        geometry: { type: 'Polygon', coordinates: [] }
      },
      {
        type: 'Feature',
        properties: { regionKey: 'admin2:FR.11.92' },
        geometry: { type: 'Polygon', coordinates: [] }
      }
    ]
  });
  const regionOutlineGeojson = normalizeRegionGeojson({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { regionKey: 'country:FR' },
        geometry: { type: 'Polygon', coordinates: [] }
      },
      {
        type: 'Feature',
        properties: { regionKey: 'country:DE' },
        geometry: { type: 'Polygon', coordinates: [] }
      },
      {
        type: 'Feature',
        properties: { regionKey: 'europe' },
        geometry: { type: 'Polygon', coordinates: [] }
      }
    ]
  });

  it('returns an empty outline for the world region', () => {
    expect(buildSelectedRegionOutlineGeojson(geojson, regionOutlineGeojson, 'world').features).toHaveLength(0);
  });

  it('uses the exact selected region feature when it exists', () => {
    expect(
      buildSelectedRegionOutlineGeojson(geojson, regionOutlineGeojson, 'admin1:FR.11').features.map((feature) => feature.properties.regionKey)
    ).toEqual(['admin1:FR.11']);
  });

  it('uses the whole-country outline feature for a selected country', () => {
    expect(buildSelectedRegionOutlineGeojson(geojson, regionOutlineGeojson, 'country:FR').features.map((feature) => feature.properties.regionKey)).toEqual([
      'country:FR'
    ]);
  });

  it('does not compose a missing country outline from child features', () => {
    expect(buildSelectedRegionOutlineGeojson(geojson, null, 'country:FR').features).toHaveLength(0);
  });

  it('uses the exact outline feature for broad regions such as continents', () => {
    expect(buildSelectedRegionOutlineGeojson(geojson, regionOutlineGeojson, 'europe').features.map((feature) => feature.properties.regionKey)).toEqual([
      'europe'
    ]);
  });

  it('does not compose a broad region outline from country features', () => {
    const countryOnlyOutlines = normalizeRegionGeojson({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { regionKey: 'country:FR' },
          geometry: { type: 'Polygon', coordinates: [] }
        }
      ]
    });

    expect(buildSelectedRegionOutlineGeojson(geojson, countryOnlyOutlines, 'europe').features).toHaveLength(0);
  });

  it('builds camera bounds from the selected whole-region outline instead of child subdivision features', () => {
    const selectedOutline = buildSelectedRegionOutlineGeojson(
      geojson,
      normalizeRegionGeojson({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { regionKey: 'country:FR' },
            geometry: {
              type: 'Polygon',
              coordinates: [[[-5, 41], [9, 41], [9, 51], [-5, 51], [-5, 41]]]
            }
          }
        ]
      }),
      'country:FR'
    );

    const bounds = buildGeojsonBounds(selectedOutline);

    expect(bounds?.getWest()).toBe(-5);
    expect(bounds?.getEast()).toBe(9);
    expect(bounds?.getSouth()).toBe(41);
    expect(bounds?.getNorth()).toBe(51);
  });
});
