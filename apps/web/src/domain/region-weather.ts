/**
 * 文件说明: 根据城市预报聚合中国省级区域天气，用于地图面状图层展示主天气。
 * 对应文档: docs/product-design.md
 */
import type { City, DailyForecast, RegionWeatherSummary, TravelFilter, WeatherType } from 'weather-core/types';
import { chinaAdmin1AdcodeByGeoNamesCode, chinaProvinceNameByAdcode } from './china-admin1';
import { calculateComfortScore, dayMatchesFilter } from './scoring';

function dominantWeatherType(forecasts: DailyForecast[]): WeatherType {
  const counts = new Map<WeatherType, number>();

  for (const forecast of forecasts) {
    counts.set(forecast.weatherType, (counts.get(forecast.weatherType) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'cloudy';
}

export function buildChinaProvinceDailySummaries(
  cities: City[],
  forecasts: DailyForecast[],
  date: string
): RegionWeatherSummary[] {
  const cityById = new Map(cities.map((city) => [city.id, city]));
  const grouped = new Map<string, DailyForecast[]>();

  for (const forecast of forecasts) {
    if (forecast.date !== date) continue;
    const city = cityById.get(forecast.cityId);
    if (!city?.admin1GroupCode || city.countryCode !== 'CN') continue;
    const list = grouped.get(city.admin1GroupCode) ?? [];
    list.push(forecast);
    grouped.set(city.admin1GroupCode, list);
  }

  return [...grouped.entries()].flatMap(([geoNamesAdmin1Code, provinceForecasts]) => {
    const admin1GroupCode = chinaAdmin1AdcodeByGeoNamesCode[geoNamesAdmin1Code];
    if (!admin1GroupCode) return [];
    const cityCount = provinceForecasts.length;
    const temperatureMeanC =
      provinceForecasts.reduce((sum, forecast) => sum + forecast.temperatureMeanC, 0) / Math.max(cityCount, 1);
    const precipitationSumMm =
      provinceForecasts.reduce((sum, forecast) => sum + forecast.precipitationSumMm, 0) / Math.max(cityCount, 1);
    const humidityMeanPercent =
      provinceForecasts.reduce((sum, forecast) => sum + forecast.humidityMeanPercent, 0) / Math.max(cityCount, 1);
    const comfortScore =
      provinceForecasts.reduce((sum, forecast) => sum + calculateComfortScore(forecast), 0) / Math.max(cityCount, 1);

    return {
      id: `province:${admin1GroupCode}`,
      name: chinaProvinceNameByAdcode[admin1GroupCode] ?? admin1GroupCode,
      admin1GroupCode,
      cityCount,
      weatherType: dominantWeatherType(provinceForecasts),
      temperatureMeanC,
      humidityMeanPercent,
      elevationMeters:
        provinceForecasts.reduce((sum, forecast) => {
          const city = cityById.get(forecast.cityId);
          return sum + (city?.elevationMeters ?? 0);
        }, 0) / Math.max(cityCount, 1),
      precipitationSumMm,
      comfortScore,
      matchDays: 0,
      totalDays: 0
    };
  });
}

export function buildChinaProvinceTravelSummaries(
  cities: City[],
  forecastsByCity: Map<string, DailyForecast[]>,
  filter: TravelFilter
): RegionWeatherSummary[] {
  const grouped = new Map<string, { forecasts: DailyForecast[]; matchDays: number; totalDays: number; cityCount: number }>();

  for (const city of cities) {
    if (!city.admin1GroupCode || city.countryCode !== 'CN') continue;
    const scopedForecasts = (forecastsByCity.get(city.id) ?? []).slice(0, filter.dateWindowDays);
    if (scopedForecasts.length === 0) continue;
    const current = grouped.get(city.admin1GroupCode) ?? { forecasts: [], matchDays: 0, totalDays: 0, cityCount: 0 };
    current.forecasts.push(...scopedForecasts);
    current.matchDays += scopedForecasts.filter((forecast) => dayMatchesFilter(forecast, filter)).length;
    current.totalDays += scopedForecasts.length;
    current.cityCount += 1;
    grouped.set(city.admin1GroupCode, current);
  }

  return [...grouped.entries()].flatMap(([geoNamesAdmin1Code, value]) => {
    const admin1GroupCode = chinaAdmin1AdcodeByGeoNamesCode[geoNamesAdmin1Code];
    if (!admin1GroupCode) return [];
    const count = value.forecasts.length;
    return {
      id: `province:${admin1GroupCode}`,
      name: chinaProvinceNameByAdcode[admin1GroupCode] ?? admin1GroupCode,
      admin1GroupCode,
      cityCount: value.cityCount,
      weatherType: dominantWeatherType(value.forecasts),
      temperatureMeanC: value.forecasts.reduce((sum, forecast) => sum + forecast.temperatureMeanC, 0) / Math.max(count, 1),
      humidityMeanPercent: value.forecasts.reduce((sum, forecast) => sum + forecast.humidityMeanPercent, 0) / Math.max(count, 1),
      elevationMeters:
        cities
          .filter((city) => city.countryCode === 'CN' && city.admin1GroupCode === geoNamesAdmin1Code)
          .reduce((sum, city) => sum + city.elevationMeters, 0) / Math.max(value.cityCount, 1),
      precipitationSumMm: value.forecasts.reduce((sum, forecast) => sum + forecast.precipitationSumMm, 0) / Math.max(count, 1),
      comfortScore: value.matchDays / Math.max(value.totalDays, 1),
      matchDays: value.matchDays,
      totalDays: value.totalDays
    };
  });
}
