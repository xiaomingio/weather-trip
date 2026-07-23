/**
 * 文件说明: 使用 MapLibre 渲染世界天气地图，组合点位、地区图层、图例和交互状态。
 * 对应文档: docs/specs/10-product-design.md
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { GeoJSONSource, type FilterSpecification, type Map as MapLibreMap, type MapLayerMouseEvent } from 'maplibre-gl';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { RegionKey } from 'weather-core/types';
import type { MapRegionLayer } from '@/domain/regions';
import {
  buildBoundsFromPoints,
  buildGeojsonBounds,
  buildSelectedRegionOutlineGeojson,
  decorateRegionGeojson,
  normalizeRegionGeojson,
  regionFillLayerId,
  regionGeojsonAsset,
  regionHoverLayerId,
  regionHoverLineLayerId,
  regionHoverShadowLayerId,
  regionLineLayerId,
  regionNoMetricPatternLayerId,
  selectedRegionLineLayerId,
  selectedRegionSourceId,
  regionSourceId
} from './mapGeojson';
import { legendDescription, legendScale } from './mapLegend';
import { buildMapPoints, buildPointGeojson, markerCellSize, markerRank } from './mapMarkers';
import {
  addPointLayers,
  createWorldMap,
  defaultWorldCenter,
  defaultWorldZoom,
  ensureWeatherPointImages,
  pointCircleLayerId,
  pointIconLayerId,
  pointLabelLayerId,
  pointSourceId,
  setupCollapsedMapAttribution
} from './mapSetup';
import type { BoundsPoint, MapGeoJson, MapPoint, MarkerViewport, RegionGeojsonAsset, WorldWeatherMapProps } from './types';

const noMetricPatternImageId = 'weather-no-metric-hatch';
const mapRegionLayers = ['world', 'country'] as const satisfies readonly MapRegionLayer[];
const pointInteractionLayerIds = [pointCircleLayerId, pointIconLayerId, pointLabelLayerId] as const;
const emptySelectedRegionGeojson: MapGeoJson = { type: 'FeatureCollection', features: [] };

function createNoMetricPatternImage(): { image: ImageData; pixelRatio: number } | null {
  const pixelRatio = 2;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = 'rgba(24, 32, 31, 0.42)';
  context.lineWidth = 1;
  context.lineCap = 'butt';
  context.beginPath();
  context.moveTo(-1, 33);
  context.lineTo(33, -1);
  context.stroke();

  return { image: context.getImageData(0, 0, canvas.width, canvas.height), pixelRatio };
}

function ensureNoMetricPatternImage(map: MapLibreMap): void {
  if (map.hasImage(noMetricPatternImageId)) return;
  const pattern = createNoMetricPatternImage();
  if (pattern) map.addImage(noMetricPatternImageId, pattern.image, { pixelRatio: pattern.pixelRatio });
}

function setRegionHoverFilter(map: MapLibreMap, targetLayer: MapRegionLayer | null, regionKey: string): void {
  mapRegionLayers.forEach((mapRegionLayer) => {
    const filter: FilterSpecification = ['==', ['get', 'regionKey'], mapRegionLayer === targetLayer ? regionKey : ''];
    [regionHoverLayerId(mapRegionLayer), regionHoverShadowLayerId(mapRegionLayer), regionHoverLineLayerId(mapRegionLayer)].forEach((layerId) => {
      if (map.getLayer(layerId)) map.setFilter(layerId, filter);
    });
  });
}

export function WorldWeatherMap({
  tool,
  locale,
  layer,
  resultItems,
  regionSummaries,
  dataRegion,
  temperatureUnit,
  activeRegion,
  selectedCityId,
  onSelectCity,
  statusLabel,
  statusKind = 'empty',
  isRefreshing = false,
  refreshLabel
}: WorldWeatherMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const regionPopupRef = useRef<maplibregl.Popup | null>(null);
  const regionInteractionLayersRef = useRef<Set<string>>(new Set());
  const onSelectCityRef = useRef(onSelectCity);
  const cameraRegionRef = useRef<RegionKey | null>(null);
  const loadingRegionLayersRef = useRef<Partial<Record<string, Promise<void>>>>({});
  const regionGeojsonRef = useRef<Record<MapRegionLayer, { assetKey: string; geojson: MapGeoJson } | null>>({
    world: null,
    country: null
  });
  const regionOutlineGeojsonRef = useRef<MapGeoJson | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [regionDataVersion, setRegionDataVersion] = useState(0);
  const [regionOutlineDataVersion, setRegionOutlineDataVersion] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [markerViewport, setMarkerViewport] = useState<MarkerViewport>({ zoom: defaultWorldZoom, width: 0, height: 0 });
  const scale = legendScale(tool, layer, locale);
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

  const points = useMemo<MapPoint[]>(
    () =>
      buildMapPoints({
        tool,
        resultItems,
        layer,
        locale,
        temperatureUnit,
        selectedCityId,
        hasRegionLayer
      }),
    [hasRegionLayer, layer, locale, resultItems, selectedCityId, temperatureUnit, tool]
  );

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

  const handleRegionMove = useCallback((event: MapLayerMouseEvent) => {
    const map = mapRef.current;
    const popup = regionPopupRef.current;
    if (!map || !popup || event.lngLat === undefined) return;
    const feature = event.features?.find((item) => typeof item.properties?.regionKey === 'string' && item.properties.regionKey);
    const label = typeof feature?.properties?.label === 'string' ? feature.properties.label : '';
    const regionKey = typeof feature?.properties?.regionKey === 'string' ? feature.properties.regionKey : '';
    const targetLayer: MapRegionLayer = feature?.layer.id === regionFillLayerId('country') ? 'country' : 'world';
    if (typeof label !== 'string' || !label) {
      popup.remove();
      setRegionHoverFilter(map, null, '');
      return;
    }
    map.getCanvas().style.cursor = 'default';
    setRegionHoverFilter(map, targetLayer, regionKey);
    popup.setLngLat(event.lngLat).setText(label).addTo(map);
  }, []);

  const handleRegionLeave = useCallback(() => {
    regionPopupRef.current?.remove();
    const map = mapRef.current;
    if (map) setRegionHoverFilter(map, null, '');
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = '';
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
    const rankedPoints = [...points].sort((left, right) => markerRank(right) - markerRank(left));

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
  const resultCities = useMemo(() => resultItems.map((item) => item.city), [resultItems]);
  const regionAsset = useMemo(
    () => regionGeojsonAsset(activeRegion, regionSummaries, resultCities),
    [activeRegion, regionSummaries, resultCities]
  );
  const regionLayer = regionAsset.layer;

  const ensureRegionLayer = useCallback(
    async (asset: RegionGeojsonAsset) => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      const targetLayer = asset.layer;
      const loadingKey = `${targetLayer}:${asset.key}`;
      if (regionGeojsonRef.current[targetLayer]?.assetKey === asset.key) return;
      if (loadingRegionLayersRef.current[loadingKey]) {
        await loadingRegionLayersRef.current[loadingKey];
        return;
      }

      loadingRegionLayersRef.current[loadingKey] = fetch(asset.url)
        .then((response) => response.json() as Promise<MapGeoJson>)
        .then((rawGeojson) => {
          const currentMap = mapRef.current;
          if (!currentMap) return;
          const geojson = normalizeRegionGeojson(rawGeojson);
          regionGeojsonRef.current[targetLayer] = { assetKey: asset.key, geojson };
          const sourceId = regionSourceId(targetLayer);
          if (!currentMap.getSource(sourceId)) {
            currentMap.addSource(sourceId, {
              type: 'geojson',
              data: geojson
            });
          } else {
            const source = currentMap.getSource(sourceId);
            if (source && 'setData' in source) (source as GeoJSONSource).setData(geojson);
          }

          const beforePointLayer = currentMap.getLayer(pointCircleLayerId) ? pointCircleLayerId : undefined;
          ensureNoMetricPatternImage(currentMap);
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
                  'fill-outline-color': targetLayer === 'world' ? 'rgba(63,78,72,0.1)' : 'rgba(63,78,72,0.14)'
                }
              },
              beforePointLayer
            );
          }
          const fillLayerId = regionFillLayerId(targetLayer);
          if (!regionInteractionLayersRef.current.has(fillLayerId)) {
            currentMap.on('mousemove', fillLayerId, handleRegionMove);
            currentMap.on('mouseleave', fillLayerId, handleRegionLeave);
            regionInteractionLayersRef.current.add(fillLayerId);
          }

          if (!currentMap.getLayer(regionNoMetricPatternLayerId(targetLayer))) {
            currentMap.addLayer(
              {
                id: regionNoMetricPatternLayerId(targetLayer),
                type: 'fill',
                source: sourceId,
                layout: {
                  visibility: 'none'
                },
                paint: {
                  'fill-pattern': noMetricPatternImageId,
                  'fill-opacity': [
                    'case',
                    ['all', ['boolean', ['get', 'isVisibleRegion'], false], ['boolean', ['get', 'isNoMetricRegion'], false]],
                    targetLayer === 'world' ? 0.58 : 0.66,
                    0
                  ]
                }
              },
              beforePointLayer
            );
          }

          if (!currentMap.getLayer(regionHoverLayerId(targetLayer))) {
            currentMap.addLayer(
              {
                id: regionHoverLayerId(targetLayer),
                type: 'fill',
                source: sourceId,
                layout: {
                  visibility: 'none'
                },
                paint: {
                  'fill-color': [
                    'case',
                    ['!', ['boolean', ['get', 'hasMetricData'], false]],
                    'rgba(35,42,38,0.12)',
                    'rgba(255,255,255,0)'
                  ],
                  'fill-opacity': [
                    'case',
                    ['!', ['boolean', ['get', 'hasMetricData'], false]],
                    targetLayer === 'world' ? 0.26 : 0.34,
                    0
                  ],
                  'fill-outline-color': 'rgba(63,78,72,0.2)'
                },
                filter: ['==', ['get', 'regionKey'], '']
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
                  'line-color': targetLayer === 'world' ? 'rgba(63,78,72,0.14)' : 'rgba(63,78,72,0.2)',
                  'line-width': [
                    'case',
                    ['boolean', ['get', 'isActiveRegion'], false],
                    targetLayer === 'world' ? 0.9 : 1.35,
                    ['!', ['boolean', ['get', 'hasMetricData'], false]],
                    targetLayer === 'world' ? 0.35 : 0.55,
                    ['boolean', ['get', 'isVisibleRegion'], false],
                    targetLayer === 'world' ? 0.45 : 0.7,
                    0.22
                  ],
                  'line-opacity': ['case', ['boolean', ['get', 'isVisibleRegion'], false], targetLayer === 'world' ? 0.42 : 0.58, 0]
                }
              },
              beforePointLayer
            );
          }

          if (!currentMap.getLayer(regionHoverShadowLayerId(targetLayer))) {
            currentMap.addLayer(
              {
                id: regionHoverShadowLayerId(targetLayer),
                type: 'line',
                source: sourceId,
                layout: {
                  visibility: 'none',
                  'line-join': 'round',
                  'line-cap': 'round'
                },
                paint: {
                  'line-color': 'rgba(68,88,80,0.22)',
                  'line-width': targetLayer === 'world' ? 1.4 : 2,
                  'line-blur': targetLayer === 'world' ? 1.2 : 1.5,
                  'line-opacity': 0.56
                },
                filter: ['==', ['get', 'regionKey'], '']
              },
              beforePointLayer
            );
          }

          if (!currentMap.getLayer(regionHoverLineLayerId(targetLayer))) {
            currentMap.addLayer(
              {
                id: regionHoverLineLayerId(targetLayer),
                type: 'line',
                source: sourceId,
                layout: {
                  visibility: 'none',
                  'line-join': 'round',
                  'line-cap': 'round'
                },
                paint: {
                  'line-color': 'rgba(50,70,62,0.52)',
                  'line-width': targetLayer === 'world' ? 0.65 : 0.9,
                  'line-opacity': 0.72
                },
                filter: ['==', ['get', 'regionKey'], '']
              },
              beforePointLayer
            );
          }

          setRegionDataVersion((current) => current + 1);
        })
        .finally(() => {
          delete loadingRegionLayersRef.current[loadingKey];
        });

      await loadingRegionLayersRef.current[loadingKey];
    },
    [handleRegionLeave, handleRegionMove, mapReady]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = createWorldMap(containerRef.current);
    regionPopupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: 'region-hover-popup'
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

      void ensureWeatherPointImages(map).finally(() => {
        if (mapRef.current !== map) return;

        addPointLayers(map);
        map.addSource(selectedRegionSourceId, {
          type: 'geojson',
          data: emptySelectedRegionGeojson
        });
        map.addLayer(
          {
            id: selectedRegionLineLayerId,
            type: 'line',
            source: selectedRegionSourceId,
            layout: {
              'line-join': 'round',
              'line-cap': 'butt'
            },
            paint: {
              'line-color': 'rgba(31, 41, 37, 0.68)',
              'line-width': 2,
              'line-opacity': 0.84,
              'line-dasharray': [4, 3]
            }
          },
          pointCircleLayerId
        );
        pointInteractionLayerIds.forEach((layerId) => {
          map.on('click', layerId, handlePointClick);
          map.on('mouseenter', layerId, handlePointEnter);
          map.on('mouseleave', layerId, handlePointLeave);
        });

        setMapReady(true);
      });
    });

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
      pointInteractionLayerIds.forEach((layerId) => {
        mapRef.current?.off('click', layerId, handlePointClick);
        mapRef.current?.off('mouseenter', layerId, handlePointEnter);
        mapRef.current?.off('mouseleave', layerId, handlePointLeave);
      });
      for (const fillLayerId of regionInteractionLayersRef.current) {
        mapRef.current?.off('mousemove', fillLayerId, handleRegionMove);
        mapRef.current?.off('mouseleave', fillLayerId, handleRegionLeave);
      }
      regionInteractionLayersRef.current.clear();
      regionPopupRef.current?.remove();
      regionPopupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    void ensureRegionLayer(regionAsset);
  }, [ensureRegionLayer, mapReady, regionAsset]);

  useEffect(() => {
    if (!mapReady || regionOutlineGeojsonRef.current) return;
    let cancelled = false;
    fetch('/data/geo/region-outlines.geojson')
      .then((response) => response.json() as Promise<MapGeoJson>)
      .then((rawGeojson) => {
        if (cancelled) return;
        regionOutlineGeojsonRef.current = normalizeRegionGeojson(rawGeojson);
        setRegionOutlineDataVersion((current) => current + 1);
      })
      .catch(() => {
        if (!cancelled) regionOutlineGeojsonRef.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    mapRegionLayers.forEach((mapRegionLayer) => {
      const visibility = mapRegionLayer === regionLayer ? 'visible' : 'none';
      if (map.getLayer(regionFillLayerId(mapRegionLayer))) {
        map.setLayoutProperty(regionFillLayerId(mapRegionLayer), 'visibility', visibility);
      }
      if (map.getLayer(regionNoMetricPatternLayerId(mapRegionLayer))) {
        map.setLayoutProperty(regionNoMetricPatternLayerId(mapRegionLayer), 'visibility', visibility);
      }
      if (map.getLayer(regionHoverLayerId(mapRegionLayer))) {
        map.setLayoutProperty(regionHoverLayerId(mapRegionLayer), 'visibility', visibility);
        if (visibility === 'none') map.setFilter(regionHoverLayerId(mapRegionLayer), ['==', ['get', 'regionKey'], '']);
      }
      if (map.getLayer(regionHoverShadowLayerId(mapRegionLayer))) {
        map.setLayoutProperty(regionHoverShadowLayerId(mapRegionLayer), 'visibility', visibility);
        if (visibility === 'none') map.setFilter(regionHoverShadowLayerId(mapRegionLayer), ['==', ['get', 'regionKey'], '']);
      }
      if (map.getLayer(regionHoverLineLayerId(mapRegionLayer))) {
        map.setLayoutProperty(regionHoverLineLayerId(mapRegionLayer), 'visibility', visibility);
        if (visibility === 'none') map.setFilter(regionHoverLineLayerId(mapRegionLayer), ['==', ['get', 'regionKey'], '']);
      }
      if (map.getLayer(regionLineLayerId(mapRegionLayer))) {
        map.setLayoutProperty(regionLineLayerId(mapRegionLayer), 'visibility', visibility);
      }
    });

    const source = map.getSource(regionSourceId(regionLayer));
    const geojson = regionGeojsonRef.current[regionLayer]?.geojson;
    const selectedRegionSource = map.getSource(selectedRegionSourceId);
    if (!source || !('setData' in source) || !geojson) {
      if (selectedRegionSource && 'setData' in selectedRegionSource) {
        (selectedRegionSource as GeoJSONSource).setData(emptySelectedRegionGeojson);
      }
      return;
    }

    (source as GeoJSONSource).setData(
      decorateRegionGeojson(geojson, regionSummaries, regionLayer, regionLayer, activeRegion, tool, layer, locale, temperatureUnit)
    );

    if (selectedRegionSource && 'setData' in selectedRegionSource) {
      (selectedRegionSource as GeoJSONSource).setData(
        buildSelectedRegionOutlineGeojson(geojson, regionOutlineGeojsonRef.current, activeRegion)
      );
    }
  }, [activeRegion, layer, locale, regionDataVersion, regionLayer, regionSummaries, mapReady, regionOutlineDataVersion, temperatureUnit, tool]);

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

    if (activeRegion === 'world') {
      if (cameraRegionRef.current && cameraRegionRef.current !== activeRegion) {
        map.jumpTo({
          center: defaultWorldCenter,
          zoom: defaultWorldZoom
        });
        updateMarkerViewport();
      }
      cameraRegionRef.current = activeRegion;
      return;
    }

    if (dataRegion !== activeRegion) return;

    const selectedRegionGeojson = buildSelectedRegionOutlineGeojson(
      regionGeojsonRef.current[regionLayer]?.geojson ?? null,
      regionOutlineGeojsonRef.current,
      activeRegion
    );
    const bounds = buildGeojsonBounds(selectedRegionGeojson) ?? pointBounds;
    if (bounds) {
      map.fitBounds(bounds, {
        padding: 84,
        maxZoom: regionLayer === 'world' ? 4.8 : 5.6,
        duration: 0
      });
      cameraRegionRef.current = activeRegion;
    }
  }, [activeRegion, dataRegion, pointBounds, regionDataVersion, regionLayer, regionOutlineDataVersion, regionSummaries, mapReady, updateMarkerViewport]);

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
    <section
      className={`map-shell${isFullscreen ? ' is-fullscreen' : ''}${statusLabel ? ' has-status' : ''}`}
      aria-label={locale === 'zh' ? '全球天气地图' : 'Global weather map'}
    >
      <button
        className="map-fullscreen-button"
        type="button"
        onClick={() => setIsFullscreen((current) => !current)}
        aria-label={fullscreenLabel}
        aria-pressed={isFullscreen}
        title={fullscreenLabel}
      >
        {isFullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
      </button>
      <div ref={containerRef} className="weather-map" />
      {statusLabel ? (
        <div className={`map-panel-state${statusKind === 'loading' ? ' panel-loading-state' : ''}`} role="status">
          {statusLabel}
        </div>
      ) : null}
      {isRefreshing ? (
        <div className="refresh-overlay" role="status" aria-live="polite" aria-label={refreshLabel}>
          <span className="refresh-spinner" aria-hidden="true" />
          <span>{refreshLabel}</span>
        </div>
      ) : null}
      <div className="map-legend">
        <div className="map-legend-main">
          <span>{legendDescription(tool, layer, regionLayer, locale)}</span>
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
