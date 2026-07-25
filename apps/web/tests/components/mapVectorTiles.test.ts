/**
 * 文件说明: 覆盖 WorldWeatherMap 矢量瓦片区域样式表达式，避免仅边界区块透明漏显。
 * 对应文档: docs/specs/40-map-vector-tiles-performance.md
 */
import { readFile } from 'node:fs/promises';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { describe, expect, it } from 'vitest';
import type { RegionWeatherSummary } from 'weather-core/types';
import { applyVectorRegionStyles, buildVectorRegionStyleEntries, vectorRegionTooltipLabel } from '@/components/WorldWeatherMap/mapVectorTiles';
import {
  regionFillLayerId,
  regionLineLayerId,
  regionNoMetricPatternLayerId
} from '@/components/WorldWeatherMap/mapRegionGeometry';

type PaintKey = `${string}:${string}`;
type FeatureProperties = Record<string, string | number | boolean | undefined>;

const styleLookupExpression = ['coalesce', ['get', 'weatherRegionKey'], ['get', 'regionKey']];
const vectorTileSourceLayer = 'weather_region';
const runtimePublicRegionTileBaseUrl = new URL('../../public/data/geo/region-tiles/', import.meta.url);

function fakeMap() {
  const filters = new Map<string, unknown>();
  const paints = new Map<PaintKey, unknown>();
  return {
    filters,
    paints,
    getLayer: () => true,
    setFilter: (layerId: string, filter: unknown) => filters.set(layerId, filter),
    setPaintProperty: (layerId: string, property: string, value: unknown) => paints.set(`${layerId}:${property}`, value)
  };
}

function evaluateExpression(expression: unknown, properties: FeatureProperties): unknown {
  if (!Array.isArray(expression)) return expression;
  const [operator, ...args] = expression;

  if (operator === 'literal') return args[0];
  if (operator === 'get') return typeof args[0] === 'string' ? properties[args[0]] : undefined;
  if (operator === 'coalesce') {
    for (const arg of args) {
      const value = evaluateExpression(arg, properties);
      if (value !== null && value !== undefined) return value;
    }
    return undefined;
  }
  if (operator === '==') return evaluateExpression(args[0], properties) === evaluateExpression(args[1], properties);
  if (operator === 'in') {
    const needle = evaluateExpression(args[0], properties);
    const haystack = evaluateExpression(args[1], properties);
    return Array.isArray(haystack) && haystack.includes(needle);
  }
  if (operator === 'any') return args.some((arg) => Boolean(evaluateExpression(arg, properties)));
  if (operator === 'all') return args.every((arg) => Boolean(evaluateExpression(arg, properties)));
  if (operator === 'case') {
    for (let index = 0; index < args.length - 1; index += 2) {
      if (evaluateExpression(args[index], properties)) return evaluateExpression(args[index + 1], properties);
    }
    return evaluateExpression(args[args.length - 1], properties);
  }
  if (operator === 'match') {
    const input = evaluateExpression(args[0], properties);
    for (let index = 1; index < args.length - 1; index += 2) {
      const label = evaluateExpression(args[index], properties);
      if (Array.isArray(label) ? label.includes(input) : label === input) return evaluateExpression(args[index + 1], properties);
    }
    return evaluateExpression(args[args.length - 1], properties);
  }

  throw new Error(`Unsupported MapLibre expression operator in test evaluator: ${String(operator)}`);
}

function featureMatchesFilter(filter: unknown, properties: FeatureProperties): boolean {
  return Boolean(evaluateExpression(filter, properties));
}

function paintValue(paint: unknown, properties: FeatureProperties): unknown {
  return evaluateExpression(paint, properties);
}

async function readVectorTileFeatures(tilePath: string): Promise<FeatureProperties[]> {
  if (tilePath.includes('..')) throw new Error(`Unexpected vector tile path outside runtime public data: ${tilePath}`);
  const buffer = await readFile(new URL(tilePath, runtimePublicRegionTileBaseUrl));
  const tile = new VectorTile(new Pbf(buffer));
  const layer = tile.layers[vectorTileSourceLayer];
  if (!layer) return [];

  return Array.from({ length: layer.length }, (_, index) => layer.feature(index).properties);
}

const sampleRegionSummary: RegionWeatherSummary = {
  id: 'admin1:US.CA',
  level: 'admin1',
  countryCode: 'US',
  admin1Code: 'CA',
  name: 'California',
  cityCount: 2,
  forecastCount: 2,
  weatherType: 'sunny',
  temperatureMeanC: 24,
  humidityMeanPercent: 55,
  elevationMeters: 120,
  precipitationSumMm: 0,
  windSpeedMaxKmh: 14,
  comfortScore: 0.82,
  matchDays: 0,
  totalDays: 0
};

const sampleAdmin2RegionSummary: RegionWeatherSummary = {
  ...sampleRegionSummary,
  id: 'admin2:US.CA.037',
  level: 'admin2',
  admin1Name: 'California',
  admin2Code: '037',
  name: 'Los Angeles County'
};

const sampleNoMetricAdmin2RegionSummary: RegionWeatherSummary = {
  ...sampleAdmin2RegionSummary,
  id: 'admin2:US.CA.111',
  admin2Code: '111',
  name: 'Ventura County',
  forecastCount: 0
};

describe('vector region tile styles', () => {
  it('keeps admin2 detail and fallback regions visible with no-data styling', () => {
    const map = fakeMap();

    applyVectorRegionStyles(map as never, 'admin2', 'country', [], true);

    expect(map.filters.get(regionFillLayerId('admin2'))).toEqual([
      'any',
      ['==', styleLookupExpression, ''],
      ['in', ['get', 'level'], ['literal', ['country', 'admin1', 'admin2', 'boundary']]]
    ]);
    expect(map.paints.get(`${regionFillLayerId('admin2')}:fill-opacity`)).toBe(0.08);
    expect(map.paints.get(`${regionNoMetricPatternLayerId('admin2')}:fill-opacity`)).toEqual([
      'case',
      ['in', ['get', 'level'], ['literal', ['country', 'admin1', 'admin2', 'boundary']]],
      0.66,
      0
    ]);
    expect(map.paints.get(`${regionLineLayerId('admin2')}:line-opacity`)).toBe(0.46);
    expect(map.paints.get(`${regionLineLayerId('admin2')}:line-width`)).toBe(0.85);
  });

  it('keeps admin1 native boundaries visible at admin1 zoom', () => {
    const map = fakeMap();

    applyVectorRegionStyles(map as never, 'admin1', 'world', [], true);

    expect(map.filters.get(regionNoMetricPatternLayerId('admin1'))).toEqual([
      'any',
      ['==', styleLookupExpression, ''],
      ['in', ['get', 'level'], ['literal', ['country', 'admin1']]]
    ]);
    expect(map.paints.get(`${regionLineLayerId('admin1')}:line-opacity`)).toBe(0.46);
  });

  it('keeps country boundaries visible when weather summaries are unavailable', () => {
    const map = fakeMap();

    applyVectorRegionStyles(map as never, 'country', 'world', [], true);

    const filter = map.filters.get(regionFillLayerId('country'));
    expect(featureMatchesFilter(filter, { countryCode: 'AA', level: 'country', regionKey: 'country:AA' })).toBe(true);
    expect(featureMatchesFilter(filter, { countryCode: 'AA', level: 'admin1', regionKey: 'admin1:AA.1' })).toBe(false);
    expect(map.paints.get(`${regionFillLayerId('country')}:fill-opacity`)).toBe(0.06);
    expect(map.paints.get(`${regionNoMetricPatternLayerId('country')}:fill-opacity`)).toEqual([
      'case',
      ['in', ['get', 'level'], ['literal', ['country']]],
      0.58,
      0
    ]);
  });

  it('does not paint no-data hatching over admin2 regions with metric data', () => {
    const map = fakeMap();
    const entries = buildVectorRegionStyleEntries([sampleAdmin2RegionSummary], 'country', 'weather-map', 'temperature', 'en', 'c');

    applyVectorRegionStyles(map as never, 'admin2', 'country', entries, true);

    expect(map.paints.get(`${regionNoMetricPatternLayerId('admin2')}:fill-opacity`)).toEqual([
      'case',
      ['in', styleLookupExpression, ['literal', ['admin2:US.CA.037', 'country:US', 'admin1:US.CA']]],
      ['match', styleLookupExpression, 'admin2:US.CA.037', 0, 'country:US', 0, 'admin1:US.CA', 0, 0],
      ['in', ['get', 'level'], ['literal', ['country', 'admin1', 'admin2', 'boundary']]],
      0.66,
      0
    ]);
  });

  it('selected country only renders in-scope no-data fallback regions', () => {
    const map = fakeMap();
    const entries = buildVectorRegionStyleEntries(
      [{
        ...sampleRegionSummary,
        id: 'admin1:AA.1',
        countryCode: 'AA',
        admin1Code: '1',
        name: 'Alpha One'
      }],
      'country',
      'weather-map',
      'temperature',
      'en',
      'c'
    );

    applyVectorRegionStyles(map as never, 'admin2', 'country', entries, true, 'country:AA');

    const filter = map.filters.get(regionFillLayerId('admin2'));
    expect(featureMatchesFilter(filter, { countryCode: 'AA', level: 'admin1', regionKey: 'admin1:AA.1', weatherRegionKey: 'admin1:AA.1' })).toBe(true);
    expect(featureMatchesFilter(filter, { countryCode: 'AA', level: 'admin1', regionKey: 'admin1:AA.2', weatherRegionKey: 'admin1:AA.2' })).toBe(true);
    expect(featureMatchesFilter(filter, { countryCode: 'BB', level: 'admin1', regionKey: 'admin1:BB.1', weatherRegionKey: 'admin1:BB.1' })).toBe(false);
    expect(featureMatchesFilter(filter, { countryCode: 'BB', level: 'country', regionKey: 'country:BB' })).toBe(false);
  });

  it('selected admin1 only renders that admin1 scope and hides sibling no-data regions', () => {
    const map = fakeMap();
    const entries = buildVectorRegionStyleEntries(
      [{
        ...sampleRegionSummary,
        id: 'admin1:AA.1',
        countryCode: 'AA',
        admin1Code: '1',
        name: 'Alpha One'
      }],
      'country',
      'weather-map',
      'temperature',
      'en',
      'c'
    );

    applyVectorRegionStyles(map as never, 'admin2', 'country', entries, true, 'admin1:AA.1');

    const filter = map.filters.get(regionFillLayerId('admin2'));
    expect(featureMatchesFilter(filter, { countryCode: 'AA', level: 'admin1', admin1Code: '1', regionKey: 'admin1:AA.1', weatherRegionKey: 'admin1:AA.1' })).toBe(true);
    expect(featureMatchesFilter(filter, { countryCode: 'AA', level: 'admin2', admin1Code: '1', admin2Code: '9', regionKey: 'admin2:AA.1.9', weatherRegionKey: 'admin2:AA.1.9' })).toBe(true);
    expect(featureMatchesFilter(filter, { countryCode: 'AA', level: 'admin1', admin1Code: '2', regionKey: 'admin1:AA.2', weatherRegionKey: 'admin1:AA.2' })).toBe(false);
    expect(featureMatchesFilter(filter, { countryCode: 'AA', level: 'admin2', admin1Code: '2', admin2Code: '9', regionKey: 'admin2:AA.2.9', weatherRegionKey: 'admin2:AA.2.9' })).toBe(false);
    expect(featureMatchesFilter(filter, { countryCode: 'AA', level: 'country', regionKey: 'country:AA' })).toBe(false);
    expect(featureMatchesFilter(filter, { countryCode: 'BB', level: 'admin1', admin1Code: '1', regionKey: 'admin1:BB.1', weatherRegionKey: 'admin1:BB.1' })).toBe(false);
  });

  it('selected admin2 only renders that admin2 scope and hides sibling fallback regions', () => {
    const map = fakeMap();
    const entries = buildVectorRegionStyleEntries(
      [{
        ...sampleAdmin2RegionSummary,
        id: 'admin2:AA.1.9',
        countryCode: 'AA',
        admin1Code: '1',
        admin2Code: '9',
        name: 'Alpha County'
      }],
      'country',
      'weather-map',
      'temperature',
      'en',
      'c'
    );

    applyVectorRegionStyles(map as never, 'admin2', 'country', entries, true, 'admin2:AA.1.9');

    const filter = map.filters.get(regionFillLayerId('admin2'));
    expect(featureMatchesFilter(filter, { countryCode: 'AA', level: 'admin2', admin1Code: '1', admin2Code: '9', regionKey: 'admin2:AA.1.9', weatherRegionKey: 'admin2:AA.1.9' })).toBe(true);
    expect(featureMatchesFilter(filter, { countryCode: 'AA', level: 'admin2', admin1Code: '1', admin2Code: '8', regionKey: 'admin2:AA.1.8', weatherRegionKey: 'admin2:AA.1.8' })).toBe(false);
    expect(featureMatchesFilter(filter, { countryCode: 'AA', level: 'admin1', admin1Code: '1', regionKey: 'admin1:AA.1', weatherRegionKey: 'admin1:AA.1' })).toBe(false);
    expect(featureMatchesFilter(filter, { countryCode: 'BB', level: 'admin2', admin1Code: '1', admin2Code: '9', regionKey: 'admin2:BB.1.9', weatherRegionKey: 'admin2:BB.1.9' })).toBe(false);
  });

  it('metric regions get indicator fill while no-metric regions get hatch opacity', () => {
    const map = fakeMap();
    const entries = buildVectorRegionStyleEntries(
      [sampleAdmin2RegionSummary, sampleNoMetricAdmin2RegionSummary],
      'country',
      'weather-map',
      'temperature',
      'en',
      'c'
    );

    applyVectorRegionStyles(map as never, 'admin2', 'country', entries, true, 'country:US');

    const fillOpacity = map.paints.get(`${regionFillLayerId('admin2')}:fill-opacity`);
    const hatchOpacity = map.paints.get(`${regionNoMetricPatternLayerId('admin2')}:fill-opacity`);
    const metricFeature = {
      countryCode: 'US',
      level: 'admin2',
      regionKey: 'admin2:US.CA.037',
      weatherRegionKey: 'admin2:US.CA.037'
    };
    const noMetricFeature = {
      countryCode: 'US',
      level: 'admin2',
      regionKey: 'admin2:US.CA.111',
      weatherRegionKey: 'admin2:US.CA.111'
    };
    const noDataFallbackFeature = {
      countryCode: 'US',
      level: 'admin2',
      regionKey: 'admin2:US.CA.999',
      weatherRegionKey: 'admin2:US.CA.999'
    };

    expect(paintValue(fillOpacity, metricFeature)).toBe(0.25);
    expect(paintValue(hatchOpacity, metricFeature)).toBe(0);
    expect(paintValue(fillOpacity, noMetricFeature)).toBe(0.08);
    expect(paintValue(hatchOpacity, noMetricFeature)).toBe(0.66);
    expect(paintValue(fillOpacity, noDataFallbackFeature)).toBe(0.08);
    expect(paintValue(hatchOpacity, noDataFallbackFeature)).toBe(0.66);
  });

  it('high-zoom runtime public vector tiles keep C3 C2 and C1 countries at their mapped region levels', async () => {
    const [chinaTileFeatures, chinaDirectMunicipalityTileFeatures, spainTileFeatures, vietnamTileFeatures, nepalTileFeatures] = await Promise.all([
      readVectorTileFeatures('admin2/5/22/11.mvt'),
      readVectorTileFeatures('admin2/5/26/12.mvt'),
      readVectorTileFeatures('admin2/5/15/11.mvt'),
      readVectorTileFeatures('admin2/5/25/13.mvt'),
      readVectorTileFeatures('admin2/5/23/13.mvt')
    ]);

    expect(chinaTileFeatures.some((feature) =>
      feature.countryCode === 'CN' &&
      feature.weatherLevel === 'admin2' &&
      (feature.level === 'admin2' || feature.level === 'boundary')
    )).toBe(true);
    expect(chinaDirectMunicipalityTileFeatures.some((feature) =>
      feature.regionKey === 'admin1:CN.23' &&
      feature.level === 'admin1' &&
      feature.weatherRegionKey === 'admin1:CN.23'
    )).toBe(true);
    expect(chinaDirectMunicipalityTileFeatures.some((feature) =>
      feature.countryCode === 'CN' &&
      ['22', '23', '28', '33'].includes(String(feature.admin1Code)) &&
      feature.level === 'admin2'
    )).toBe(false);
    expect(spainTileFeatures.some((feature) =>
      feature.countryCode === 'ES' &&
      feature.weatherLevel === 'admin2' &&
      feature.level === 'admin2' &&
      typeof feature.weatherRegionKey === 'string' &&
      feature.weatherRegionKey.startsWith('admin2:ES.')
    )).toBe(true);
    expect(vietnamTileFeatures.some((feature) =>
      feature.countryCode === 'VN' &&
      feature.weatherLevel === 'admin1' &&
      feature.level === 'admin1'
    )).toBe(true);
    expect(nepalTileFeatures.some((feature) =>
      feature.countryCode === 'NP' &&
      feature.weatherLevel === 'country' &&
      feature.level === 'country'
    )).toBe(true);
  });

  it('formats region hover labels with country context like city markers', () => {
    const entry = buildVectorRegionStyleEntries([sampleRegionSummary], 'world', 'weather-map', 'temperature', 'en', 'c')[0];

    expect(
      vectorRegionTooltipLabel(
        {
          regionKey: 'admin1:US.CA',
          level: 'admin1',
          countryCode: 'US',
          labelEn: 'California',
          labelZh: '加利福尼亚'
        },
        entry,
        'en',
        'No data'
      )
    ).toBe('California, United States · 24°C');
  });

  it('formats admin2 region hover labels with admin1 and country context', () => {
    const entry = buildVectorRegionStyleEntries([sampleAdmin2RegionSummary], 'country', 'weather-map', 'temperature', 'en', 'c')[0];

    expect(
      vectorRegionTooltipLabel(
        {
          regionKey: 'admin2:US.CA.037',
          level: 'admin2',
          countryCode: 'US',
          labelEn: 'Los Angeles County',
          labelZh: '洛杉矶县'
        },
        entry,
        'en',
        'No data'
      )
    ).toBe('Los Angeles County, California, United States · 24°C');
  });

  it('keeps country context on no-data region hover labels', () => {
    expect(
      vectorRegionTooltipLabel(
        {
          regionKey: 'admin2:US.CA.037',
          level: 'admin2',
          countryCode: 'US',
          labelEn: 'Los Angeles County',
          labelZh: '洛杉矶县'
        },
        undefined,
        'en',
        'No data',
        'California'
      )
    ).toBe('Los Angeles County, California, United States · No data');
  });
});
