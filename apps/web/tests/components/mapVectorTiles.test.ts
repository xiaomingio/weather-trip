/**
 * 文件说明: 覆盖 WorldWeatherMap 矢量瓦片区域样式表达式，避免仅边界区块透明漏显。
 * 对应文档: docs/specs/40-map-vector-tiles-performance.md
 */
import { describe, expect, it } from 'vitest';
import { applyVectorRegionStyles } from '@/components/WorldWeatherMap/mapVectorTiles';
import {
  regionFillLayerId,
  regionLineLayerId,
  regionNoMetricPatternLayerId
} from '@/components/WorldWeatherMap/mapRegionGeometry';

type PaintKey = `${string}:${string}`;

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

describe('vector region tile styles', () => {
  it('keeps boundary-only admin2 regions visible with no-data styling', () => {
    const map = fakeMap();

    applyVectorRegionStyles(map as never, 'admin2', 'country', [], true);

    expect(map.filters.get(regionFillLayerId('admin2'))).toEqual([
      'any',
      ['==', ['get', 'regionKey'], ''],
      ['==', ['get', 'level'], 'boundary']
    ]);
    expect(map.paints.get(`${regionFillLayerId('admin2')}:fill-opacity`)).toBe(0.08);
    expect(map.paints.get(`${regionNoMetricPatternLayerId('admin2')}:fill-opacity`)).toEqual([
      'case',
      ['==', ['get', 'level'], 'boundary'],
      0.66,
      0
    ]);
    expect(map.paints.get(`${regionLineLayerId('admin2')}:line-opacity`)).toBe(0.46);
    expect(map.paints.get(`${regionLineLayerId('admin2')}:line-width`)).toBe(0.85);
  });

  it('does not include boundary-only regions in lower zoom packages', () => {
    const map = fakeMap();

    applyVectorRegionStyles(map as never, 'admin1', 'world', [], true);

    expect(map.filters.get(regionNoMetricPatternLayerId('admin1'))).toEqual(['==', ['get', 'regionKey'], '']);
    expect(map.paints.get(`${regionLineLayerId('admin1')}:line-opacity`)).toBe(0);
  });
});
