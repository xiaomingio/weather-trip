/**
 * 文件说明: 处理 WorldWeatherMap 地区 GeoJSON 归一化、着色、边界和地图资源选择。
 * 对应文档: docs/product-design.md
 */

import maplibregl from 'maplibre-gl';
import type { MapLayer, RegionKey, RegionWeatherSummary, WeatherToolId } from 'weather-core/types';
import { chinaGeoNamesCodeByAdmin1Adcode } from '@/domain/china-admin1';
import type { DisplayLocale, TemperatureUnit } from '@/domain/format';
import type { MapRegionLayer } from '@/domain/regions';
import { getWeatherTypeLabel } from '@/domain/weather';
import {
  comfortColor,
  elevationColor,
  humidityColor,
  precipitationColor,
  relativeMatchColor,
  temperatureColor,
  temperatureLabel,
  weatherColor,
  windColor
} from './mapColors';
import type { BoundsPoint, MapGeoJson, RegionGeojsonAsset } from './types';

export function regionSourceId(layer: MapRegionLayer): string {
  if (layer === 'country') return 'world-countries';
  return 'weather-partitions';
}

export function regionFillLayerId(layer: MapRegionLayer): string {
  return `${regionSourceId(layer)}-fill`;
}

export function regionLineLayerId(layer: MapRegionLayer): string {
  return `${regionSourceId(layer)}-line`;
}

function regionKeyForFeature(feature: { properties: Record<string, unknown> }): string {
  return String(feature.properties.regionKey ?? '');
}

export function normalizeRegionGeojson(geojson: MapGeoJson, layer: MapRegionLayer): MapGeoJson {
  return {
    ...geojson,
    features: geojson.features.map((feature) => {
      const sourceRegionKey = typeof feature.properties.regionKey === 'string' ? feature.properties.regionKey : null;
      const legacySourceRegionMatch = /^admin1:([A-Z]{2})\.(.+)$/.exec(sourceRegionKey ?? '');
      const partitionCode = chinaGeoNamesCodeByAdmin1Adcode[String(feature.properties.adcode ?? '')];
      const regionKey =
        layer === 'country'
          ? sourceRegionKey
          : legacySourceRegionMatch
            ? `partition:${legacySourceRegionMatch[1]}.${legacySourceRegionMatch[2]}`
            : partitionCode
              ? `partition:CN.${partitionCode}`
              : sourceRegionKey;

      return {
        ...feature,
        properties: {
          ...feature.properties,
          regionKey: regionKey ?? ''
        }
      };
    })
  };
}

function layerColor(summary: RegionWeatherSummary, layer: MapLayer): string {
  if (layer === 'temperature') return temperatureColor(summary.temperatureMeanC);
  if (layer === 'weather') return weatherColor(summary.weatherType);
  if (layer === 'precipitation') return precipitationColor(summary.precipitationSumMm);
  if (layer === 'wind') return windColor(summary.windSpeedMaxKmh);
  if (layer === 'humidity') return humidityColor(summary.humidityMeanPercent);
  if (layer === 'elevation') return elevationColor(summary.elevationMeters);
  return comfortColor(summary.comfortScore);
}

function layerLabel(summary: RegionWeatherSummary, layer: MapLayer, locale: DisplayLocale, temperatureUnit: TemperatureUnit): string {
  if (layer === 'temperature') return temperatureLabel(summary.temperatureMeanC, temperatureUnit);
  if (layer === 'weather') return getWeatherTypeLabel(summary.weatherType, locale);
  if (layer === 'precipitation') return `${summary.precipitationSumMm.toFixed(1)} mm`;
  if (layer === 'wind') return `${Math.round(summary.windSpeedMaxKmh)} km/h`;
  if (layer === 'humidity') return `${Math.round(summary.humidityMeanPercent)}%`;
  if (layer === 'elevation') return `${Math.round(summary.elevationMeters)} m`;
  if (summary.totalDays > 0) return `${summary.matchDays}/${summary.totalDays}`;
  return `${Math.round(summary.comfortScore * 100)}%`;
}

function cleanRegionLabel(name: string): string {
  return name.replace(/省|市|自治区|特别行政区/g, '');
}

export function decorateRegionGeojson(
  geojson: MapGeoJson,
  summaries: RegionWeatherSummary[],
  activeLayer: MapRegionLayer,
  targetLayer: MapRegionLayer,
  activeRegion: RegionKey,
  tool: WeatherToolId,
  layer: MapLayer,
  locale: DisplayLocale,
  temperatureUnit: TemperatureUnit
): MapGeoJson {
  const summariesById = new globalThis.Map(summaries.map((summary) => [summary.id, summary]));
  const regionMatchDays = summaries.map((summary) => summary.matchDays);
  const minRegionMatchDays = Math.min(...regionMatchDays, 0);
  const maxRegionMatchDays = Math.max(...regionMatchDays, 0);
  const isActiveLayer = activeLayer === targetLayer;

  return {
    ...geojson,
    features: geojson.features.map((feature) => {
      const regionKey = regionKeyForFeature(feature);
      const summary = summariesById.get(regionKey);
      const isVisibleRegion = isActiveLayer && Boolean(summary);
      const isActiveRegion = isVisibleRegion && regionKey === activeRegion;
      const fillColor =
        summary && tool === 'city-finder' && layer === 'comfort'
          ? relativeMatchColor(summary.matchDays, minRegionMatchDays, maxRegionMatchDays)
          : summary
            ? layerColor(summary, layer)
            : 'rgba(255,255,255,0)';

      return {
        ...feature,
        properties: {
          ...feature.properties,
          isVisibleRegion,
          isActiveRegion,
          fillColor,
          fillOpacity: isVisibleRegion ? (layer === 'elevation' ? 0.34 : targetLayer === 'country' ? 0.5 : 0.62) : 0,
          label: summary ? `${cleanRegionLabel(summary.name)} ${layerLabel(summary, layer, locale, temperatureUnit)}` : ''
        }
      };
    })
  };
}

function collectBoundsCoordinates(points: BoundsPoint[], coordinates: unknown): void {
  if (!Array.isArray(coordinates)) return;
  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === 'number' &&
    typeof coordinates[1] === 'number' &&
    Number.isFinite(coordinates[0]) &&
    Number.isFinite(coordinates[1])
  ) {
    points.push([coordinates[0], coordinates[1]]);
    return;
  }

  coordinates.forEach((item) => collectBoundsCoordinates(points, item));
}

function normalizeLongitude(longitude: number): number {
  return ((longitude % 360) + 360) % 360;
}

export function buildBoundsFromPoints(points: BoundsPoint[]): maplibregl.LngLatBounds | null {
  if (points.length === 0) return null;

  const latitudes = points.map(([, latitude]) => latitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const longitudes = points.map(([longitude]) => normalizeLongitude(longitude)).sort((left, right) => left - right);

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

export function buildRegionBounds(
  geojson: MapGeoJson | null,
  summaries: RegionWeatherSummary[],
): maplibregl.LngLatBounds | null {
  if (!geojson || summaries.length === 0) return null;

  const summaryIds = new Set(summaries.map((summary) => summary.id));
  const boundsPoints: BoundsPoint[] = [];
  for (const feature of geojson.features) {
    if (!summaryIds.has(regionKeyForFeature(feature))) continue;
    collectBoundsCoordinates(boundsPoints, feature.geometry.coordinates);
  }

  return buildBoundsFromPoints(boundsPoints);
}

function countryCodeFromRegion(region: RegionKey): string | null {
  const countryMatch = /^country:([A-Z]{2})$/.exec(region);
  if (countryMatch) return countryMatch[1];
  const partitionMatch = /^partition:([A-Z]{2})\./.exec(region);
  return partitionMatch?.[1] ?? null;
}

export function regionGeojsonAsset(layer: MapRegionLayer, activeRegion: RegionKey): RegionGeojsonAsset {
  if (layer === 'country') {
    return { key: 'country', url: '/data/geo/world-countries.geojson' };
  }

  const countryCode = countryCodeFromRegion(activeRegion);
  return countryCode === 'CN'
    ? { key: 'partition:CN', url: '/data/geo/china-provinces.geojson' }
    : { key: 'partition:global', url: '/data/geo/detailed-admin1.geojson' };
}
