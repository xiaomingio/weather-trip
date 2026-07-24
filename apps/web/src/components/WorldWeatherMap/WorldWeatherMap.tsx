/**
 * 文件说明: 使用 MapLibre 渲染世界天气地图，组合点位、地区图层、图例和交互状态。
 * 对应文档: docs/specs/10-product-design.md
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { GeoJSONSource, type FilterSpecification, type Map as MapLibreMap, type MapLayerMouseEvent } from 'maplibre-gl';
import { Info, Maximize2, Minimize2 } from 'lucide-react';
import type { RegionKey } from 'weather-core/types';
import { messages } from '@/i18n';
import { legendScale } from './mapLegend';
import { buildMapPoints, buildPointGeojson, markerCellSize, markerRank } from './mapMarkers';
import {
  buildBoundsFromPoints,
  regionFillLayerId,
  regionHoverLayerId,
  regionHoverLineLayerId,
  regionHoverShadowLayerId,
  regionLineLayerId,
  regionNoMetricPatternLayerId,
  type MapTileRegionLayer
} from './mapRegionGeometry';
import {
  addPointLayers,
  createWorldMap,
  defaultWorldCenter,
  defaultWorldZoom,
  ensureWeatherPointImages,
  pointCircleLayerId,
  pointHoverLayerId,
  pointIconLayerId,
  pointLabelLayerId,
  pointSourceId,
  setupCollapsedMapAttribution
} from './mapSetup';
import {
  addVectorRegionLayers,
  applyVectorRegionStyles,
  buildVectorRegionStyleEntries,
  removeVectorRegionLayers,
  vectorRegionTooltipLabel,
  vectorRegionAssetForZoom,
  type VectorRegionStyleEntry
} from './mapVectorTiles';
import type { BoundsPoint, MapPoint, MarkerViewport, WorldWeatherMapProps } from './types';

const noMetricPatternImageId = 'weather-no-metric-hatch';
const mapRegionLayers = ['country', 'admin1', 'admin2'] as const satisfies readonly MapTileRegionLayer[];
const pointBaseInteractionLayerIds = [pointCircleLayerId, pointIconLayerId, pointLabelLayerId] as const;
const pointInteractionLayerIds = [pointCircleLayerId, pointHoverLayerId, pointIconLayerId, pointLabelLayerId] as const;
const mapCameraStorageKey = 'weather-trip:world-weather-map-camera:v1';

type StoredMapCamera = {
  center: [number, number];
  zoom: number;
  fittedRegion: RegionKey | null;
};

function readStoredMapCamera(): StoredMapCamera | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(mapCameraStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredMapCamera>;
    if (
      !Array.isArray(parsed.center) ||
      parsed.center.length !== 2 ||
      !parsed.center.every((value) => Number.isFinite(value)) ||
      typeof parsed.zoom !== 'number' ||
      !Number.isFinite(parsed.zoom)
    ) {
      return null;
    }
    const zoom = parsed.zoom;
    return {
      center: [parsed.center[0], parsed.center[1]],
      zoom,
      fittedRegion: typeof parsed.fittedRegion === 'string' ? parsed.fittedRegion : null
    };
  } catch {
    return null;
  }
}

function writeStoredMapCamera(map: MapLibreMap, fittedRegion: RegionKey | null): void {
  if (typeof window === 'undefined') return;
  const center = map.getCenter();
  const camera: StoredMapCamera = {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    fittedRegion
  };
  try {
    window.sessionStorage.setItem(mapCameraStorageKey, JSON.stringify(camera));
  } catch {
    // sessionStorage may be unavailable in strict privacy modes; map behavior still works without persistence.
  }
}

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

function mapTileLayerFromFillLayerId(layerId: string | undefined): MapTileRegionLayer | null {
  return mapRegionLayers.find((mapRegionLayer) => regionFillLayerId(mapRegionLayer) === layerId) ?? null;
}

function setRegionHoverFilter(map: MapLibreMap, targetLayer: MapTileRegionLayer | null, regionKey: string): void {
  mapRegionLayers.forEach((mapRegionLayer) => {
    const filter: FilterSpecification = ['==', ['get', 'regionKey'], mapRegionLayer === targetLayer ? regionKey : ''];
    [regionHoverLayerId(mapRegionLayer), regionHoverShadowLayerId(mapRegionLayer), regionHoverLineLayerId(mapRegionLayer)].forEach((layerId) => {
      if (map.getLayer(layerId)) map.setFilter(layerId, filter);
    });
  });
}

function setPointHoverFilter(map: MapLibreMap, cityId: string): void {
  if (map.getLayer(pointHoverLayerId)) {
    map.setFilter(pointHoverLayerId, ['==', ['get', 'cityId'], cityId]);
  }
}

function parentAdmin1RegionKey(regionKey: string): string | null {
  const match = /^admin2:([A-Z]{2}\.[^.]+)\./.exec(regionKey);
  return match ? `admin1:${match[1]}` : null;
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
  const pointPopupRef = useRef<maplibregl.Popup | null>(null);
  const regionInteractionLayersRef = useRef<Set<string>>(new Set());
  const onSelectCityRef = useRef(onSelectCity);
  const cameraRegionRef = useRef<RegionKey | null>(null);
  const restoredCameraPendingRef = useRef(false);
  const vectorRegionStyleEntriesRef = useRef<Map<string, VectorRegionStyleEntry>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRegionColoringEnabled, setIsRegionColoringEnabled] = useState(true);
  const [markerViewport, setMarkerViewport] = useState<MarkerViewport>({ zoom: defaultWorldZoom, width: 0, height: 0 });
  const scale = legendScale(tool, layer, locale);
  const mapCopy = messages[locale].ui.worldWeatherMap;
  const hasRegionLayer = regionSummaries.length > 0;
  const regionColoringLabel = mapCopy.showRegions;
  const regionColoringHelp = mapCopy.regionColoringHelp;
  const fullscreenLabel = isFullscreen ? mapCopy.exitMapFullscreen : mapCopy.fullscreenMap;

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

  const handleCameraChanged = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    updateMarkerViewport();
    writeStoredMapCamera(map, cameraRegionRef.current);
  }, [updateMarkerViewport]);

  const handleRegionMove = useCallback((event: MapLayerMouseEvent) => {
    const map = mapRef.current;
    const popup = regionPopupRef.current;
    if (!map || !popup || event.lngLat === undefined) return;
    const visiblePointLayers = pointBaseInteractionLayerIds.filter((layerId) => map.getLayer(layerId));
    if (visiblePointLayers.length > 0 && map.queryRenderedFeatures(event.point, { layers: visiblePointLayers }).length > 0) {
      popup.remove();
      setRegionHoverFilter(map, null, '');
      return;
    }
    const feature = event.features?.find((item) => typeof item.properties?.regionKey === 'string' && item.properties.regionKey);
    const regionKey = typeof feature?.properties?.regionKey === 'string' ? feature.properties.regionKey : '';
    const weatherRegionKey = typeof feature?.properties?.weatherRegionKey === 'string' ? feature.properties.weatherRegionKey : '';
    const vectorEntry = vectorRegionStyleEntriesRef.current.get(weatherRegionKey || regionKey);
    const parentEntry = parentAdmin1RegionKey(regionKey);
    const parentAdmin1Name = parentEntry ? vectorRegionStyleEntriesRef.current.get(parentEntry)?.displayName : undefined;
    const label = feature?.properties
      ? vectorRegionTooltipLabel(feature.properties as Record<string, unknown>, vectorEntry, locale, mapCopy.noData, parentAdmin1Name)
      : '';
    const targetLayer = mapTileLayerFromFillLayerId(feature?.layer.id);
    if (typeof label !== 'string' || !label) {
      popup.remove();
      setRegionHoverFilter(map, null, '');
      return;
    }
    map.getCanvas().style.cursor = 'default';
    setRegionHoverFilter(map, targetLayer, regionKey);
    popup.setLngLat(event.lngLat).setText(label).addTo(map);
  }, [locale, mapCopy.noData]);

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
    const cityLabel = mapCopy.cityUnit;

    if (!hasRegionLayer) return `${cityCount} ${cityLabel}`;
    return `${regionSummaries.length} ${mapCopy.regionUnit} · ${cityCount} ${cityLabel}`;
  }, [hasRegionLayer, mapCopy.cityUnit, mapCopy.regionUnit, points.length, regionSummaries.length, visiblePoints.length]);

  const pointBounds = useMemo(() => {
    const boundsPoints = resultItems.map((item): BoundsPoint => [item.city.longitude, item.city.latitude]);

    return buildBoundsFromPoints(boundsPoints);
  }, [resultItems]);
  const vectorAsset = useMemo(() => vectorRegionAssetForZoom(markerViewport.zoom), [markerViewport.zoom]);
  const regionLayer = vectorAsset.layer;

  const ensureVectorRegionLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !isRegionColoringEnabled) return;

    const beforePointLayer = map.getLayer(pointCircleLayerId) ? pointCircleLayerId : undefined;
    ensureNoMetricPatternImage(map);
    const fillLayerId = regionFillLayerId(vectorAsset.layer);
    addVectorRegionLayers(map, vectorAsset, noMetricPatternImageId, beforePointLayer);

    if (!regionInteractionLayersRef.current.has(fillLayerId)) {
      map.on('mousemove', fillLayerId, handleRegionMove);
      map.on('mouseleave', fillLayerId, handleRegionLeave);
      regionInteractionLayersRef.current.add(fillLayerId);
    }

  }, [handleRegionLeave, handleRegionMove, isRegionColoringEnabled, mapReady, vectorAsset]);

  const removeVectorRegionLayer = useCallback(
    (mapRegionLayer: MapTileRegionLayer) => {
      const map = mapRef.current;
      if (!map) return;

      const fillLayerId = regionFillLayerId(mapRegionLayer);
      if (regionInteractionLayersRef.current.has(fillLayerId)) {
        map.off('mousemove', fillLayerId, handleRegionMove);
        map.off('mouseleave', fillLayerId, handleRegionLeave);
        regionInteractionLayersRef.current.delete(fillLayerId);
      }

      removeVectorRegionLayers(map, mapRegionLayer);
    },
    [handleRegionLeave, handleRegionMove]
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
    pointPopupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
      className: 'point-hover-popup'
    });

    const handlePointClick = (event: MapLayerMouseEvent) => {
      const cityId = event.features?.[0]?.properties?.cityId;
      if (typeof cityId === 'string') onSelectCityRef.current(cityId);
    };
    const handlePointMove = (event: MapLayerMouseEvent) => {
      const map = mapRef.current;
      const popup = pointPopupRef.current;
      if (!map || !popup || event.lngLat === undefined) return;
      const feature = event.features?.find((item) => typeof item.properties?.cityId === 'string' && item.properties.cityId);
      const cityId = typeof feature?.properties?.cityId === 'string' ? feature.properties.cityId : '';
      const tooltip = typeof feature?.properties?.tooltip === 'string' ? feature.properties.tooltip : '';
      if (!cityId || !tooltip) {
        popup.remove();
        setPointHoverFilter(map, '');
        return;
      }
      regionPopupRef.current?.remove();
      setRegionHoverFilter(map, null, '');
      map.getCanvas().style.cursor = 'pointer';
      setPointHoverFilter(map, cityId);
      popup.setLngLat(event.lngLat).setText(tooltip).addTo(map);
    };
    const handlePointEnter = (event: MapLayerMouseEvent) => {
      const canvas = mapRef.current?.getCanvas();
      if (canvas) canvas.style.cursor = 'pointer';
      handlePointMove(event);
    };
    const handlePointLeave = () => {
      pointPopupRef.current?.remove();
      const map = mapRef.current;
      if (map) setPointHoverFilter(map, '');
      const canvas = mapRef.current?.getCanvas();
      if (canvas) canvas.style.cursor = '';
    };

    mapRef.current.on('load', () => {
      const map = mapRef.current;
      if (!map) return;

      void ensureWeatherPointImages(map).finally(() => {
        if (mapRef.current !== map) return;

        addPointLayers(map);
        pointInteractionLayerIds.forEach((layerId) => {
          map.on('click', layerId, handlePointClick);
          map.on('mouseenter', layerId, handlePointEnter);
          map.on('mousemove', layerId, handlePointMove);
          map.on('mouseleave', layerId, handlePointLeave);
        });

        const storedCamera = readStoredMapCamera();
        if (storedCamera) {
          map.jumpTo({
            center: storedCamera.center,
            zoom: storedCamera.zoom
          });
          cameraRegionRef.current = storedCamera.fittedRegion;
          restoredCameraPendingRef.current = true;
        }

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
        mapRef.current?.off('mousemove', layerId, handlePointMove);
        mapRef.current?.off('mouseleave', layerId, handlePointLeave);
      });
      for (const fillLayerId of regionInteractionLayersRef.current) {
        mapRef.current?.off('mousemove', fillLayerId, handleRegionMove);
        mapRef.current?.off('mouseleave', fillLayerId, handleRegionLeave);
      }
      regionInteractionLayersRef.current.clear();
      regionPopupRef.current?.remove();
      regionPopupRef.current = null;
      pointPopupRef.current?.remove();
      pointPopupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    ensureVectorRegionLayer();
  }, [ensureVectorRegionLayer, mapReady]);

  useEffect(() => {
    if (!mapReady || isRegionColoringEnabled) return;

    regionPopupRef.current?.remove();
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = '';
    mapRegionLayers.forEach(removeVectorRegionLayer);
    vectorRegionStyleEntriesRef.current = new Map();
  }, [isRegionColoringEnabled, mapReady, removeVectorRegionLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !isRegionColoringEnabled) return;

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

    const entries = buildVectorRegionStyleEntries(regionSummaries, vectorAsset.styleLayer, tool, layer, locale, temperatureUnit);
    vectorRegionStyleEntriesRef.current = new Map(entries.map((entry) => [entry.regionKey, entry]));
    applyVectorRegionStyles(map, regionLayer, vectorAsset.styleLayer, entries);
  }, [isRegionColoringEnabled, layer, locale, regionLayer, regionSummaries, mapReady, temperatureUnit, tool, vectorAsset.styleLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    handleCameraChanged();
    map.on('moveend', handleCameraChanged);
    map.on('zoomend', handleCameraChanged);
    map.on('resize', handleCameraChanged);

    return () => {
      map.off('moveend', handleCameraChanged);
      map.off('zoomend', handleCameraChanged);
      map.off('resize', handleCameraChanged);
    };
  }, [handleCameraChanged, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (restoredCameraPendingRef.current) {
      restoredCameraPendingRef.current = false;
      cameraRegionRef.current = activeRegion;
      updateMarkerViewport();
      writeStoredMapCamera(map, cameraRegionRef.current);
      return;
    }

    if (activeRegion === 'world') {
      if (cameraRegionRef.current && cameraRegionRef.current !== activeRegion) {
        map.jumpTo({
          center: defaultWorldCenter,
          zoom: defaultWorldZoom
        });
      }
      cameraRegionRef.current = activeRegion;
      updateMarkerViewport();
      writeStoredMapCamera(map, cameraRegionRef.current);
      return;
    }

    if (cameraRegionRef.current === activeRegion) return;
    if (dataRegion !== activeRegion) return;

    if (pointBounds) {
      map.fitBounds(pointBounds, {
        padding: 84,
        maxZoom: vectorAsset.styleLayer === 'world' ? 4.8 : 5.6,
        duration: 0
      });
      cameraRegionRef.current = activeRegion;
      updateMarkerViewport();
      writeStoredMapCamera(map, cameraRegionRef.current);
    }
  }, [activeRegion, dataRegion, pointBounds, vectorAsset.styleLayer, mapReady, updateMarkerViewport]);

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
      aria-label={mapCopy.mapAriaLabel}
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
          <div className="region-color-control">
            <label className="region-color-checkbox">
              <input
                type="checkbox"
                checked={isRegionColoringEnabled}
                onChange={(event) => setIsRegionColoringEnabled(event.currentTarget.checked)}
              />
              <span>{regionColoringLabel}</span>
            </label>
            <span className="region-color-info" tabIndex={0} aria-label={regionColoringHelp}>
              <Info size={13} aria-hidden="true" />
              <span className="region-color-tooltip" aria-hidden="true">
                {regionColoringHelp}
              </span>
            </span>
          </div>
          <div className={`legend-scale${isRegionColoringEnabled ? '' : ' is-disabled'}`} aria-label={mapCopy.colorLegendAriaLabel}>
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
