/**
 * 文件说明: 使用 MapLibre 渲染世界地图，并按旅行匹配或单日图层展示城市点位。
 * 对应文档: docs/product-design.md
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { CityDailyWeather, CityTravelScore, MapLayer, RegionWeatherSummary, ViewMode } from 'weather-core/types';
import { type DisplayLocale, formatCityName } from '@/domain/format';
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
  showChinaProvinceLayer: boolean;
  focusChinaProvinceLayer: boolean;
  selectedCityId: string | null;
  onSelectCity: (cityId: string) => void;
};

type LegendScale = {
  gradient: string;
  labels: [string, string, string];
};

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

function legendDescription(mode: ViewMode, layer: MapLayer, showChinaProvinceLayer: boolean, locale: DisplayLocale): string {
  if (locale === 'en') {
    if (showChinaProvinceLayer) {
      if (layer === 'elevation') return 'Province areas are colored by sampled elevation; city markers keep temperature context.';
      if (layer === 'humidity') return 'Color shows mean relative humidity; green is the comfortable range.';
      if (mode === 'travel' && layer === 'comfort') return 'Color follows the current min/max matching-day distribution.';
      return 'Province areas show the selected layer; city markers remain sample points.';
    }

    if (mode === 'travel') return 'Numbers show matching days; color follows the current result distribution.';
    if (layer === 'comfort') return 'Comfort combines temperature, weather, humidity, rainfall, and wind.';
    return 'Marker color follows the selected layer.';
  }

  if (showChinaProvinceLayer) {
    if (layer === 'elevation') return '省级区域按海拔样本分层着色，城市点位保留温度';
    if (layer === 'humidity') return '颜色显示日均相对湿度，绿色约为舒适湿度';
    if (mode === 'travel' && layer === 'comfort') return '颜色按当前结果的最小/最大匹配天数分布';
    return '省级区域显示当前图层主指标，城市点位是样本';
  }

  if (mode === 'travel') return '数字表示未来匹配天数，颜色按当前结果相对分布';
  if (layer === 'comfort') return '旅行适合度综合气温、天气、湿度、降水和风速估算';
  return '点位颜色随当前图层变化';
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

export function WorldWeatherMap({
  mode,
  locale,
  layer,
  travelScores,
  dailyWeather,
  regionSummaries,
  showChinaProvinceLayer,
  focusChinaProvinceLayer,
  selectedCityId,
  onSelectCity
}: WorldWeatherMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [regionsReady, setRegionsReady] = useState(false);
  const scale = legendScale(mode, layer, locale);

  const points = useMemo<MapPoint[]>(() => {
    if (mode === 'travel') {
      const matchDays = travelScores.map((score) => score.matchDays);
      const minMatchDays = Math.min(...matchDays, 0);
      const maxMatchDays = Math.max(...matchDays, 0);

      return travelScores.map((score) => {
        const normalized = normalizeRangeValue(score.matchDays, minMatchDays, maxMatchDays);
        return {
          cityId: score.city.id,
          label: `${formatCityName(score.city, locale)}, ${score.city.country}`,
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
        label: `${formatCityName(item.city, locale)}, ${item.city.country}`,
        longitude: item.city.longitude,
        latitude: item.city.latitude,
        markerText:
          layer === 'weather'
            ? weatherTypeEmoji[item.forecast.weatherType]
            : layer === 'humidity'
              ? `${Math.round(item.forecast.humidityMeanPercent)}%`
              : `${Math.round(item.forecast.temperatureMeanC)}°`,
        color: valueColor,
        opacity: showChinaProvinceLayer ? 0.72 : 0.86,
        size: showChinaProvinceLayer ? 24 : layer === 'comfort' ? 24 + item.comfortScore * 22 : 34,
        sortValue: item.comfortScore,
        selected: selectedCityId === item.city.id
      };
    }).sort((a, b) => {
      if (a.selected !== b.selected) return a.selected ? 1 : -1;
      return a.sortValue - b.sortValue;
    });
  }, [dailyWeather, layer, locale, mode, selectedCityId, showChinaProvinceLayer, travelScores]);

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
      const response = await fetch('/data/geo/china-provinces.geojson');
      const geojson = await response.json();

      if (!mapRef.current?.getSource('china-provinces')) {
        mapRef.current?.addSource('china-provinces', {
          type: 'geojson',
          data: geojson
        });
      }

      mapRef.current?.addLayer({
        id: 'china-province-fill',
        type: 'fill',
        source: 'china-provinces',
        paint: {
          'fill-color': ['coalesce', ['get', 'fillColor'], 'rgba(255,255,255,0)'],
          'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0],
          'fill-outline-color': 'rgba(24,32,31,0.28)'
        }
      });

      mapRef.current?.addLayer({
        id: 'china-province-line',
        type: 'line',
        source: 'china-provinces',
        paint: {
          'line-color': 'rgba(24,32,31,0.35)',
          'line-width': ['case', ['boolean', ['get', 'isActiveRegion'], false], 1.6, 0.7],
          'line-opacity': ['case', ['boolean', ['get', 'isVisibleRegion'], false], 0.9, 0]
        }
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
    const source = map?.getSource('china-provinces');
    if (!map || !source || !('setData' in source) || !regionsReady) return;

    fetch('/data/geo/china-provinces.geojson')
      .then((response) => response.json())
      .then((geojson) => {
        const summariesByAdmin = new globalThis.Map(regionSummaries.map((summary) => [summary.admin1GroupCode, summary]));
        const regionMatchDays = regionSummaries.map((summary) => summary.matchDays);
        const minRegionMatchDays = Math.min(...regionMatchDays, 0);
        const maxRegionMatchDays = Math.max(...regionMatchDays, 0);
        const features = geojson.features.map((feature: { properties: Record<string, unknown> }) => {
          const adcode = String(feature.properties.adcode ?? '');
          const summary = summariesByAdmin.get(adcode);
          const isVisibleRegion = showChinaProvinceLayer && Boolean(summary);
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
              isActiveRegion: isVisibleRegion,
              fillColor,
              fillOpacity: isVisibleRegion ? (layer === 'elevation' ? 0.34 : 0.62) : 0,
              label: summary ? `${summary.name.replace(/省|市|自治区|特别行政区/g, '')} ${layerLabel(summary, layer, locale)}` : ''
            }
          };
        });

        (source as GeoJSONSource).setData({ ...geojson, features });
        if (map.getLayer('china-province-fill')) {
          map.setLayoutProperty('china-province-fill', 'visibility', showChinaProvinceLayer ? 'visible' : 'none');
        }
        if (map.getLayer('china-province-line')) {
          map.setLayoutProperty('china-province-line', 'visibility', showChinaProvinceLayer ? 'visible' : 'none');
        }

        if (focusChinaProvinceLayer) {
          map.easeTo({ center: [104.5, 35.7], zoom: 3.05, duration: 420 });
        }
      });
  }, [focusChinaProvinceLayer, layer, locale, mode, regionSummaries, regionsReady, showChinaProvinceLayer]);

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
          <span>{legendDescription(mode, layer, showChinaProvinceLayer, locale)}</span>
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
          {showChinaProvinceLayer
            ? `${regionSummaries.length} ${locale === 'zh' ? '个区域' : 'regions'} · ${points.length} ${
                locale === 'zh' ? '个城市' : 'cities'
              }`
            : `${points.length} ${locale === 'zh' ? '个城市' : 'cities'}`}
        </span>
      </div>
    </section>
  );
}
