/**
 * 文件说明: 处理 WorldWeatherMap 静态矢量瓦片 source、样式表达式和地区 hover 文案。
 * 对应文档: docs/specs/40-map-vector-tiles-performance.md
 */
import type { MapLayer, RegionWeatherSummary, WeatherToolId } from 'weather-core/types';
import type { FilterSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { countryLabel } from '@/domain/country-labels';
import type { DisplayLocale, TemperatureUnit } from '@/domain/format';
import type { MapRegionLayer } from '@/domain/regions';
import { getWeatherTypeLabel } from '@/domain/weather';
import { messages } from '@/i18n';
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
import {
  regionFillLayerId,
  regionHoverLayerId,
  regionHoverLineLayerId,
  regionHoverShadowLayerId,
  regionLineLayerId,
  regionNoMetricPatternLayerId,
  regionSourceId,
  type MapTileRegionLayer
} from './mapRegionGeometry';

export type VectorRegionAsset = {
  key: MapTileRegionLayer;
  layer: MapTileRegionLayer;
  legendLayer: MapRegionLayer;
  styleLayer: MapRegionLayer;
  tiles: string[];
  minzoom: number;
  maxzoom: number;
};

export type VectorRegionStyleEntry = {
  regionKey: string;
  admin1Name?: string;
  fillColor: string;
  fillOpacity: number;
  lineOpacity: number;
  lineWidth: number;
  hasMetricData: boolean;
  isNoMetricRegion: boolean;
  displayName: string;
  valueLabel: string;
  label: string;
};

type RegionSummaryAccumulator = {
  id: string;
  level: RegionWeatherSummary['level'];
  countryCode: string;
  admin1Code?: string;
  admin1Name?: string;
  admin2Code?: string;
  name: string;
  cityCount: number;
  forecastCount: number;
  elevationWeight: number;
  elevationMetersTotal: number;
  metricWeight: number;
  temperatureTotal: number;
  humidityTotal: number;
  precipitationTotal: number;
  windTotal: number;
  comfortTotal: number;
  matchDays: number;
  totalDays: number;
  weatherVotes: Map<RegionWeatherSummary['weatherType'], number>;
};

const vectorTileBaseUrl = import.meta.env.PUBLIC_GEO_VECTOR_BASE_URL || '/data/geo/region-tiles';
export const vectorRegionSourceLayer = 'weather_region';

function vectorTileUrl(subdir: string): string {
  const tilePath = `${vectorTileBaseUrl.replace(/\/$/, '')}/${subdir}/{z}/{x}/{y}.mvt`;
  if (/^https?:\/\//.test(tilePath)) return tilePath;
  if (typeof window === 'undefined') return tilePath;
  return `${window.location.origin}${tilePath.startsWith('/') ? tilePath : `/${tilePath}`}`;
}

export function vectorRegionAssetForZoom(zoom: number): VectorRegionAsset {
  if (zoom >= 5) {
    return {
      key: 'admin2',
      layer: 'admin2',
      legendLayer: 'country',
      styleLayer: 'country',
      tiles: [vectorTileUrl('admin2')],
      minzoom: 5,
      maxzoom: 5
    };
  }

  if (zoom >= 3) {
    return {
      key: 'admin1',
      layer: 'admin1',
      legendLayer: 'world',
      styleLayer: 'world',
      tiles: [vectorTileUrl('admin1')],
      minzoom: 3,
      maxzoom: 4
    };
  }

  return {
    key: 'country',
    layer: 'country',
    legendLayer: 'world',
    styleLayer: 'world',
    tiles: [vectorTileUrl('country')],
    minzoom: 1,
    maxzoom: 2
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
  return messages[locale].ui.worldWeatherMap.noData;
}

function noMetricFillColor(): string {
  return '#2f3531';
}

function noMetricFillOpacity(targetLayer: MapRegionLayer): number {
  return targetLayer === 'world' ? 0.06 : 0.08;
}

function noMetricPatternOpacity(targetLayer: MapRegionLayer): number {
  return targetLayer === 'world' ? 0.58 : 0.66;
}

const metricFillOpacity = 0.25;

function cleanRegionLabel(name: string): string {
  return name.replace(/省|市|自治区|特别行政区/g, '');
}

function uniqueAdjacentSegments(segments: string[]): string[] {
  return segments.filter((segment, index) => segment && segment !== segments[index - 1]);
}

function regionLocationLabel(
  name: string,
  level: RegionWeatherSummary['level'] | 'boundary' | undefined,
  countryCode: string | undefined,
  admin1Name: string | undefined,
  locale: DisplayLocale
): string {
  if (!countryCode || level === 'country') return name;
  const country = countryLabel(countryCode, locale);
  const segments = level === 'admin2' || level === 'boundary'
    ? [name, admin1Name, country]
    : [name, country];
  return uniqueAdjacentSegments(segments.filter((part): part is string => Boolean(part))).join(', ');
}

function regionTooltipLabel(
  name: string,
  level: RegionWeatherSummary['level'] | 'boundary' | undefined,
  countryCode: string | undefined,
  admin1Name: string | undefined,
  valueLabel: string,
  locale: DisplayLocale
): string {
  const locationLabel = regionLocationLabel(name, level, countryCode, admin1Name, locale);
  return valueLabel ? `${locationLabel} · ${valueLabel}` : locationLabel;
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

function newAccumulator(summary: RegionWeatherSummary, id: string, level: RegionWeatherSummary['level'], name: string): RegionSummaryAccumulator {
  return {
    id,
    level,
    countryCode: summary.countryCode,
    admin1Code: level === 'country' ? undefined : summary.admin1Code,
    admin1Name: level === 'admin2' ? summary.admin1Name : undefined,
    admin2Code: level === 'admin2' ? summary.admin2Code : undefined,
    name,
    cityCount: 0,
    forecastCount: 0,
    elevationWeight: 0,
    elevationMetersTotal: 0,
    metricWeight: 0,
    temperatureTotal: 0,
    humidityTotal: 0,
    precipitationTotal: 0,
    windTotal: 0,
    comfortTotal: 0,
    matchDays: 0,
    totalDays: 0,
    weatherVotes: new Map()
  };
}

function addSummary(accumulator: RegionSummaryAccumulator, summary: RegionWeatherSummary): void {
  const metricWeight = Math.max(summary.forecastCount, summary.cityCount, 1);
  const elevationWeight = Math.max(summary.cityCount, 1);
  accumulator.cityCount += summary.cityCount;
  accumulator.forecastCount += summary.forecastCount;
  accumulator.elevationWeight += elevationWeight;
  accumulator.elevationMetersTotal += summary.elevationMeters * elevationWeight;
  accumulator.metricWeight += metricWeight;
  accumulator.temperatureTotal += summary.temperatureMeanC * metricWeight;
  accumulator.humidityTotal += summary.humidityMeanPercent * metricWeight;
  accumulator.precipitationTotal += summary.precipitationSumMm * metricWeight;
  accumulator.windTotal += summary.windSpeedMaxKmh * metricWeight;
  accumulator.comfortTotal += summary.comfortScore * metricWeight;
  accumulator.matchDays += summary.matchDays;
  accumulator.totalDays += summary.totalDays;
  accumulator.weatherVotes.set(summary.weatherType, (accumulator.weatherVotes.get(summary.weatherType) ?? 0) + metricWeight);
}

function summarizeAccumulator(accumulator: RegionSummaryAccumulator): RegionWeatherSummary {
  const metricWeight = Math.max(accumulator.metricWeight, 1);
  const elevationWeight = Math.max(accumulator.elevationWeight, 1);
  const weatherType = [...accumulator.weatherVotes.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'cloudy';
  return {
    id: accumulator.id,
    level: accumulator.level,
    countryCode: accumulator.countryCode,
    admin1Code: accumulator.admin1Code,
    admin1Name: accumulator.admin1Name,
    admin2Code: accumulator.admin2Code,
    name: accumulator.name,
    cityCount: accumulator.cityCount,
    forecastCount: accumulator.forecastCount,
    weatherType,
    temperatureMeanC: accumulator.temperatureTotal / metricWeight,
    humidityMeanPercent: accumulator.humidityTotal / metricWeight,
    elevationMeters: accumulator.elevationMetersTotal / elevationWeight,
    precipitationSumMm: accumulator.precipitationTotal / metricWeight,
    windSpeedMaxKmh: accumulator.windTotal / metricWeight,
    comfortScore: accumulator.totalDays > 0 ? accumulator.matchDays / accumulator.totalDays : accumulator.comfortTotal / metricWeight,
    matchDays: accumulator.matchDays,
    totalDays: accumulator.totalDays
  };
}

function addRollup(
  rollups: Map<string, RegionSummaryAccumulator>,
  summary: RegionWeatherSummary,
  id: string,
  level: RegionWeatherSummary['level']
): void {
  const current = rollups.get(id) ?? newAccumulator(summary, id, level, summary.name);
  addSummary(current, summary);
  rollups.set(id, current);
}

function buildRollupSummaries(summaries: RegionWeatherSummary[], locale: DisplayLocale): RegionWeatherSummary[] {
  const rollups = new Map<string, RegionSummaryAccumulator>();
  const existingIds = new Set(summaries.map((summary) => summary.id));

  for (const summary of summaries) {
    if (summary.level !== 'country') {
      addRollup(rollups, { ...summary, name: countryLabel(summary.countryCode, locale) }, `country:${summary.countryCode}`, 'country');
    }
    if (summary.level === 'admin2' && summary.admin1Code) {
      addRollup(rollups, { ...summary, name: summary.admin1Name ?? summary.name }, `admin1:${summary.countryCode}.${summary.admin1Code}`, 'admin1');
    }
  }

  return [...rollups.values()]
    .map(summarizeAccumulator)
    .filter((summary) => !existingIds.has(summary.id));
}

function styleEntryForSummary(
  summary: RegionWeatherSummary,
  targetLayer: MapRegionLayer,
  tool: WeatherToolId,
  layer: MapLayer,
  locale: DisplayLocale,
  temperatureUnit: TemperatureUnit,
  minRegionMatchDays: number,
  maxRegionMatchDays: number
): VectorRegionStyleEntry {
  const hasMetricData = hasLayerData(summary, tool, layer);
  const fillColor =
    hasMetricData && tool === 'city-finder' && layer === 'comfort'
      ? relativeMatchColor(summary.matchDays, minRegionMatchDays, maxRegionMatchDays)
      : hasMetricData
        ? layerColor(summary, layer)
        : noMetricFillColor();
  const isNoMetricRegion = !hasMetricData;
  return {
    regionKey: summary.id,
    admin1Name: summary.admin1Name ? cleanRegionLabel(summary.admin1Name) : undefined,
    fillColor,
    fillOpacity: isNoMetricRegion ? noMetricFillOpacity(targetLayer) : metricFillOpacity,
    lineOpacity: targetLayer === 'world' ? 0.66 : 0.7,
    lineWidth: targetLayer === 'world' ? 0.95 : 1.1,
    hasMetricData,
    isNoMetricRegion,
    displayName: cleanRegionLabel(summary.name),
    valueLabel: layerLabel(summary, tool, layer, locale, temperatureUnit),
    label: regionTooltipLabel(
      cleanRegionLabel(summary.name),
      summary.level,
      summary.countryCode,
      summary.admin1Name ? cleanRegionLabel(summary.admin1Name) : undefined,
      layerLabel(summary, tool, layer, locale, temperatureUnit),
      locale
    )
  };
}

export function buildVectorRegionStyleEntries(
  summaries: RegionWeatherSummary[],
  targetLayer: MapRegionLayer,
  tool: WeatherToolId,
  layer: MapLayer,
  locale: DisplayLocale,
  temperatureUnit: TemperatureUnit
): VectorRegionStyleEntry[] {
  const visibleSummaries = [...summaries, ...buildRollupSummaries(summaries, locale)];
  const regionMatchDays = visibleSummaries.filter((summary) => summary.totalDays > 0).map((summary) => summary.matchDays);
  const minRegionMatchDays = Math.min(...regionMatchDays, 0);
  const maxRegionMatchDays = Math.max(...regionMatchDays, 0);
  const entriesById = new Map<string, VectorRegionStyleEntry>();

  for (const summary of visibleSummaries) {
    entriesById.set(
      summary.id,
      styleEntryForSummary(summary, targetLayer, tool, layer, locale, temperatureUnit, minRegionMatchDays, maxRegionMatchDays)
    );
  }

  return [...entriesById.values()];
}

function matchExpression<T extends string | number | boolean>(entries: VectorRegionStyleEntry[], field: keyof VectorRegionStyleEntry, fallback: T): T | unknown[] {
  if (entries.length === 0) return fallback;

  const expression: unknown[] = ['match', ['get', 'regionKey']];
  for (const entry of entries) {
    expression.push(entry.regionKey, entry[field]);
  }
  expression.push(fallback);
  return expression;
}

function noMetricPatternOpacityExpression(
  entries: VectorRegionStyleEntry[],
  targetLayer: MapRegionLayer,
  isRegionColoringEnabled: boolean,
  includeBoundaryRegions: boolean
): number | unknown[] {
  const boundaryOpacity = includeBoundaryRegions && isRegionColoringEnabled ? noMetricPatternOpacity(targetLayer) : 0;
  const fallback = 0;
  if (entries.length === 0) {
    return boundaryOpacity > 0 ? ['case', ['==', ['get', 'level'], 'boundary'], boundaryOpacity, fallback] : fallback;
  }

  const expression: unknown[] = ['match', ['get', 'regionKey']];
  for (const entry of entries) {
    expression.push(entry.regionKey, isRegionColoringEnabled && entry.isNoMetricRegion ? noMetricPatternOpacity(targetLayer) : 0);
  }
  expression.push(fallback);
  return boundaryOpacity > 0 ? ['case', ['==', ['get', 'level'], 'boundary'], boundaryOpacity, expression] : expression;
}

function visibleRegionFilter(entries: VectorRegionStyleEntry[], includeBoundaryRegions: boolean): FilterSpecification {
  const regionKeys = entries.map((entry) => entry.regionKey);
  const regionKeyFilter = regionKeys.length > 0
    ? (['in', ['get', 'regionKey'], ['literal', regionKeys]] as FilterSpecification)
    : (['==', ['get', 'regionKey'], ''] as FilterSpecification);
  if (!includeBoundaryRegions) return regionKeyFilter;
  return ['any', regionKeyFilter, ['==', ['get', 'level'], 'boundary']] as FilterSpecification;
}

export function addVectorRegionLayers(
  map: MapLibreMap,
  asset: VectorRegionAsset,
  noMetricPatternImageId: string,
  beforeLayerId: string | undefined
): void {
  const sourceId = regionSourceId(asset.layer);
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: 'vector',
      tiles: asset.tiles,
      minzoom: asset.minzoom,
      maxzoom: asset.maxzoom,
      promoteId: { [vectorRegionSourceLayer]: 'regionKey' }
    });
  }

  if (!map.getLayer(regionFillLayerId(asset.layer))) {
    map.addLayer(
      {
        id: regionFillLayerId(asset.layer),
        type: 'fill',
        source: sourceId,
        'source-layer': vectorRegionSourceLayer,
        layout: { visibility: 'none' },
        paint: {
          'fill-color': 'rgba(255,255,255,0)',
          'fill-opacity': 0,
          'fill-outline-color': asset.styleLayer === 'world' ? 'rgba(63,78,72,0.1)' : 'rgba(63,78,72,0.14)'
        }
      },
      beforeLayerId
    );
  }

  if (!map.getLayer(regionNoMetricPatternLayerId(asset.layer))) {
    map.addLayer(
      {
        id: regionNoMetricPatternLayerId(asset.layer),
        type: 'fill',
        source: sourceId,
        'source-layer': vectorRegionSourceLayer,
        layout: { visibility: 'none' },
        paint: {
          'fill-pattern': noMetricPatternImageId,
          'fill-opacity': 0
        }
      },
      beforeLayerId
    );
  }

  if (!map.getLayer(regionHoverLayerId(asset.layer))) {
    map.addLayer(
      {
        id: regionHoverLayerId(asset.layer),
        type: 'fill',
        source: sourceId,
        'source-layer': vectorRegionSourceLayer,
        layout: { visibility: 'none' },
        paint: {
          'fill-color': 'rgba(35,42,38,0.12)',
          'fill-opacity': 0.26,
          'fill-outline-color': 'rgba(63,78,72,0.2)'
        },
        filter: ['==', ['get', 'regionKey'], '']
      },
      beforeLayerId
    );
  }

  if (!map.getLayer(regionLineLayerId(asset.layer))) {
    map.addLayer(
      {
        id: regionLineLayerId(asset.layer),
        type: 'line',
        source: sourceId,
        'source-layer': vectorRegionSourceLayer,
        layout: {
          visibility: 'none',
          'line-join': 'round',
          'line-cap': 'butt'
        },
        paint: {
          'line-color': asset.styleLayer === 'world' ? 'rgba(54,68,63,0.34)' : 'rgba(54,68,63,0.4)',
          'line-width': 0,
          'line-opacity': 0
        }
      },
      beforeLayerId
    );
  }

  if (!map.getLayer(regionHoverShadowLayerId(asset.layer))) {
    map.addLayer(
      {
        id: regionHoverShadowLayerId(asset.layer),
        type: 'line',
        source: sourceId,
        'source-layer': vectorRegionSourceLayer,
        layout: {
          visibility: 'none',
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': 'rgba(68,88,80,0.22)',
          'line-width': asset.styleLayer === 'world' ? 1.4 : 2,
          'line-blur': asset.styleLayer === 'world' ? 1.2 : 1.5,
          'line-opacity': 0.56
        },
        filter: ['==', ['get', 'regionKey'], '']
      },
      beforeLayerId
    );
  }

  if (!map.getLayer(regionHoverLineLayerId(asset.layer))) {
    map.addLayer(
      {
        id: regionHoverLineLayerId(asset.layer),
        type: 'line',
        source: sourceId,
        'source-layer': vectorRegionSourceLayer,
        layout: {
          visibility: 'none',
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': 'rgba(50,70,62,0.52)',
          'line-width': asset.styleLayer === 'world' ? 0.65 : 0.9,
          'line-opacity': 0.72
        },
        filter: ['==', ['get', 'regionKey'], '']
      },
      beforeLayerId
    );
  }
}

export function removeVectorRegionLayers(map: MapLibreMap, layer: MapTileRegionLayer): void {
  [
    regionHoverLineLayerId(layer),
    regionHoverShadowLayerId(layer),
    regionLineLayerId(layer),
    regionHoverLayerId(layer),
    regionNoMetricPatternLayerId(layer),
    regionFillLayerId(layer)
  ].forEach((layerId) => {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  });

  const sourceId = regionSourceId(layer);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

export function applyVectorRegionStyles(
  map: MapLibreMap,
  targetLayer: MapTileRegionLayer,
  styleLayer: MapRegionLayer,
  entries: VectorRegionStyleEntry[],
  isRegionColoringEnabled = true
): void {
  const includeBoundaryRegions = targetLayer === 'admin2';
  const filter = visibleRegionFilter(entries, includeBoundaryRegions);
  const boundaryFillOpacity = includeBoundaryRegions && isRegionColoringEnabled ? noMetricFillOpacity(styleLayer) : 0;
  const boundaryLineOpacity = includeBoundaryRegions ? 0.46 : 0;
  const boundaryLineWidth = includeBoundaryRegions ? 0.85 : 0;
  const fillLayerId = regionFillLayerId(targetLayer);
  if (map.getLayer(fillLayerId)) {
    map.setFilter(fillLayerId, filter);
    map.setPaintProperty(fillLayerId, 'fill-color', matchExpression(entries, 'fillColor', noMetricFillColor()));
    map.setPaintProperty(fillLayerId, 'fill-opacity', isRegionColoringEnabled ? matchExpression(entries, 'fillOpacity', boundaryFillOpacity) : 0);
  }

  const noMetricLayerId = regionNoMetricPatternLayerId(targetLayer);
  if (map.getLayer(noMetricLayerId)) {
    map.setFilter(noMetricLayerId, filter);
    map.setPaintProperty(noMetricLayerId, 'fill-opacity', noMetricPatternOpacityExpression(entries, styleLayer, isRegionColoringEnabled, includeBoundaryRegions));
  }

  const lineLayerId = regionLineLayerId(targetLayer);
  if (map.getLayer(lineLayerId)) {
    map.setFilter(lineLayerId, filter);
    map.setPaintProperty(lineLayerId, 'line-opacity', matchExpression(entries, 'lineOpacity', boundaryLineOpacity));
    map.setPaintProperty(lineLayerId, 'line-width', matchExpression(entries, 'lineWidth', boundaryLineWidth));
  }
}

export function vectorFallbackLabel(properties: Record<string, unknown>, locale: DisplayLocale): string {
  const localized = locale === 'zh' ? properties.labelZh : properties.labelEn;
  const fallback = properties.labelZh ?? properties.labelEn;
  return typeof localized === 'string' && localized
    ? cleanRegionLabel(localized)
    : typeof fallback === 'string' && fallback
      ? cleanRegionLabel(fallback)
      : '';
}

function vectorRegionLevel(properties: Record<string, unknown>): RegionWeatherSummary['level'] | 'boundary' | undefined {
  const level = properties.level;
  return level === 'country' || level === 'admin1' || level === 'admin2' || level === 'boundary' ? level : undefined;
}

function vectorRegionCountryCode(properties: Record<string, unknown>, regionKey: string): string | undefined {
  const countryCode = properties.countryCode;
  if (typeof countryCode === 'string' && countryCode) return countryCode;
  return /^(?:country|admin1|admin2|boundary):([A-Z]{2})(?:\.|$)/.exec(regionKey)?.[1];
}

function vectorRegionAdmin1Name(properties: Record<string, unknown>, locale: DisplayLocale): string | undefined {
  const localized = locale === 'zh' ? properties.admin1LabelZh : properties.admin1LabelEn;
  const fallback = properties.admin1LabelZh ?? properties.admin1LabelEn;
  return typeof localized === 'string' && localized
    ? cleanRegionLabel(localized)
    : typeof fallback === 'string' && fallback
      ? cleanRegionLabel(fallback)
      : undefined;
}

export function vectorRegionTooltipLabel(
  properties: Record<string, unknown>,
  entry: Pick<VectorRegionStyleEntry, 'admin1Name' | 'displayName' | 'valueLabel'> | undefined,
  locale: DisplayLocale,
  noDataLabelText: string,
  parentAdmin1Name?: string
): string {
  const rawLabel = typeof properties.label === 'string' && properties.label ? properties.label : vectorFallbackLabel(properties, locale);
  const name = rawLabel || entry?.displayName || '';
  if (!name) return '';

  const regionKey = typeof properties.regionKey === 'string' ? properties.regionKey : '';
  const valueLabel = entry?.valueLabel ?? noDataLabelText;
  return regionTooltipLabel(
    cleanRegionLabel(name),
    vectorRegionLevel(properties),
    vectorRegionCountryCode(properties, regionKey),
    entry?.admin1Name ?? parentAdmin1Name ?? vectorRegionAdmin1Name(properties, locale),
    valueLabel,
    locale
  );
}
