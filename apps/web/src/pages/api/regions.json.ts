/**
 * 文件说明: 返回天气工具一级地区列表和每个地区对应的地图视野范围。
 * 参数: locale。
 * 返回: RegionsPayload，regions 使用通用 country / partition 地图层语义。
 * 对应文档: docs/api.md
 */
import type { APIRoute } from 'astro';
import { buildRegionsPayload } from '@/domain/weather-dashboard-server';
import { respondWithWeatherApiPayload } from '@/server/weather-api-service';

export const GET: APIRoute = async ({ request, url }) =>
  respondWithWeatherApiPayload({
    request,
    url,
    cacheNamespace: 'regions',
    buildPayload: buildRegionsPayload
  });
