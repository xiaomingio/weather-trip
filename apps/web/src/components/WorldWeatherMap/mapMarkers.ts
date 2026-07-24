/**
 * 文件说明: 构建 WorldWeatherMap 城市点位、点位指标和 MapLibre 点位 GeoJSON。
 * 对应文档: docs/product-design.md
 */

import type { MapLayer, WeatherToolId } from 'weather-core/types';
import { weatherTypeMapIconIds } from '@/components/weather-icons';
import { type DisplayLocale, type TemperatureUnit, formatCityName, formatCityRegion } from '@/domain/format';
import {
  type DashboardCityFinderResultItem,
  type DashboardResultItem,
  type DashboardWeatherMapResultItem,
  isDashboardCityFinderItem
} from '@/domain/weather-dashboard-shared';
import { getWeatherTypeLabel } from '@/domain/weather';
import {
  comfortColor,
  elevationColor,
  humidityColor,
  normalizeRangeValue,
  precipitationColor,
  relativeMatchColor,
  temperatureColor,
  temperatureMarkerText,
  weatherColor,
  windColor
} from './mapColors';
import type { MapPoint, MapPointGeoJson, MarkerMetric } from './types';

type BuildMapPointsParams = {
  tool: WeatherToolId;
  resultItems: DashboardResultItem[];
  layer: MapLayer;
  locale: DisplayLocale;
  temperatureUnit: TemperatureUnit;
  selectedCityId: string | null;
  hasRegionLayer: boolean;
};

export function markerCellSize(zoom: number, pointCount: number): number {
  if (pointCount < 60 || zoom >= 6) return 0;
  if (zoom < 1.8) return 64;
  if (zoom < 2.8) return 56;
  if (zoom < 3.8) return 48;
  if (pointCount >= 120 && zoom < 4.8) return 40;
  if (pointCount >= 240 && zoom < 5.6) return 34;
  return 0;
}

export function markerRank(point: MapPoint): number {
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

function windMarkerText(value: number): string {
  return String(Math.round(value));
}

function percentageMarkerText(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function markerTooltip(label: string, metric: MarkerMetric): string {
  return metric.tooltipValue ? `${label} · ${metric.tooltipValue}` : label;
}

function cityFinderMarkerMetric(
  score: DashboardCityFinderResultItem,
  layer: MapLayer,
  matchColor: string,
  locale: DisplayLocale,
  temperatureUnit: TemperatureUnit
): MarkerMetric {
  if (layer === 'temperature') {
    const markerText = temperatureMarkerText(score.averageTemperatureC, temperatureUnit);
    return {
      markerText,
      markerIcon: '',
      tooltipValue: markerText,
      color: temperatureColor(score.averageTemperatureC),
      sortValue: score.averageTemperatureC
    };
  }
  if (layer === 'weather') {
    return {
      markerText: '',
      markerIcon: weatherTypeMapIconIds[score.weatherType],
      tooltipValue: getWeatherTypeLabel(score.weatherType, locale),
      color: weatherColor(score.weatherType),
      sortValue: score.score
    };
  }
  if (layer === 'precipitation') {
    const markerText = precipitationMarkerText(score.averagePrecipitationMm);
    return {
      markerText,
      markerIcon: '',
      tooltipValue: `${markerText} mm`,
      color: precipitationColor(score.averagePrecipitationMm),
      sortValue: score.averagePrecipitationMm
    };
  }
  if (layer === 'wind') {
    const markerText = windMarkerText(score.averageWindSpeedKmh);
    return {
      markerText,
      markerIcon: '',
      tooltipValue: `${markerText} km/h`,
      color: windColor(score.averageWindSpeedKmh),
      sortValue: score.averageWindSpeedKmh
    };
  }
  if (layer === 'humidity') {
    const markerText = `${Math.round(score.averageHumidityPercent)}%`;
    return {
      markerText,
      markerIcon: '',
      tooltipValue: markerText,
      color: humidityColor(score.averageHumidityPercent),
      sortValue: score.averageHumidityPercent
    };
  }
  if (layer === 'elevation') {
    const markerText = elevationMarkerText(score.city.elevationMeters);
    return {
      markerText,
      markerIcon: '',
      tooltipValue: `${markerText} m`,
      color: elevationColor(score.city.elevationMeters),
      sortValue: score.city.elevationMeters
    };
  }

  const markerText = percentageMarkerText(score.score);
  return {
    markerText,
    markerIcon: '',
    tooltipValue: markerText,
    color: matchColor,
    sortValue: score.matchDays
  };
}

function weatherMapMarkerMetric(item: DashboardWeatherMapResultItem, layer: MapLayer, locale: DisplayLocale, temperatureUnit: TemperatureUnit): MarkerMetric {
  if (layer === 'temperature') {
    const markerText = temperatureMarkerText(item.forecast.temperatureMeanC, temperatureUnit);
    return {
      markerText,
      markerIcon: '',
      tooltipValue: markerText,
      color: temperatureColor(item.forecast.temperatureMeanC),
      sortValue: item.forecast.temperatureMeanC
    };
  }
  if (layer === 'weather') {
    return {
      markerText: '',
      markerIcon: weatherTypeMapIconIds[item.forecast.weatherType],
      tooltipValue: getWeatherTypeLabel(item.forecast.weatherType, locale),
      color: weatherColor(item.forecast.weatherType),
      sortValue: item.comfortScore
    };
  }
  if (layer === 'precipitation') {
    const markerText = precipitationMarkerText(item.forecast.precipitationSumMm);
    return {
      markerText,
      markerIcon: '',
      tooltipValue: `${markerText} mm`,
      color: precipitationColor(item.forecast.precipitationSumMm),
      sortValue: item.forecast.precipitationSumMm
    };
  }
  if (layer === 'wind') {
    const windSpeed = item.forecast.windSpeedMaxKmh ?? 0;
    const markerText = windMarkerText(windSpeed);
    return {
      markerText,
      markerIcon: '',
      tooltipValue: `${markerText} km/h`,
      color: windColor(windSpeed),
      sortValue: windSpeed
    };
  }
  if (layer === 'humidity') {
    const markerText = `${Math.round(item.forecast.humidityMeanPercent)}%`;
    return {
      markerText,
      markerIcon: '',
      tooltipValue: markerText,
      color: humidityColor(item.forecast.humidityMeanPercent),
      sortValue: item.forecast.humidityMeanPercent
    };
  }
  if (layer === 'elevation') {
    const markerText = elevationMarkerText(item.city.elevationMeters);
    return {
      markerText,
      markerIcon: '',
      tooltipValue: `${markerText} m`,
      color: elevationColor(item.city.elevationMeters),
      sortValue: item.city.elevationMeters
    };
  }

  const markerText = percentageMarkerText(item.comfortScore);
  return {
    markerText,
    markerIcon: '',
    tooltipValue: markerText,
    color: comfortColor(item.comfortScore),
    sortValue: item.comfortScore
  };
}

export function buildMapPoints({
  tool,
  resultItems,
  layer,
  locale,
  temperatureUnit,
  selectedCityId,
  hasRegionLayer
}: BuildMapPointsParams): MapPoint[] {
  if (tool === 'city-finder') {
    const cityFinderItems = resultItems.filter(isDashboardCityFinderItem);
    const matchDays = cityFinderItems.map((score) => score.matchDays);
    const minMatchDays = Math.min(...matchDays, 0);
    const maxMatchDays = Math.max(...matchDays, 0);

    return cityFinderItems.map((score) => {
      const normalized = normalizeRangeValue(score.matchDays, minMatchDays, maxMatchDays);
      const matchColor = relativeMatchColor(score.matchDays, minMatchDays, maxMatchDays);
      const metric = cityFinderMarkerMetric(score, layer, matchColor, locale, temperatureUnit);
      const label = `${formatCityName(score.city, locale)}, ${formatCityRegion(score.city, locale)}`;
      return {
        cityId: score.city.id,
        label,
        longitude: score.city.longitude,
        latitude: score.city.latitude,
        markerText: metric.markerText,
        markerIcon: metric.markerIcon,
        tooltip: markerTooltip(label, metric),
        color: metric.color,
        opacity: score.matchDays === 0 ? 0.22 : Math.max(0.48, Math.min(1, 0.5 + normalized * 0.5)),
        size: 34,
        sortValue: metric.sortValue,
        prominence: score.city.population ?? 0,
        selected: selectedCityId === score.city.id
      };
    }).sort((left, right) => {
      if (left.selected !== right.selected) return left.selected ? 1 : -1;
      return left.sortValue - right.sortValue;
    });
  }

  return resultItems.filter((item): item is DashboardWeatherMapResultItem => !isDashboardCityFinderItem(item)).map((item) => {
    const metric = weatherMapMarkerMetric(item, layer, locale, temperatureUnit);
    const label = `${formatCityName(item.city, locale)}, ${formatCityRegion(item.city, locale)}`;

    return {
      cityId: item.city.id,
      label,
      longitude: item.city.longitude,
      latitude: item.city.latitude,
      markerText: metric.markerText,
      markerIcon: metric.markerIcon,
      tooltip: markerTooltip(label, metric),
      color: metric.color,
      opacity: hasRegionLayer ? 0.72 : 0.86,
      size: layer === 'comfort' ? 34 : hasRegionLayer ? 28 : 34,
      sortValue: metric.sortValue,
      prominence: item.city.population ?? 0,
      selected: selectedCityId === item.city.id
    };
  }).sort((left, right) => {
    if (left.selected !== right.selected) return left.selected ? 1 : -1;
    return left.sortValue - right.sortValue;
  });
}

export function buildPointGeojson(points: MapPoint[]): MapPointGeoJson {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      properties: {
        cityId: point.cityId,
        label: point.label,
        markerText: point.markerText,
        markerIcon: point.markerIcon,
        tooltip: point.tooltip,
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
