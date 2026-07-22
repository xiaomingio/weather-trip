/**
 * 文件说明: 返回某个天气图层在指定地区和日期范围内的数据，图层本身作为 REST 资源路径。
 * 参数: 路径 layer 为 weather/temperature/humidity/precipitation/wind/comfort/elevation；query 支持 locale、region、date 可选。
 * 返回: WeatherLayerPayload；带 date 返回单日，不带 date 返回前 14 天用于异步预取。
 * 对应文档: docs/api.md
 */
import type { APIRoute } from 'astro';
import { buildWeatherLayerPayload } from '@/domain/weather-dashboard-server';
import { isSupportedMapLayer } from '@/domain/weather-dashboard-shared';
import { respondWithWeatherApiPayload } from '@/server/weather-api-service';

export const GET: APIRoute = async ({ params, request, url }) => {
  const layer = params.layer;
  if (!isSupportedMapLayer(layer)) {
    return new Response(JSON.stringify({ error: 'Weather layer not found.' }), {
      status: 404,
      headers: {
        'content-type': 'application/json; charset=utf-8'
      }
    });
  }

  const requestUrl = new URL(url);
  requestUrl.searchParams.set('layer', layer);
  return respondWithWeatherApiPayload({
    request,
    url: requestUrl,
    cacheNamespace: `weather-layer:${layer}`,
    buildPayload: buildWeatherLayerPayload
  });
};
