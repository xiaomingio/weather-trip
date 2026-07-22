/**
 * 文件说明: 返回天气地图当前地区可选日期，首屏用于确定默认日期和日期控件范围。
 * 参数: locale、region、date 可选。
 * 返回: MapDatesPayload，包含全局 availableDates、当前地区 regionAvailableDates 和修正后的 selectedDate。
 * 对应文档: docs/api.md
 */
import type { APIRoute } from 'astro';
import { buildMapDatesPayload } from '@/domain/weather-dashboard-server';
import { respondWithWeatherApiPayload } from '@/server/weather-api-service';

export const GET: APIRoute = async ({ request, url }) =>
  respondWithWeatherApiPayload({
    request,
    url,
    cacheNamespace: 'map-dates',
    buildPayload: buildMapDatesPayload
  });
