/**
 * 文件说明: 使用 MapLibre 渲染世界天气地图，组合点位、地区图层、图例和交互状态。
 * 对应文档: docs/product-design.md
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GeoJSONSource, type Map as MapLibreMap, type MapLayerMouseEvent } from 'maplibre-gl';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { RegionKey } from 'weather-core/types';
import type { MapRegionLayer } from '@/domain/regions';
import {
  buildBoundsFromPoints,
  buildRegionBounds,
  decorateRegionGeojson,
  normalizeRegionGeojson,
  regionFillLayerId,
  regionGeojsonAsset,
  regionLineLayerId,
  regionSourceId
} from './mapGeojson';
import { legendDescription, legendScale } from './mapLegend';
import { buildMapPoints, buildPointGeojson, markerCellSize, markerRank } from './mapMarkers';
import {
  addPointLayers,
  createWorldMap,
  defaultWorldCenter,
  defaultWorldZoom,
  pointCircleLayerId,
  pointLabelLayerId,
  pointSourceId,
  setupCollapsedMapAttribution
} from './mapSetup';
import type { BoundsPoint, MapGeoJson, MapPoint, MarkerViewport, WorldWeatherMapProps } from './types';

export function WorldWeatherMap({
  tool,
  locale,
  layer,
  resultItems,
  regionSummaries,
  dataRegion,
  temperatureUnit,
  activeRegion,
  regionLayer,
  selectedCityId,
  onSelectCity,
  statusLabel,
  statusKind = 'empty',
  isRefreshing = false,
  refreshLabel
}: WorldWeatherMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectCityRef = useRef(onSelectCity);
  const cameraRegionRef = useRef<RegionKey | null>(null);
  const loadingRegionLayersRef = useRef<Partial<Record<string, Promise<void>>>>({});
  const regionGeojsonRef = useRef<Record<MapRegionLayer, { assetKey: string; geojson: MapGeoJson } | null>>({
    country: null,
    partition: null
  });
  const [mapReady, setMapReady] = useState(false);
  const [regionDataVersion, setRegionDataVersion] = useState(0);
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

  const ensureRegionLayer = useCallback(
    async (targetLayer: MapRegionLayer, targetRegion: RegionKey) => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      const asset = regionGeojsonAsset(targetLayer, targetRegion);
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
          const geojson = normalizeRegionGeojson(rawGeojson, targetLayer);
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
          delete loadingRegionLayersRef.current[loadingKey];
        });

      await loadingRegionLayersRef.current[loadingKey];
    },
    [mapReady]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = createWorldMap(containerRef.current);

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

      addPointLayers(map);
      map.on('click', pointCircleLayerId, handlePointClick);
      map.on('click', pointLabelLayerId, handlePointClick);
      map.on('mouseenter', pointCircleLayerId, handlePointEnter);
      map.on('mouseenter', pointLabelLayerId, handlePointEnter);
      map.on('mouseleave', pointCircleLayerId, handlePointLeave);
      map.on('mouseleave', pointLabelLayerId, handlePointLeave);

      setMapReady(true);
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
    void ensureRegionLayer(regionLayer, activeRegion);
  }, [activeRegion, ensureRegionLayer, mapReady, regionLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    (['country', 'partition'] as MapRegionLayer[]).forEach((mapRegionLayer) => {
      const visibility = mapRegionLayer === regionLayer ? 'visible' : 'none';
      if (map.getLayer(regionFillLayerId(mapRegionLayer))) {
        map.setLayoutProperty(regionFillLayerId(mapRegionLayer), 'visibility', visibility);
      }
      if (map.getLayer(regionLineLayerId(mapRegionLayer))) {
        map.setLayoutProperty(regionLineLayerId(mapRegionLayer), 'visibility', visibility);
      }
    });

    const source = map.getSource(regionSourceId(regionLayer));
    const geojson = regionGeojsonRef.current[regionLayer]?.geojson;
    if (!source || !('setData' in source) || !geojson) return;

    (source as GeoJSONSource).setData(
      decorateRegionGeojson(geojson, regionSummaries, regionLayer, regionLayer, activeRegion, tool, layer, locale, temperatureUnit)
    );
  }, [activeRegion, layer, locale, regionDataVersion, regionLayer, regionSummaries, mapReady, temperatureUnit, tool]);

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

    const bounds = buildRegionBounds(regionGeojsonRef.current[regionLayer]?.geojson ?? null, regionSummaries) ?? pointBounds;
    if (bounds) {
      map.fitBounds(bounds, {
        padding: 84,
        maxZoom: regionLayer === 'country' ? 4.8 : 5.6,
        duration: 0
      });
      cameraRegionRef.current = activeRegion;
    }
  }, [activeRegion, dataRegion, pointBounds, regionDataVersion, regionLayer, regionSummaries, mapReady, updateMarkerViewport]);

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
