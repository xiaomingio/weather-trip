/**
 * 文件说明: 根据一级地区返回可选地图分块列表和每个分块的地图视野范围。
 * 参数: locale、region。
 * 返回: SubregionsPayload，subRegions 的 id 使用 partition:<country>.<code> 这种通用分块 key。
 * 对应文档: docs/api.md
 */
import type { APIRoute } from 'astro';
import { buildSubregionsPayload } from '@/domain/weather-dashboard-server';
import { respondWithWeatherApiPayload } from '@/server/weather-api-service';

export const GET: APIRoute = async ({ request, url }) =>
  respondWithWeatherApiPayload({
    request,
    url,
    cacheNamespace: 'subregions',
    buildPayload: buildSubregionsPayload
  });
