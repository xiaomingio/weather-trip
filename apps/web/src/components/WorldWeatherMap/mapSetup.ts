/**
 * 文件说明: 封装 WorldWeatherMap 使用的 MapLibre 地图创建、基础图层和 attribution 折叠逻辑。
 * 对应文档: docs/product-design.md
 */

import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { buildWeatherTypeMapIconDataUrl, weatherTypeMapIconEntries } from '@/components/weather-icons';
import type { MapPointGeoJson } from './types';

export const pointSourceId = 'weather-points';
export const pointCircleLayerId = 'weather-point-circle';
export const pointHoverLayerId = 'weather-point-hover';
export const pointIconLayerId = 'weather-point-icon';
export const pointLabelLayerId = 'weather-point-label';
export const defaultWorldCenter: [number, number] = [18, 23];
export const defaultWorldZoom = 1.35;

const emptyPointGeojson: MapPointGeoJson = {
  type: 'FeatureCollection',
  features: []
};

function collapseMapAttribution(container: HTMLElement | null): void {
  const attribution = container?.querySelector<HTMLDetailsElement>('.maplibregl-ctrl-attrib.maplibregl-compact');
  if (!attribution) return;
  attribution.dataset.autoCollapsed = 'true';
  attribution.removeAttribute('open');
  attribution.classList.remove('maplibregl-compact-show');
}

export function setupCollapsedMapAttribution(container: HTMLElement | null): () => void {
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

export function createWorldMap(container: HTMLElement): MapLibreMap {
  const map = new maplibregl.Map({
    container,
    center: defaultWorldCenter,
    zoom: defaultWorldZoom,
    bearing: 0,
    pitch: 0,
    maxPitch: 0,
    minZoom: 1,
    maxZoom: 8,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
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

  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
  return map;
}

function loadWeatherPointImage(source: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image(24, 24);
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

export async function ensureWeatherPointImages(map: MapLibreMap): Promise<void> {
  await Promise.all(
    weatherTypeMapIconEntries.map(async ([type, imageId]) => {
      if (map.hasImage(imageId)) return;
      const image = await loadWeatherPointImage(buildWeatherTypeMapIconDataUrl(type));
      if (image && !map.hasImage(imageId)) map.addImage(imageId, image, { pixelRatio: 1 });
    })
  );
}

export function addPointLayers(map: MapLibreMap): void {
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
    id: pointHoverLayerId,
    type: 'circle',
    source: pointSourceId,
    filter: ['==', ['get', 'cityId'], ''],
    layout: {
      'circle-sort-key': ['to-number', ['get', 'sortKey'], 0]
    },
    paint: {
      'circle-color': 'rgba(255,255,255,0.18)',
      'circle-opacity': 1,
      'circle-radius': ['+', ['/', ['to-number', ['get', 'size'], 28], 2], 4],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-opacity': 0.96,
      'circle-stroke-width': 2.4
    }
  });
  map.addLayer({
    id: pointIconLayerId,
    type: 'symbol',
    source: pointSourceId,
    filter: ['!=', ['get', 'markerIcon'], ''],
    layout: {
      'icon-allow-overlap': true,
      'icon-image': ['get', 'markerIcon'],
      'icon-ignore-placement': true,
      'icon-size': ['/', ['to-number', ['get', 'size'], 28], 44],
      'symbol-sort-key': ['to-number', ['get', 'sortKey'], 0]
    },
    paint: {
      'icon-opacity': ['case', ['boolean', ['get', 'isZero'], false], 0.72, 1]
    }
  });
  map.addLayer({
    id: pointLabelLayerId,
    type: 'symbol',
    source: pointSourceId,
    filter: ['!=', ['get', 'markerText'], ''],
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
}
