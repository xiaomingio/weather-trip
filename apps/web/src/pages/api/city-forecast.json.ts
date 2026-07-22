/**
 * 文件说明: 根据 cityId 返回单个城市最近 14 天天气详情，供两个工具 tab 的城市详情卡片复用。
 * 参数: locale、cityId。
 * 返回: CityForecastPayload，包含 cityId 和 selectedCityForecasts。
 * 对应文档: docs/api.md
 */
import type { APIRoute } from 'astro';
import { buildCityForecastPayload } from '@/domain/weather-dashboard-server';
import { respondWithWeatherApiPayload } from '@/server/weather-api-service';

export const GET: APIRoute = async ({ request, url }) =>
  respondWithWeatherApiPayload({
    request,
    url,
    cacheNamespace: 'city-forecast',
    buildPayload: buildCityForecastPayload
  });
