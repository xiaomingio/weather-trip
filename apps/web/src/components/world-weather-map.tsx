/**
 * 文件说明: 使用 MapLibre 渲染世界地图，并按旅行匹配或单日图层展示城市点位。
 * 对应文档: docs/product-design.md
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent
} from 'maplibre-gl';
import type { CityDailyWeather, CityTravelScore, MapLayer, RegionKey, RegionWeatherSummary, ViewMode } from 'weather-core/types';
import { type DisplayLocale, formatCityName, formatCityRegion } from '@/domain/format';
import type { MapRegionLayer } from '@/domain/regions';
import { getWeatherTypeLabel, weatherTypeEmoji } from '@/domain/weather';

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
  selected: boolean;
};

type WorldWeatherMapProps = {
  mode: ViewMode;
  locale: DisplayLocale;
  layer: MapLayer;
  travelScores: CityTravelScore[];
  dailyWeather: CityDailyWeather[];
  regionSummaries: RegionWeatherSummary[];
  activeRegion: RegionKey;
  regionLayer: MapRegionLayer;
  selectableRegionIds: RegionKey[];
  selectedCityId: string | null;
  onSelectCity: (cityId: string) => void;
  onSelectRegion: (region: RegionKey) => void;
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
  if (value < 100) return '#4f9d86';
  if (value < 800) return '#9a9a4a';
  if (value < 1800) return '#b56e4b';
  return '#7d6eb1';
}

function humidityColor(value: number): string {
  if (value < 30) return '#c99a45';
  if (value <= 70) return '#4f9d86';
  if (value <= 85) return '#3f88c5';
  return '#7568a8';
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

function layerColor(summary: RegionWeatherSummary, layer: MapLayer): string {
  if (layer === 'temperature') return temperatureColor(summary.temperatureMeanC);
  if (layer === 'weather') return weatherColor(summary.weatherType);
  if (layer === 'precipitation') {
    const opacity = Math.max(0.28, Math.min(0.92, summary.precipitationSumMm / 18 + 0.25));
    return `rgba(43, 116, 181, ${opacity})`;
  }
  if (layer === 'humidity') return humidityColor(summary.humidityMeanPercent);
  if (layer === 'elevation') return elevationColor(summary.elevationMeters);
  return comfortColor(summary.comfortScore);
}

function layerLabel(summary: RegionWeatherSummary, layer: MapLayer, locale: DisplayLocale): string {
  if (layer === 'temperature') return `${Math.round(summary.temperatureMeanC)}°C`;
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
    if (layer === 'humidity') return 'Color shows mean relative humidity; green is the comfortable range.';
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
      gradient: 'linear-gradient(90deg, #4f9d86 0%, #9a9a4a 35%, #b56e4b 70%, #7d6eb1 100%)',
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

function regionKeyFromMapFeature(feature: MapGeoJSONFeature | undefined, layer: MapRegionLayer): RegionKey | null {
  if (!feature) return null;
  const key = regionKeyForFeature({ properties: feature.properties ?? {} }, layer);
  return key ? key : null;
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
  locale: DisplayLocale
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
          label: summary ? `${cleanRegionLabel(summary.name)} ${layerLabel(summary, layer, locale)}` : ''
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

function buildPointBounds(points: MapPoint[]): maplibregl.LngLatBounds | null {
  return buildBoundsFromPoints(points.map((point) => [point.longitude, point.latitude]));
}

export function WorldWeatherMap({
  mode,
  locale,
  layer,
  travelScores,
  dailyWeather,
  regionSummaries,
  activeRegion,
  regionLayer,
  selectableRegionIds,
  selectedCityId,
  onSelectCity,
  onSelectRegion
}: WorldWeatherMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const regionGeojsonRef = useRef<Record<MapRegionLayer, MapGeoJson | null>>({
    country: null,
    admin1: null,
    'china-admin1': null
  });
  const [regionsReady, setRegionsReady] = useState(false);
  const scale = legendScale(mode, layer, locale);
  const hasRegionLayer = regionSummaries.length > 0;

  const points = useMemo<MapPoint[]>(() => {
    if (mode === 'travel') {
      const matchDays = travelScores.map((score) => score.matchDays);
      const minMatchDays = Math.min(...matchDays, 0);
      const maxMatchDays = Math.max(...matchDays, 0);

      return travelScores.map((score) => {
        const normalized = normalizeRangeValue(score.matchDays, minMatchDays, maxMatchDays);
        return {
          cityId: score.city.id,
          label: `${formatCityName(score.city, locale)}, ${formatCityRegion(score.city, locale)}`,
          longitude: score.city.longitude,
          latitude: score.city.latitude,
          markerText: String(score.matchDays),
          color: relativeMatchColor(score.matchDays, minMatchDays, maxMatchDays),
          opacity: score.matchDays === 0 ? 0.22 : Math.max(0.48, Math.min(1, 0.5 + normalized * 0.5)),
          size: 24 + normalized * 24,
          sortValue: score.matchDays,
          selected: selectedCityId === score.city.id
        };
      }).sort((a, b) => {
        if (a.selected !== b.selected) return a.selected ? 1 : -1;
        return a.sortValue - b.sortValue;
      });
    }

    return dailyWeather.map((item) => {
      const valueColor =
        layer === 'temperature'
          ? temperatureColor(item.forecast.temperatureMeanC)
          : layer === 'weather'
            ? weatherColor(item.forecast.weatherType)
            : layer === 'precipitation'
              ? `rgba(43, 116, 181, ${Math.max(0.3, Math.min(1, item.forecast.precipitationSumMm / 24 + 0.2))})`
              : layer === 'humidity'
                ? humidityColor(item.forecast.humidityMeanPercent)
                : layer === 'elevation'
                  ? elevationColor(item.city.elevationMeters)
                  : comfortColor(item.comfortScore);

      return {
        cityId: item.city.id,
        label: `${formatCityName(item.city, locale)}, ${formatCityRegion(item.city, locale)}`,
        longitude: item.city.longitude,
        latitude: item.city.latitude,
        markerText:
          layer === 'weather'
            ? weatherTypeEmoji[item.forecast.weatherType]
            : layer === 'humidity'
              ? `${Math.round(item.forecast.humidityMeanPercent)}%`
              : `${Math.round(item.forecast.temperatureMeanC)}°`,
        color: valueColor,
        opacity: hasRegionLayer ? 0.72 : 0.86,
        size: hasRegionLayer ? 24 : layer === 'comfort' ? 24 + item.comfortScore * 22 : 34,
        sortValue: item.comfortScore,
        selected: selectedCityId === item.city.id
      };
    }).sort((a, b) => {
      if (a.selected !== b.selected) return a.selected ? 1 : -1;
      return a.sortValue - b.sortValue;
    });
  }, [dailyWeather, hasRegionLayer, layer, locale, mode, selectedCityId, travelScores]);

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
              'raster-saturation': -0.55,
              'raster-contrast': -0.08,
              'raster-brightness-min': 0.12,
              'raster-brightness-max': 0.92
            }
          }
        ]
      }
    });

    mapRef.current.on('load', async () => {
      const [countryGeojson, admin1Geojson, chinaGeojson] = await Promise.all([
        fetch('/data/geo/world-countries.geojson').then((response) => response.json() as Promise<MapGeoJson>),
        fetch('/data/geo/detailed-admin1.geojson').then((response) => response.json() as Promise<MapGeoJson>),
        fetch('/data/geo/china-provinces.geojson').then((response) => response.json() as Promise<MapGeoJson>)
      ]);
      regionGeojsonRef.current = {
        country: countryGeojson,
        admin1: admin1Geojson,
        'china-admin1': chinaGeojson
      };

      (['country', 'admin1', 'china-admin1'] as MapRegionLayer[]).forEach((mapRegionLayer) => {
        const sourceId = regionSourceId(mapRegionLayer);
        if (!mapRef.current?.getSource(sourceId)) {
          mapRef.current?.addSource(sourceId, {
            type: 'geojson',
            data: regionGeojsonRef.current[mapRegionLayer] as MapGeoJson
          });
        }

        mapRef.current?.addLayer({
          id: regionFillLayerId(mapRegionLayer),
          type: 'fill',
          source: sourceId,
          layout: {
            visibility: mapRegionLayer === regionLayer ? 'visible' : 'none'
          },
          paint: {
            'fill-color': ['coalesce', ['get', 'fillColor'], 'rgba(255,255,255,0)'],
            'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0],
            'fill-outline-color': mapRegionLayer === 'country' ? 'rgba(24,32,31,0.18)' : 'rgba(24,32,31,0.28)'
          }
        });

        mapRef.current?.addLayer({
          id: regionLineLayerId(mapRegionLayer),
          type: 'line',
          source: sourceId,
          layout: {
            visibility: mapRegionLayer === regionLayer ? 'visible' : 'none'
          },
          paint: {
            'line-color': mapRegionLayer === 'country' ? 'rgba(24,32,31,0.22)' : 'rgba(24,32,31,0.35)',
            'line-width': [
              'case',
              ['boolean', ['get', 'isActiveRegion'], false],
              mapRegionLayer === 'country' ? 1.25 : 2,
              ['boolean', ['get', 'isVisibleRegion'], false],
              mapRegionLayer === 'country' ? 0.65 : 1.05,
              0.3
            ],
            'line-opacity': ['case', ['boolean', ['get', 'isVisibleRegion'], false], mapRegionLayer === 'country' ? 0.65 : 0.9, 0]
          }
        });
      });

      setRegionsReady(true);
    });

    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapRef.current.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !regionsReady) return;

    (['country', 'admin1', 'china-admin1'] as MapRegionLayer[]).forEach((mapRegionLayer) => {
      const source = map.getSource(regionSourceId(mapRegionLayer));
      const geojson = regionGeojsonRef.current[mapRegionLayer];
      if (!source || !('setData' in source) || !geojson) return;

      (source as GeoJSONSource).setData(
        decorateRegionGeojson(geojson, regionSummaries, regionLayer, mapRegionLayer, activeRegion, mode, layer, locale)
      );
      const visibility = mapRegionLayer === regionLayer ? 'visible' : 'none';
      if (map.getLayer(regionFillLayerId(mapRegionLayer))) {
        map.setLayoutProperty(regionFillLayerId(mapRegionLayer), 'visibility', visibility);
      }
      if (map.getLayer(regionLineLayerId(mapRegionLayer))) {
        map.setLayoutProperty(regionLineLayerId(mapRegionLayer), 'visibility', visibility);
      }
    });
  }, [activeRegion, layer, locale, mode, regionLayer, regionSummaries, regionsReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !regionsReady) return;

    const selectableRegions = new Set(selectableRegionIds);
    const mapRegionLayers: MapRegionLayer[] = ['country', 'admin1', 'china-admin1'];
    const bindings = mapRegionLayers.map((mapRegionLayer) => {
      const layerId = regionFillLayerId(mapRegionLayer);
      const handleClick = (event: MapLayerMouseEvent) => {
        const region = regionKeyFromMapFeature(event.features?.[0], mapRegionLayer);
        if (!region || !selectableRegions.has(region)) return;
        onSelectRegion(region);
      };
      const handleMouseMove = (event: MapLayerMouseEvent) => {
        const region = regionKeyFromMapFeature(event.features?.[0], mapRegionLayer);
        map.getCanvas().style.cursor = region && selectableRegions.has(region) ? 'pointer' : '';
      };
      const handleMouseLeave = () => {
        map.getCanvas().style.cursor = '';
      };

      map.on('click', layerId, handleClick);
      map.on('mousemove', layerId, handleMouseMove);
      map.on('mouseleave', layerId, handleMouseLeave);

      return { layerId, handleClick, handleMouseMove, handleMouseLeave };
    });

    return () => {
      bindings.forEach(({ layerId, handleClick, handleMouseMove, handleMouseLeave }) => {
        map.off('click', layerId, handleClick);
        map.off('mousemove', layerId, handleMouseMove);
        map.off('mouseleave', layerId, handleMouseLeave);
      });
      map.getCanvas().style.cursor = '';
    };
  }, [onSelectRegion, regionsReady, selectableRegionIds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !regionsReady) return;

    const bounds = buildRegionBounds(regionGeojsonRef.current[regionLayer], regionSummaries, regionLayer) ?? buildPointBounds(points);
    if (bounds) {
      map.fitBounds(bounds, {
        padding: activeRegion === 'world' ? 24 : 84,
        maxZoom: activeRegion === 'world' ? 1.45 : regionLayer === 'country' ? 4.8 : 5.6,
        duration: 420
      });
    }
  }, [activeRegion, points, regionLayer, regionSummaries, regionsReady]);

  useEffect(() => {
    if (!mapRef.current) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = points.map((point) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = `map-marker${point.sortValue === 0 ? ' is-zero' : ''}${point.selected ? ' is-selected' : ''}`;
      element.style.setProperty('--marker-color', point.color);
      element.style.setProperty('--marker-opacity', `${Math.round(point.opacity * 100)}%`);
      element.style.setProperty('--marker-size', `${point.size}px`);
      element.style.zIndex = point.selected ? '30' : String(point.sortValue > 0 ? 20 : 10);
      element.setAttribute('aria-label', point.label);
      element.textContent = point.markerText;
      element.addEventListener('click', () => onSelectCity(point.cityId));

      return new maplibregl.Marker({ element })
        .setLngLat([point.longitude, point.latitude])
        .addTo(mapRef.current as MapLibreMap);
    });
  }, [onSelectCity, points]);

  return (
    <section className="map-shell" aria-label={locale === 'zh' ? '全球天气地图' : 'Global weather map'}>
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
        <span>
          {hasRegionLayer
            ? `${regionSummaries.length} ${locale === 'zh' ? '个区域' : 'regions'} · ${points.length} ${
                locale === 'zh' ? '个城市' : 'cities'
              }`
            : `${points.length} ${locale === 'zh' ? '个城市' : 'cities'}`}
        </span>
      </div>
    </section>
  );
}
