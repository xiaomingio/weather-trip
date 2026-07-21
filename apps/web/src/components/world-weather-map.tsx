/**
 * 文件说明: 使用 MapLibre 渲染世界地图，并按天气匹配或全球天气地图展示城市点位。
 * 对应文档: docs/product-design.md
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { GeoJSONSource, Map as MapLibreMap, type MapLayerMouseEvent } from 'maplibre-gl';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { MapLayer, RegionKey, RegionWeatherSummary, ViewMode } from 'weather-core/types';
import { type DisplayLocale, type TemperatureUnit, celsiusToFahrenheit, formatCityName, formatCityRegion } from '@/domain/format';
import type { MapRegionLayer } from '@/domain/regions';
import { getWeatherTypeLabel, weatherTypeEmoji } from '@/domain/weather';
import { type DashboardDailyResultItem, type DashboardResultItem, type DashboardTravelResultItem, isDashboardTravelItem } from '@/domain/weather-dashboard-shared';

type MapPoint = {
  cityId: string;
  label: string;
  longitude: number;
  latitude: number;
  markerText: string;
  color: string;
  opacity: number;
  size: number;
  sortValue: number;
  prominence: number;
  selected: boolean;
};

type WorldWeatherMapProps = {
  mode: ViewMode;
  locale: DisplayLocale;
  layer: MapLayer;
  resultItems: DashboardResultItem[];
  regionSummaries: RegionWeatherSummary[];
  temperatureUnit: TemperatureUnit;
  activeRegion: RegionKey;
  regionLayer: MapRegionLayer;
  selectedCityId: string | null;
  onSelectCity: (cityId: string) => void;
};

type MapGeoJson = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: MapGeoJsonGeometry;
  }>;
};

type MapGeoJsonGeometry = {
  type: string;
  coordinates?: unknown;
};

type LegendScale = {
  gradient: string;
  labels: [string, string, string];
};

type BoundsPoint = [number, number];

type MarkerMetric = {
  markerText: string;
  color: string;
  sortValue: number;
};

type MarkerViewport = {
  zoom: number;
  width: number;
  height: number;
};

type MapPointGeoJson = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: {
      cityId: string;
      label: string;
      markerText: string;
      color: string;
      opacity: number;
      size: number;
      sortKey: number;
      selected: boolean;
      isZero: boolean;
    };
    geometry: {
      type: 'Point';
      coordinates: [number, number];
    };
  }>;
};

const emptyPointGeojson: MapPointGeoJson = {
  type: 'FeatureCollection',
  features: []
};

const pointSourceId = 'weather-points';
const pointCircleLayerId = 'weather-point-circle';
const pointLabelLayerId = 'weather-point-label';

const elevationColorStops = [
  { maxMeters: 100, color: '#4f9d86', gradientPosition: 0 },
  { maxMeters: 500, color: '#8fae5d', gradientPosition: 22 },
  { maxMeters: 1500, color: '#d1b55f', gradientPosition: 48 },
  { maxMeters: 3000, color: '#a96f4b', gradientPosition: 74 },
  { color: '#e6e2d3', gradientPosition: 100 }
] satisfies Array<{ maxMeters?: number; color: string; gradientPosition: number }>;

function temperatureColor(value: number): string {
  if (value <= 0) return '#6ca6ff';
  if (value <= 12) return '#48b7c7';
  if (value <= 22) return '#51b778';
  if (value <= 30) return '#e5aa31';
  return '#d86449';
}

function weatherColor(type: string): string {
  if (type === 'sunny' || type === 'partly_cloudy') return '#e6ae2f';
  if (type === 'light_rain' || type === 'rain' || type === 'thunderstorm') return '#3f88c5';
  if (type === 'light_snow' || type === 'snow') return '#8fb8d8';
  if (type === 'fog') return '#87909a';
  return '#6d7f68';
}

function elevationColor(value: number): string {
  return elevationColorStops.find((stop) => stop.maxMeters === undefined || value < stop.maxMeters)?.color ?? '#e6e2d3';
}

function elevationGradient(): string {
  const stops = elevationColorStops.map((stop) => `${stop.color} ${stop.gradientPosition}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function humidityColor(value: number): string {
  if (value < 30) return '#c99a45';
  if (value <= 70) return '#4f9d86';
  if (value <= 85) return '#3f88c5';
  return '#7568a8';
}

function collapseMapAttribution(container: HTMLElement | null): void {
  const attribution = container?.querySelector<HTMLDetailsElement>('.maplibregl-ctrl-attrib.maplibregl-compact');
  if (!attribution) return;
  attribution.dataset.autoCollapsed = 'true';
  attribution.removeAttribute('open');
  attribution.classList.remove('maplibregl-compact-show');
}

function setupCollapsedMapAttribution(container: HTMLElement | null): () => void {
  const attribution = container?.querySelector<HTMLDetailsElement>('.maplibregl-ctrl-attrib.maplibregl-compact');
  if (!attribution) return () => {};

  const observer = new MutationObserver(() => collapseMapAttribution(container));
  const summary = attribution.querySelector('summary');
  const handleUserOpen = () => {
    delete attribution.dataset.autoCollapsed;
    observer.disconnect();
  };

  collapseMapAttribution(container);
  observer.observe(attribution, { attributes: true, attributeFilter: ['class', 'open'] });
  summary?.addEventListener('pointerdown', handleUserOpen);

  return () => {
    observer.disconnect();
    summary?.removeEventListener('pointerdown', handleUserOpen);
  };
}

function precipitationColor(value: number): string {
  const opacity = Math.max(0.3, Math.min(1, value / 24 + 0.2));
  return `rgba(43, 116, 181, ${opacity})`;
}

function comfortColor(value: number): string {
  if (value >= 0.72) return '#2fa36b';
  if (value >= 0.45) return '#d0a02f';
  return '#c35b4b';
}

function interpolateColor(from: [number, number, number], to: [number, number, number], progress: number): string {
  const ratio = Math.max(0, Math.min(1, progress));
  const [red, green, blue] = from.map((channel, index) => Math.round(channel + (to[index] - channel) * ratio));
  return `rgb(${red}, ${green}, ${blue})`;
}

function relativeMatchColor(value: number, min: number, max: number): string {
  if (max <= min) return value > 0 ? '#d0a02f' : '#c35b4b';

  const normalized = (value - min) / (max - min);
  if (normalized <= 0.5) return interpolateColor([195, 91, 75], [208, 160, 47], normalized / 0.5);
  return interpolateColor([208, 160, 47], [47, 163, 107], (normalized - 0.5) / 0.5);
}

function normalizeRangeValue(value: number, min: number, max: number): number {
  if (max <= min) return value > 0 ? 0.55 : 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function markerCellSize(zoom: number, pointCount: number): number {
  if (pointCount < 90 || zoom >= 4.2) return 0;
  if (zoom < 1.8) return 56;
  if (zoom < 2.8) return 46;
  return 36;
}

function markerRank(point: MapPoint): number {
  const populationWeight = Math.log10(Math.max(point.prominence, 0) + 10) * 100;
  return (point.selected ? 1_000_000 : 0) + populationWeight + point.opacity * 24 + point.size;
}

function precipitationMarkerText(value: number): string {
  if (value < 10) return value.toFixed(1);
  return String(Math.round(value));
}

function elevationMarkerText(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

function temperatureMarkerText(valueC: number, unit: TemperatureUnit): string {
  const value = unit === 'f' ? celsiusToFahrenheit(valueC) : valueC;
  return `${Math.round(value)}°`;
}

function temperatureLabel(valueC: number, unit: TemperatureUnit): string {
  const value = unit === 'f' ? celsiusToFahrenheit(valueC) : valueC;
  return `${Math.round(value)}°${unit.toUpperCase()}`;
}

function travelMarkerMetric(score: DashboardTravelResultItem, layer: MapLayer, matchColor: string, temperatureUnit: TemperatureUnit): MarkerMetric {
  if (layer === 'temperature') {
    return {
      markerText: temperatureMarkerText(score.averageTemperatureC, temperatureUnit),
      color: temperatureColor(score.averageTemperatureC),
      sortValue: score.averageTemperatureC
    };
  }
  if (layer === 'weather') {
    return {
      markerText: weatherTypeEmoji[score.weatherType] ?? '',
      color: weatherColor(score.weatherType),
      sortValue: score.score
    };
  }
  if (layer === 'precipitation') {
    return {
      markerText: precipitationMarkerText(score.averagePrecipitationMm),
      color: precipitationColor(score.averagePrecipitationMm),
      sortValue: score.averagePrecipitationMm
    };
  }
  if (layer === 'humidity') {
    return {
      markerText: `${Math.round(score.averageHumidityPercent)}%`,
      color: humidityColor(score.averageHumidityPercent),
      sortValue: score.averageHumidityPercent
    };
  }
  if (layer === 'elevation') {
    return {
      markerText: elevationMarkerText(score.city.elevationMeters),
      color: elevationColor(score.city.elevationMeters),
      sortValue: score.city.elevationMeters
    };
  }

  return {
    markerText: '',
    color: matchColor,
    sortValue: score.matchDays
  };
}

function dailyMarkerMetric(item: DashboardDailyResultItem, layer: MapLayer, temperatureUnit: TemperatureUnit): MarkerMetric {
  if (layer === 'temperature') {
    return {
      markerText: temperatureMarkerText(item.forecast.temperatureMeanC, temperatureUnit),
      color: temperatureColor(item.forecast.temperatureMeanC),
      sortValue: item.forecast.temperatureMeanC
    };
  }
  if (layer === 'weather') {
    return {
      markerText: weatherTypeEmoji[item.forecast.weatherType],
      color: weatherColor(item.forecast.weatherType),
      sortValue: item.comfortScore
    };
  }
  if (layer === 'precipitation') {
    return {
      markerText: precipitationMarkerText(item.forecast.precipitationSumMm),
      color: precipitationColor(item.forecast.precipitationSumMm),
      sortValue: item.forecast.precipitationSumMm
    };
  }
  if (layer === 'humidity') {
    return {
      markerText: `${Math.round(item.forecast.humidityMeanPercent)}%`,
      color: humidityColor(item.forecast.humidityMeanPercent),
      sortValue: item.forecast.humidityMeanPercent
    };
  }
  if (layer === 'elevation') {
    return {
      markerText: elevationMarkerText(item.city.elevationMeters),
      color: elevationColor(item.city.elevationMeters),
      sortValue: item.city.elevationMeters
    };
  }

  return {
    markerText: '',
    color: comfortColor(item.comfortScore),
    sortValue: item.comfortScore
  };
}

function layerColor(summary: RegionWeatherSummary, layer: MapLayer): string {
  if (layer === 'temperature') return temperatureColor(summary.temperatureMeanC);
  if (layer === 'weather') return weatherColor(summary.weatherType);
  if (layer === 'precipitation') return precipitationColor(summary.precipitationSumMm);
  if (layer === 'humidity') return humidityColor(summary.humidityMeanPercent);
  if (layer === 'elevation') return elevationColor(summary.elevationMeters);
  return comfortColor(summary.comfortScore);
}

function layerLabel(summary: RegionWeatherSummary, layer: MapLayer, locale: DisplayLocale, temperatureUnit: TemperatureUnit): string {
  if (layer === 'temperature') return temperatureLabel(summary.temperatureMeanC, temperatureUnit);
  if (layer === 'weather') return getWeatherTypeLabel(summary.weatherType, locale);
  if (layer === 'precipitation') return `${summary.precipitationSumMm.toFixed(1)} mm`;
  if (layer === 'humidity') return `${Math.round(summary.humidityMeanPercent)}%`;
  if (layer === 'elevation') return `${Math.round(summary.elevationMeters)} m`;
  if (summary.totalDays > 0) return `${summary.matchDays}/${summary.totalDays}`;
  return `${Math.round(summary.comfortScore * 100)}%`;
}

function legendDescription(mode: ViewMode, layer: MapLayer, regionLayer: MapRegionLayer, locale: DisplayLocale): string {
  const areaName =
    regionLayer === 'country'
      ? { zh: '国家/地区', en: 'country' }
      : regionLayer === 'admin1'
        ? { zh: '一级行政区', en: 'admin area' }
        : { zh: '省级区域', en: 'province' };

  if (locale === 'en') {
    if (layer === 'elevation') return `${areaName.en} areas are colored by sampled elevation; city markers keep temperature context.`;
    if (layer === 'humidity') return 'Color shows mean RH; green is the comfortable range.';
    if (mode === 'travel' && layer === 'comfort') return 'Color follows the current min/max matching-day distribution.';
    return `${areaName.en} areas show the selected layer; city markers remain sample points.`;
  }

  if (layer === 'elevation') return `${areaName.zh}按海拔样本分层着色，城市点位保留温度`;
  if (layer === 'humidity') return '颜色显示日均相对湿度，绿色约为舒适湿度';
  if (mode === 'travel' && layer === 'comfort') return '颜色按当前结果的最小/最大匹配天数分布';
  return `${areaName.zh}显示当前图层主指标，城市点位是样本`;
}

function legendScale(mode: ViewMode, layer: MapLayer, locale: DisplayLocale): LegendScale {
  if (mode === 'travel' && layer === 'comfort') {
    return {
      gradient: 'linear-gradient(90deg, #c35b4b 0%, #d0a02f 50%, #2fa36b 100%)',
      labels: locale === 'zh' ? ['少', '中', '多'] : ['Low', 'Mid', 'High']
    };
  }

  if (layer === 'temperature') {
    return {
      gradient: 'linear-gradient(90deg, #6ca6ff 0%, #48b7c7 25%, #51b778 50%, #e5aa31 75%, #d86449 100%)',
      labels: locale === 'zh' ? ['冷', '舒适', '热'] : ['Cold', 'Mild', 'Hot']
    };
  }

  if (layer === 'humidity') {
    return {
      gradient: 'linear-gradient(90deg, #c99a45 0%, #4f9d86 45%, #3f88c5 75%, #7568a8 100%)',
      labels: locale === 'zh' ? ['干', '舒适', '潮湿'] : ['Dry', 'Mild', 'Humid']
    };
  }

  if (layer === 'precipitation') {
    return {
      gradient: 'linear-gradient(90deg, rgba(43, 116, 181, 0.25) 0%, rgba(43, 116, 181, 0.6) 55%, rgba(43, 116, 181, 1) 100%)',
      labels: locale === 'zh' ? ['少', '中', '多'] : ['Low', 'Mid', 'High']
    };
  }

  if (layer === 'elevation') {
    return {
      gradient: elevationGradient(),
      labels: locale === 'zh' ? ['低', '中', '高'] : ['Low', 'Mid', 'High']
    };
  }

  if (layer === 'weather') {
    return {
      gradient: 'linear-gradient(90deg, #e6ae2f 0%, #6d7f68 45%, #3f88c5 75%, #8fb8d8 100%)',
      labels: locale === 'zh' ? ['晴', '阴', '雨雪'] : ['Sun', 'Cloud', 'Rain/snow']
    };
  }

  return {
    gradient: 'linear-gradient(90deg, #c35b4b 0%, #d0a02f 50%, #2fa36b 100%)',
    labels: locale === 'zh' ? ['低', '中', '高'] : ['Low', 'Mid', 'High']
  };
}

function regionSourceId(layer: MapRegionLayer): string {
  if (layer === 'country') return 'world-countries';
  if (layer === 'admin1') return 'detailed-admin1';
  return 'china-provinces';
}

function regionFillLayerId(layer: MapRegionLayer): string {
  return `${regionSourceId(layer)}-fill`;
}

function regionLineLayerId(layer: MapRegionLayer): string {
  return `${regionSourceId(layer)}-line`;
}

function regionKeyForFeature(feature: { properties: Record<string, unknown> }, layer: MapRegionLayer): string {
  if (layer === 'china-admin1') return `province:${String(feature.properties.adcode ?? '')}`;
  return String(feature.properties.regionKey ?? '');
}

function cleanRegionLabel(name: string): string {
  return name.replace(/省|市|自治区|特别行政区/g, '');
}

function decorateRegionGeojson(
  geojson: MapGeoJson,
  summaries: RegionWeatherSummary[],
  activeLayer: MapRegionLayer,
  targetLayer: MapRegionLayer,
  activeRegion: RegionKey,
  mode: ViewMode,
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
      const regionKey = regionKeyForFeature(feature, targetLayer);
      const summary = summariesById.get(regionKey);
      const isVisibleRegion = isActiveLayer && Boolean(summary);
      const isActiveRegion = isVisibleRegion && regionKey === activeRegion;
      const fillColor =
        summary && mode === 'travel' && layer === 'comfort'
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

function buildBoundsFromPoints(points: BoundsPoint[]): maplibregl.LngLatBounds | null {
  if (points.length === 0) return null;

  const latitudes = points.map(([, latitude]) => latitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const longitudes = points.map(([longitude]) => normalizeLongitude(longitude)).sort((a, b) => a - b);

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

function buildRegionBounds(
  geojson: MapGeoJson | null,
  summaries: RegionWeatherSummary[],
  targetLayer: MapRegionLayer
): maplibregl.LngLatBounds | null {
  if (!geojson || summaries.length === 0) return null;

  const summaryIds = new Set(summaries.map((summary) => summary.id));
  const boundsPoints: BoundsPoint[] = [];
  for (const feature of geojson.features) {
    if (!summaryIds.has(regionKeyForFeature(feature, targetLayer))) continue;
    collectBoundsCoordinates(boundsPoints, feature.geometry.coordinates);
  }

  return buildBoundsFromPoints(boundsPoints);
}

function buildPointGeojson(points: MapPoint[]): MapPointGeoJson {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      properties: {
        cityId: point.cityId,
        label: point.label,
        markerText: point.markerText,
        color: point.color,
        opacity: point.opacity,
        size: point.size,
        sortKey: markerRank(point),
        selected: point.selected,
        isZero: point.sortValue === 0
      },
      geometry: {
        type: 'Point',
        coordinates: [point.longitude, point.latitude]
      }
    }))
  };
}

function regionGeojsonUrl(layer: MapRegionLayer): string {
  if (layer === 'country') return '/data/geo/world-countries.geojson';
  if (layer === 'admin1') return '/data/geo/detailed-admin1.geojson';
  return '/data/geo/china-provinces.geojson';
}

export function WorldWeatherMap({
  mode,
  locale,
  layer,
  resultItems,
  regionSummaries,
  temperatureUnit,
  activeRegion,
  regionLayer,
  selectedCityId,
  onSelectCity
}: WorldWeatherMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectCityRef = useRef(onSelectCity);
  const loadingRegionLayersRef = useRef<Partial<Record<MapRegionLayer, Promise<void>>>>({});
  const regionGeojsonRef = useRef<Record<MapRegionLayer, MapGeoJson | null>>({
    country: null,
    admin1: null,
    'china-admin1': null
  });
  const [mapReady, setMapReady] = useState(false);
  const [regionDataVersion, setRegionDataVersion] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [markerViewport, setMarkerViewport] = useState<MarkerViewport>({ zoom: 1.35, width: 0, height: 0 });
  const scale = legendScale(mode, layer, locale);
  const hasRegionLayer = regionSummaries.length > 0;
  const fullscreenLabel =
    locale === 'zh'
      ? isFullscreen
        ? '退出地图全屏'
        : '地图全屏'
      : isFullscreen
        ? 'Exit map fullscreen'
        : 'Fullscreen map';

  useEffect(() => {
    onSelectCityRef.current = onSelectCity;
  }, [onSelectCity]);

  const points = useMemo<MapPoint[]>(() => {
    if (mode === 'travel') {
      const travelItems = resultItems.filter(isDashboardTravelItem);
      const matchDays = travelItems.map((score) => score.matchDays);
      const minMatchDays = Math.min(...matchDays, 0);
      const maxMatchDays = Math.max(...matchDays, 0);

      return travelItems.map((score) => {
        const normalized = normalizeRangeValue(score.matchDays, minMatchDays, maxMatchDays);
        const matchColor = relativeMatchColor(score.matchDays, minMatchDays, maxMatchDays);
        const metric = travelMarkerMetric(score, layer, matchColor, temperatureUnit);
        return {
          cityId: score.city.id,
          label: `${formatCityName(score.city, locale)}, ${formatCityRegion(score.city, locale)}`,
          longitude: score.city.longitude,
          latitude: score.city.latitude,
          markerText: metric.markerText,
          color: metric.color,
          opacity: score.matchDays === 0 ? 0.22 : Math.max(0.48, Math.min(1, 0.5 + normalized * 0.5)),
          size: layer === 'comfort' ? 24 : 34,
          sortValue: metric.sortValue,
          prominence: score.city.population ?? 0,
          selected: selectedCityId === score.city.id
        };
      }).sort((a, b) => {
        if (a.selected !== b.selected) return a.selected ? 1 : -1;
        return a.sortValue - b.sortValue;
      });
    }

    return resultItems.filter((item): item is DashboardDailyResultItem => !isDashboardTravelItem(item)).map((item) => {
      const metric = dailyMarkerMetric(item, layer, temperatureUnit);

      return {
        cityId: item.city.id,
        label: `${formatCityName(item.city, locale)}, ${formatCityRegion(item.city, locale)}`,
        longitude: item.city.longitude,
        latitude: item.city.latitude,
        markerText: metric.markerText,
        color: metric.color,
        opacity: hasRegionLayer ? 0.72 : 0.86,
        size: layer === 'comfort' ? 24 : hasRegionLayer ? 28 : 34,
        sortValue: metric.sortValue,
        prominence: item.city.population ?? 0,
        selected: selectedCityId === item.city.id
      };
    }).sort((a, b) => {
      if (a.selected !== b.selected) return a.selected ? 1 : -1;
      return a.sortValue - b.sortValue;
    });
  }, [hasRegionLayer, layer, locale, mode, resultItems, selectedCityId, temperatureUnit]);

  const updateMarkerViewport = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const canvas = map.getCanvas();
    const nextViewport = {
      zoom: Math.round(map.getZoom() * 100) / 100,
      width: canvas.clientWidth,
      height: canvas.clientHeight
    };

    setMarkerViewport((current) =>
      current.zoom === nextViewport.zoom && current.width === nextViewport.width && current.height === nextViewport.height
        ? current
        : nextViewport
    );
  }, []);

  const visiblePoints = useMemo(() => {
    const map = mapRef.current;
    const cellSize = markerCellSize(markerViewport.zoom, points.length);
    if (!map) return points;
    if (markerViewport.width === 0 || markerViewport.height === 0) return [];
    if (cellSize === 0) return points;

    const occupiedCells = new Set<string>();
    const visibleIds = new Set<string>();
    const viewportMargin = cellSize;
    const rankedPoints = [...points].sort((a, b) => markerRank(b) - markerRank(a));

    for (const point of rankedPoints) {
      const projected = map.project([point.longitude, point.latitude]);
      const isInsideViewport =
        projected.x >= -viewportMargin &&
        projected.x <= markerViewport.width + viewportMargin &&
        projected.y >= -viewportMargin &&
        projected.y <= markerViewport.height + viewportMargin;
      if (!isInsideViewport && !point.selected) continue;

      const cellKey = `${Math.floor(projected.x / cellSize)}:${Math.floor(projected.y / cellSize)}`;
      if (!point.selected && occupiedCells.has(cellKey)) continue;

      visibleIds.add(point.cityId);
      occupiedCells.add(cellKey);
    }

    return points.filter((point) => visibleIds.has(point.cityId));
  }, [markerViewport, points]);

  const cityCountText = useMemo(() => {
    const cityCount = visiblePoints.length === points.length ? `${points.length}` : `${visiblePoints.length}/${points.length}`;
    const cityLabel = locale === 'zh' ? '个城市' : 'cities';

    if (!hasRegionLayer) return `${cityCount} ${cityLabel}`;
    return `${regionSummaries.length} ${locale === 'zh' ? '个区域' : 'regions'} · ${cityCount} ${cityLabel}`;
  }, [hasRegionLayer, locale, points.length, regionSummaries.length, visiblePoints.length]);

  const pointBounds = useMemo(() => {
    const boundsPoints = resultItems.map((item): BoundsPoint => [item.city.longitude, item.city.latitude]);

    return buildBoundsFromPoints(boundsPoints);
  }, [resultItems]);

  const ensureRegionLayer = useCallback(
    async (targetLayer: MapRegionLayer) => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      if (regionGeojsonRef.current[targetLayer]) return;
      if (loadingRegionLayersRef.current[targetLayer]) {
        await loadingRegionLayersRef.current[targetLayer];
        return;
      }

      loadingRegionLayersRef.current[targetLayer] = fetch(regionGeojsonUrl(targetLayer))
        .then((response) => response.json() as Promise<MapGeoJson>)
        .then((geojson) => {
          const currentMap = mapRef.current;
          if (!currentMap) return;
          regionGeojsonRef.current[targetLayer] = geojson;
          const sourceId = regionSourceId(targetLayer);
          if (!currentMap.getSource(sourceId)) {
            currentMap.addSource(sourceId, {
              type: 'geojson',
              data: geojson
            });
          }

          const beforePointLayer = currentMap.getLayer(pointCircleLayerId) ? pointCircleLayerId : undefined;
          if (!currentMap.getLayer(regionFillLayerId(targetLayer))) {
            currentMap.addLayer(
              {
                id: regionFillLayerId(targetLayer),
                type: 'fill',
                source: sourceId,
                layout: {
                  visibility: 'none'
                },
                paint: {
                  'fill-color': ['coalesce', ['get', 'fillColor'], 'rgba(255,255,255,0)'],
                  'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0],
                  'fill-outline-color': targetLayer === 'country' ? 'rgba(24,32,31,0.18)' : 'rgba(24,32,31,0.28)'
                }
              },
              beforePointLayer
            );
          }

          if (!currentMap.getLayer(regionLineLayerId(targetLayer))) {
            currentMap.addLayer(
              {
                id: regionLineLayerId(targetLayer),
                type: 'line',
                source: sourceId,
                layout: {
                  visibility: 'none'
                },
                paint: {
                  'line-color': targetLayer === 'country' ? 'rgba(24,32,31,0.22)' : 'rgba(24,32,31,0.35)',
                  'line-width': [
                    'case',
                    ['boolean', ['get', 'isActiveRegion'], false],
                    targetLayer === 'country' ? 1.25 : 2,
                    ['boolean', ['get', 'isVisibleRegion'], false],
                    targetLayer === 'country' ? 0.65 : 1.05,
                    0.3
                  ],
                  'line-opacity': ['case', ['boolean', ['get', 'isVisibleRegion'], false], targetLayer === 'country' ? 0.65 : 0.9, 0]
                }
              },
              beforePointLayer
            );
          }

          setRegionDataVersion((current) => current + 1);
        })
        .finally(() => {
          delete loadingRegionLayersRef.current[targetLayer];
        });

      await loadingRegionLayersRef.current[targetLayer];
    },
    [mapReady]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      center: [18, 23],
      zoom: 1.35,
      minZoom: 1,
      maxZoom: 8,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
            paint: {
              'raster-saturation': -0.16,
              'raster-contrast': -0.03,
              'raster-brightness-min': 0.18,
              'raster-brightness-max': 0.98
            }
          }
        ]
      }
    });

    const handlePointClick = (event: MapLayerMouseEvent) => {
      const cityId = event.features?.[0]?.properties?.cityId;
      if (typeof cityId === 'string') onSelectCityRef.current(cityId);
    };
    const handlePointEnter = () => {
      const canvas = mapRef.current?.getCanvas();
      if (canvas) canvas.style.cursor = 'pointer';
    };
    const handlePointLeave = () => {
      const canvas = mapRef.current?.getCanvas();
      if (canvas) canvas.style.cursor = '';
    };

    mapRef.current.on('load', () => {
      const map = mapRef.current;
      if (!map) return;

      map.addSource(pointSourceId, {
        type: 'geojson',
        data: emptyPointGeojson
      });
      map.addLayer({
        id: pointCircleLayerId,
        type: 'circle',
        source: pointSourceId,
        layout: {
          'circle-sort-key': ['to-number', ['get', 'sortKey'], 0]
        },
        paint: {
          'circle-color': ['get', 'color'],
          'circle-opacity': ['to-number', ['get', 'opacity'], 0.82],
          'circle-radius': ['/', ['to-number', ['get', 'size'], 28], 2],
          'circle-stroke-color': ['case', ['boolean', ['get', 'selected'], false], '#ffffff', 'rgba(255,255,255,0.72)'],
          'circle-stroke-opacity': ['case', ['boolean', ['get', 'isZero'], false], 0.42, 0.92],
          'circle-stroke-width': ['case', ['boolean', ['get', 'selected'], false], 2.6, 1]
        }
      });
      map.addLayer({
        id: pointLabelLayerId,
        type: 'symbol',
        source: pointSourceId,
        layout: {
          'text-allow-overlap': true,
          'text-field': ['get', 'markerText'],
          'text-ignore-placement': true,
          'text-size': 11,
          'symbol-sort-key': ['to-number', ['get', 'sortKey'], 0]
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(24,32,31,0.16)',
          'text-halo-width': 0.6,
          'text-opacity': ['case', ['boolean', ['get', 'isZero'], false], 0.72, 1]
        }
      });
      map.on('click', pointCircleLayerId, handlePointClick);
      map.on('click', pointLabelLayerId, handlePointClick);
      map.on('mouseenter', pointCircleLayerId, handlePointEnter);
      map.on('mouseenter', pointLabelLayerId, handlePointEnter);
      map.on('mouseleave', pointCircleLayerId, handlePointLeave);
      map.on('mouseleave', pointLabelLayerId, handlePointLeave);

      setMapReady(true);
    });

    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapRef.current.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    let cleanupAttribution = () => {};
    const installCollapsedAttribution = () => {
      cleanupAttribution();
      cleanupAttribution = setupCollapsedMapAttribution(containerRef.current);
    };
    const attributionTimers = [100, 500, 1000].map((delay) => window.setTimeout(installCollapsedAttribution, delay));
    requestAnimationFrame(installCollapsedAttribution);

    return () => {
      attributionTimers.forEach((timer) => window.clearTimeout(timer));
      cleanupAttribution();
      mapRef.current?.off('click', pointCircleLayerId, handlePointClick);
      mapRef.current?.off('click', pointLabelLayerId, handlePointClick);
      mapRef.current?.off('mouseenter', pointCircleLayerId, handlePointEnter);
      mapRef.current?.off('mouseenter', pointLabelLayerId, handlePointEnter);
      mapRef.current?.off('mouseleave', pointCircleLayerId, handlePointLeave);
      mapRef.current?.off('mouseleave', pointLabelLayerId, handlePointLeave);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    void ensureRegionLayer(regionLayer);
  }, [ensureRegionLayer, mapReady, regionLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    (['country', 'admin1', 'china-admin1'] as MapRegionLayer[]).forEach((mapRegionLayer) => {
      const visibility = mapRegionLayer === regionLayer ? 'visible' : 'none';
      if (map.getLayer(regionFillLayerId(mapRegionLayer))) {
        map.setLayoutProperty(regionFillLayerId(mapRegionLayer), 'visibility', visibility);
      }
      if (map.getLayer(regionLineLayerId(mapRegionLayer))) {
        map.setLayoutProperty(regionLineLayerId(mapRegionLayer), 'visibility', visibility);
      }
    });

    const source = map.getSource(regionSourceId(regionLayer));
    const geojson = regionGeojsonRef.current[regionLayer];
    if (!source || !('setData' in source) || !geojson) return;

    (source as GeoJSONSource).setData(
      decorateRegionGeojson(geojson, regionSummaries, regionLayer, regionLayer, activeRegion, mode, layer, locale, temperatureUnit)
    );
  }, [activeRegion, layer, locale, mode, regionDataVersion, regionLayer, regionSummaries, mapReady, temperatureUnit]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    updateMarkerViewport();
    map.on('moveend', updateMarkerViewport);
    map.on('zoomend', updateMarkerViewport);
    map.on('resize', updateMarkerViewport);

    return () => {
      map.off('moveend', updateMarkerViewport);
      map.off('zoomend', updateMarkerViewport);
      map.off('resize', updateMarkerViewport);
    };
  }, [mapReady, updateMarkerViewport]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const bounds = buildRegionBounds(regionGeojsonRef.current[regionLayer], regionSummaries, regionLayer) ?? pointBounds;
    if (bounds) {
      map.fitBounds(bounds, {
        padding: activeRegion === 'world' ? 24 : 84,
        maxZoom: activeRegion === 'world' ? 1.45 : regionLayer === 'country' ? 4.8 : 5.6,
        duration: 420
      });
    }
  }, [activeRegion, pointBounds, regionDataVersion, regionLayer, regionSummaries, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource(pointSourceId);
    if (!source || !('setData' in source)) return;
    (source as GeoJSONSource).setData(buildPointGeojson(visiblePoints));
  }, [mapReady, visiblePoints]);

  useEffect(() => {
    const resizeMap = () => {
      mapRef.current?.resize();
      updateMarkerViewport();
    };
    const frameId = window.requestAnimationFrame(resizeMap);
    const timeoutId = window.setTimeout(resizeMap, 220);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [isFullscreen, updateMarkerViewport]);

  useEffect(() => {
    if (!isFullscreen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  return (
    <section className={`map-shell${isFullscreen ? ' is-fullscreen' : ''}`} aria-label={locale === 'zh' ? '全球天气地图' : 'Global weather map'}>
      <button
        className="map-fullscreen-button"
        type="button"
        onClick={() => setIsFullscreen((current) => !current)}
        aria-label={fullscreenLabel}
        aria-pressed={isFullscreen}
        title={fullscreenLabel}
      >
        {isFullscreen ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
      </button>
      <div ref={containerRef} className="weather-map" />
      <div className="map-legend">
        <div className="map-legend-main">
          <span>{legendDescription(mode, layer, regionLayer, locale)}</span>
          <div className="legend-scale" aria-label={locale === 'zh' ? '颜色图例' : 'Color legend'}>
            <div className="legend-gradient" style={{ background: scale.gradient }} />
            <div className="legend-labels">
              {scale.labels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </div>
        </div>
        <span>{cityCountText}</span>
      </div>
    </section>
  );
}
