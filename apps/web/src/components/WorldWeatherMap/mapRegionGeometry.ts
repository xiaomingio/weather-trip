/**
 * 文件说明: 提供 WorldWeatherMap 矢量瓦片图层 ID 和相机 bounds 计算工具。
 * 对应文档: docs/specs/41-weather-map-interactions.md
 */

import maplibregl from 'maplibre-gl';
import type { BoundsPoint } from './types';

export type MapTileRegionLayer = 'country' | 'admin1' | 'admin2';

export function regionSourceId(layer: MapTileRegionLayer): string {
  return `weather-region-${layer}`;
}

export function regionFillLayerId(layer: MapTileRegionLayer): string {
  return `${regionSourceId(layer)}-fill`;
}

export function regionNoMetricPatternLayerId(layer: MapTileRegionLayer): string {
  return `${regionSourceId(layer)}-no-metric-pattern`;
}

export function regionLineLayerId(layer: MapTileRegionLayer): string {
  return `${regionSourceId(layer)}-line`;
}

export function regionHoverLayerId(layer: MapTileRegionLayer): string {
  return `${regionSourceId(layer)}-hover`;
}

export function regionHoverLineLayerId(layer: MapTileRegionLayer): string {
  return `${regionSourceId(layer)}-hover-line`;
}

export function regionHoverShadowLayerId(layer: MapTileRegionLayer): string {
  return `${regionSourceId(layer)}-hover-shadow`;
}

function normalizeLongitude(longitude: number): number {
  return ((longitude % 360) + 360) % 360;
}

export function buildBoundsFromPoints(points: BoundsPoint[]): maplibregl.LngLatBounds | null {
  if (points.length === 0) return null;

  let minLatitude = Number.POSITIVE_INFINITY;
  let maxLatitude = Number.NEGATIVE_INFINITY;
  const longitudes: number[] = [];

  for (const [longitude, latitude] of points) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    minLatitude = Math.min(minLatitude, latitude);
    maxLatitude = Math.max(maxLatitude, latitude);
    longitudes.push(normalizeLongitude(longitude));
  }

  if (longitudes.length === 0) return null;
  longitudes.sort((left, right) => left - right);

  let largestGapIndex = 0;
  let largestGap = -1;
  for (let index = 0; index < longitudes.length; index += 1) {
    const nextIndex = (index + 1) % longitudes.length;
    const nextLongitude = nextIndex === 0 ? longitudes[0] + 360 : longitudes[nextIndex];
    const gap = nextLongitude - longitudes[index];
    if (gap > largestGap) {
      largestGap = gap;
      largestGapIndex = index;
    }
  }

  const westIndex = (largestGapIndex + 1) % longitudes.length;
  const westNormalized = longitudes[westIndex];
  const eastNormalized =
    longitudes[largestGapIndex] < westNormalized ? longitudes[largestGapIndex] + 360 : longitudes[largestGapIndex];
  const west = westNormalized > 180 ? westNormalized - 360 : westNormalized;
  const east = west + (eastNormalized - westNormalized);

  return new maplibregl.LngLatBounds([west, minLatitude], [east, maxLatitude]);
}
