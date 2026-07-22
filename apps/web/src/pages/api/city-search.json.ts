/**
 * 文件说明: 按 City Finder 页面的筛选条件返回城市结果列表和地图分块聚合数据。
 * 参数: locale、region、days、temp、weather、humidity、precipitation、wind、elevation。
 * 返回: WeatherToolPayload，其中 resultItems 是城市匹配结果，regionSummaries 是地图分块聚合；城市详情由 /api/city-forecast.json 单独请求。
 * 对应文档: docs/api.md
 */
import type { APIRoute } from 'astro';
import { buildCitySearchPayload } from '@/domain/weather-dashboard-server';
import { respondWithWeatherApiPayload } from '@/server/weather-api-service';

export const GET: APIRoute = async ({ request, url }) =>
  respondWithWeatherApiPayload({
    request,
    url,
    cacheNamespace: 'city-search',
    buildPayload: buildCitySearchPayload
  });
