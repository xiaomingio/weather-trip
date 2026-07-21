/**
 * 文件说明: 为天气地图和城市查找工具页提供按当前筛选条件裁剪后的 JSON 数据。
 * 对应文档: docs/data-flow.md
 */
import type { APIRoute } from 'astro';
import { createWeatherDatabase, readWeatherSnapshot, type WeatherSnapshot } from 'weather-db';
import type { DisplayLocale } from '@/domain/format';
import { resolveToolMode } from '@/domain/navigation';
import { buildWeatherDashboardPayload } from '@/domain/weather-dashboard-server';

type SnapshotCache = {
  expiresAt: number;
  value: WeatherSnapshot;
};

let snapshotCache: SnapshotCache | null = null;
const snapshotCacheTtlMs = 60_000;

async function readCachedSnapshot(): Promise<WeatherSnapshot> {
  const now = Date.now();
  if (snapshotCache && snapshotCache.expiresAt > now) return snapshotCache.value;

  const db = createWeatherDatabase();
  try {
    const value = await readWeatherSnapshot(db);
    snapshotCache = {
      expiresAt: now + snapshotCacheTtlMs,
      value
    };
    return value;
  } finally {
    await db.close();
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, max-age=30'
    }
  });
}

export const GET: APIRoute = async ({ url }) => {
  const locale: DisplayLocale = url.searchParams.get('locale') === 'zh' ? 'zh' : 'en';
  const modeParam = url.searchParams.get('mode');
  const mode = modeParam === 'daily' || modeParam === 'travel' ? modeParam : resolveToolMode(modeParam ?? undefined);
  if (!mode) return jsonResponse({ error: 'Unsupported mode.' }, 400);

  const snapshot = await readCachedSnapshot();
  const payload = buildWeatherDashboardPayload(snapshot, {
    locale,
    mode,
    searchParams: url.searchParams,
    selectedCityId: url.searchParams.get('selectedCityId')
  });

  return jsonResponse(payload);
};
