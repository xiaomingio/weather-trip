/**
 * 文件说明: 处理 WorldWeatherMap 地区 GeoJSON 归一化、着色、边界和地图资源选择。
 * 对应文档: docs/specs/10-product-design.md
 */

import maplibregl from 'maplibre-gl';
import type { City, MapLayer, RegionKey, RegionWeatherSummary, WeatherToolId } from 'weather-core/types';
import type { DisplayLocale, TemperatureUnit } from '@/domain/format';
import { primaryCountryCodeForRegion, type MapRegionLayer } from '@/domain/regions';
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
  if (layer === 'world') return 'weather-world';
  return 'weather-country-detail';
}

export function regionFillLayerId(layer: MapRegionLayer): string {
  return `${regionSourceId(layer)}-fill`;
}

export function regionNoMetricPatternLayerId(layer: MapRegionLayer): string {
  return `${regionSourceId(layer)}-no-metric-pattern`;
}

export function regionLineLayerId(layer: MapRegionLayer): string {
  return `${regionSourceId(layer)}-line`;
}

export function regionHoverLayerId(layer: MapRegionLayer): string {
  return `${regionSourceId(layer)}-hover`;
}

export function regionHoverLineLayerId(layer: MapRegionLayer): string {
  return `${regionSourceId(layer)}-hover-line`;
}

export function regionHoverShadowLayerId(layer: MapRegionLayer): string {
  return `${regionSourceId(layer)}-hover-shadow`;
}

export const selectedRegionSourceId = 'weather-selected-region-outline';
export const selectedRegionLineLayerId = 'weather-selected-region-outline-line';

function regionKeyForFeature(feature: { properties: Record<string, unknown> }): string {
  return String(feature.properties.regionKey ?? '');
}

export function normalizeRegionGeojson(geojson: MapGeoJson): MapGeoJson {
  return {
    ...geojson,
    features: geojson.features.map((feature) => {
      const sourceRegionKey = typeof feature.properties.regionKey === 'string' ? feature.properties.regionKey : null;
      const labelZh = typeof feature.properties.labelZh === 'string' ? feature.properties.labelZh : undefined;
      const labelEn = typeof feature.properties.labelEn === 'string' ? feature.properties.labelEn : undefined;
      const hasCity = typeof feature.properties.hasCity === 'boolean' ? feature.properties.hasCity : undefined;

      return {
        ...feature,
        properties: {
          regionKey: sourceRegionKey ?? '',
          ...(labelZh && { labelZh }),
          ...(labelEn && { labelEn }),
          ...(hasCity !== undefined && { hasCity })
        }
      };
    })
  };
}

function hasLayerData(summary: RegionWeatherSummary, tool: WeatherToolId, layer: MapLayer): boolean {
  if (layer === 'elevation') return summary.cityCount > 0 && Number.isFinite(summary.elevationMeters);
  if (tool === 'city-finder' && layer === 'comfort') return summary.totalDays > 0;
  return summary.forecastCount > 0;
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

function noDataLabel(locale: DisplayLocale): string {
  return locale === 'zh' ? '暂无数据' : 'No data';
}

function noMetricFillColor(): string {
  return '#2f3531';
}

function noMetricFillOpacity(targetLayer: MapRegionLayer): number {
  return targetLayer === 'world' ? 0.06 : 0.08;
}

function layerLabel(
  summary: RegionWeatherSummary,
  tool: WeatherToolId,
  layer: MapLayer,
  locale: DisplayLocale,
  temperatureUnit: TemperatureUnit
): string {
  if (!hasLayerData(summary, tool, layer)) return noDataLabel(locale);
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

function boundaryLabel(feature: { properties: Record<string, unknown> }, locale: DisplayLocale): string {
  const localized = locale === 'zh' ? feature.properties.labelZh : feature.properties.labelEn;
  const fallback = feature.properties.labelZh ?? feature.properties.labelEn;
  return typeof localized === 'string' && localized
    ? cleanRegionLabel(localized)
    : typeof fallback === 'string' && fallback
      ? cleanRegionLabel(fallback)
      : '';
}

function boundaryKeyMatchesActiveRegion(regionKey: string, activeRegion: RegionKey): boolean {
  if (activeRegion === 'world') return true;
  if (activeRegion.startsWith('country:')) {
    const countryCode = activeRegion.slice('country:'.length);
    return regionKey.startsWith(`admin1:${countryCode}.`) ||
      regionKey.startsWith(`admin2:${countryCode}.`) ||
      regionKey.startsWith(`boundary:${countryCode}.`) ||
      regionKey === activeRegion;
  }
  if (activeRegion.startsWith('admin1:')) {
    const admin1Key = activeRegion.slice('admin1:'.length);
    return regionKey.startsWith(`admin2:${admin1Key}.`) || regionKey.startsWith(`boundary:${admin1Key}.`) || regionKey === activeRegion;
  }
  return regionKey === activeRegion;
}

function emptyRegionGeojson(): MapGeoJson {
  return { type: 'FeatureCollection', features: [] };
}

export function buildSelectedRegionOutlineGeojson(
  geojson: MapGeoJson | null,
  regionOutlineGeojson: MapGeoJson | null,
  activeRegion: RegionKey
): MapGeoJson {
  if (activeRegion === 'world') return emptyRegionGeojson();

  const exactFeatures = geojson?.features.filter((feature) => regionKeyForFeature(feature) === activeRegion) ?? [];
  if (exactFeatures.length > 0) return { type: 'FeatureCollection', features: exactFeatures };

  const exactOutlineFeature = regionOutlineGeojson?.features.find((feature) => regionKeyForFeature(feature) === activeRegion);
  if (exactOutlineFeature) return { type: 'FeatureCollection', features: [exactOutlineFeature] };

  const countryMatch = /^country:([A-Z]{2})$/.exec(activeRegion);
  if (countryMatch) return emptyRegionGeojson();

  const admin1Match = /^admin1:([A-Z]{2})\.([^.]+)$/.exec(activeRegion);
  if (admin1Match) return emptyRegionGeojson();

  return emptyRegionGeojson();
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
  const regionMatchDays = summaries.filter((summary) => summary.totalDays > 0).map((summary) => summary.matchDays);
  const minRegionMatchDays = Math.min(...regionMatchDays, 0);
  const maxRegionMatchDays = Math.max(...regionMatchDays, 0);
  const isActiveLayer = activeLayer === targetLayer;

  return {
    ...geojson,
    features: geojson.features.map((feature) => {
      const regionKey = regionKeyForFeature(feature);
      const summary = summariesById.get(regionKey);
      const fallbackLabel = boundaryKeyMatchesActiveRegion(regionKey, activeRegion) ? boundaryLabel(feature, locale) : '';
      const hasCity = summary ? summary.cityCount > 0 : feature.properties.hasCity !== false;
      const isVisibleRegion = isActiveLayer && (Boolean(summary) || (Boolean(fallbackLabel) && !hasCity));
      const hasMetricData = summary ? hasLayerData(summary, tool, layer) : false;
      const isNoMetricRegion = summary ? !hasMetricData : isVisibleRegion && !hasCity;
      const isActiveRegion = isVisibleRegion && regionKey === activeRegion;
      const fillColor =
        summary && hasMetricData && tool === 'city-finder' && layer === 'comfort'
          ? relativeMatchColor(summary.matchDays, minRegionMatchDays, maxRegionMatchDays)
          : summary && hasMetricData
            ? layerColor(summary, layer)
            : noMetricFillColor();

      return {
        ...feature,
        properties: {
          ...feature.properties,
          isVisibleRegion,
          hasCity,
          hasMetricData,
          isNoMetricRegion,
          isActiveRegion,
          fillColor,
          fillOpacity: isVisibleRegion
            ? !isNoMetricRegion
              ? (layer === 'elevation' ? 0.34 : targetLayer === 'world' ? 0.5 : 0.62)
              : noMetricFillOpacity(targetLayer)
            : 0,
          label: summary
            ? `${cleanRegionLabel(summary.name)} ${layerLabel(summary, tool, layer, locale, temperatureUnit)}`
            : fallbackLabel
              ? `${fallbackLabel} ${noDataLabel(locale)}`
              : ''
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

export function buildGeojsonBounds(geojson: MapGeoJson | null): maplibregl.LngLatBounds | null {
  if (!geojson) return null;

  const boundsPoints: BoundsPoint[] = [];
  for (const feature of geojson.features) {
    collectBoundsCoordinates(boundsPoints, feature.geometry.coordinates);
  }

  return buildBoundsFromPoints(boundsPoints);
}

function countryCodeFromSummaries(summaries: RegionWeatherSummary[]): string | null {
  const countryCodes = new Set(summaries.map((summary) => summary.countryCode).filter(Boolean));
  return countryCodes.size === 1 ? [...countryCodes][0] ?? null : null;
}

function isC3Country(cities: City[], countryCode: string): boolean {
  return cities.some((city) => city.countryCode === countryCode && city.countryTier === 'C3');
}

export function regionGeojsonAsset(activeRegion: RegionKey, summaries: RegionWeatherSummary[], cities: City[]): RegionGeojsonAsset {
  const countryCode = primaryCountryCodeForRegion(activeRegion);
  const summaryCountryCode = countryCodeFromSummaries(summaries);
  const packageCountryCode = countryCode ?? summaryCountryCode;
  if (packageCountryCode && isC3Country(cities, packageCountryCode)) {
    return {
      key: `country:${packageCountryCode}`,
      url: `/data/geo/countries/${packageCountryCode}.geojson`,
      layer: 'country'
    };
  }

  return { key: 'world', url: '/data/geo/world.geojson', layer: 'world' };
}
