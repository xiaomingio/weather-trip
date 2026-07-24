/**
 * 文件说明: 覆盖 WorldWeatherMap 矢量瓦片区域样式表达式，避免仅边界区块透明漏显。
 * 对应文档: docs/specs/40-map-vector-tiles-performance.md
 */
import { describe, expect, it } from 'vitest';
import type { RegionWeatherSummary } from 'weather-core/types';
import { applyVectorRegionStyles, buildVectorRegionStyleEntries, vectorRegionTooltipLabel } from '@/components/WorldWeatherMap/mapVectorTiles';
import {
  regionFillLayerId,
  regionLineLayerId,
  regionNoMetricPatternLayerId
} from '@/components/WorldWeatherMap/mapRegionGeometry';

type PaintKey = `${string}:${string}`;

const styleLookupExpression = ['coalesce', ['get', 'weatherRegionKey'], ['get', 'regionKey']];

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

describe('vector region tile styles', () => {
  it('keeps all admin2 detail regions visible with no-data styling', () => {
    const map = fakeMap();

    applyVectorRegionStyles(map as never, 'admin2', 'country', [], true);

    expect(map.filters.get(regionFillLayerId('admin2'))).toEqual([
      'any',
      ['==', styleLookupExpression, ''],
      ['in', ['get', 'level'], ['literal', ['admin2', 'boundary']]]
    ]);
    expect(map.paints.get(`${regionFillLayerId('admin2')}:fill-opacity`)).toBe(0.08);
    expect(map.paints.get(`${regionNoMetricPatternLayerId('admin2')}:fill-opacity`)).toEqual([
      'case',
      ['in', ['get', 'level'], ['literal', ['admin2', 'boundary']]],
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
      ['in', ['get', 'level'], ['literal', ['admin1']]]
    ]);
    expect(map.paints.get(`${regionLineLayerId('admin1')}:line-opacity`)).toBe(0.46);
  });

  it('does not paint no-data hatching over admin2 regions with metric data', () => {
    const map = fakeMap();
    const entries = buildVectorRegionStyleEntries([sampleAdmin2RegionSummary], 'country', 'weather-map', 'temperature', 'en', 'c');

    applyVectorRegionStyles(map as never, 'admin2', 'country', entries, true);

    expect(map.paints.get(`${regionNoMetricPatternLayerId('admin2')}:fill-opacity`)).toEqual([
      'case',
      ['in', styleLookupExpression, ['literal', ['admin2:US.CA.037', 'country:US', 'admin1:US.CA']]],
      ['match', styleLookupExpression, 'admin2:US.CA.037', 0, 'country:US', 0, 'admin1:US.CA', 0, 0],
      ['in', ['get', 'level'], ['literal', ['admin2', 'boundary']]],
      0.66,
      0
    ]);
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
