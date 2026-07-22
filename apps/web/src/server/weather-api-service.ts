/**
 * 文件说明: 为天气工具公开 API 提供共享的快照读取、响应缓存和 JSON 压缩机制。
 * 对应文档: docs/data-flow.md
 */
import type { Buffer } from 'node:buffer';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import { createWeatherDatabase, readWeatherSnapshot, type WeatherSnapshot } from 'weather-db';
import type { DisplayLocale } from '@/domain/format';

type SnapshotCache = {
  expiresAt: number;
  value: WeatherSnapshot;
};

type WeatherApiJsonCache = {
  expiresAt: number;
  json: string;
};

type WeatherApiEncodedJsonCache = {
  expiresAt: number;
  body: ArrayBuffer;
};

type WeatherApiPayloadParams = {
  locale: DisplayLocale;
  searchParams: URLSearchParams;
};

type WeatherApiResponseParams = {
  request: Request;
  url: URL;
  cacheNamespace: string;
  buildPayload: (snapshot: WeatherSnapshot, params: WeatherApiPayloadParams) => unknown;
};

let snapshotCache: SnapshotCache | null = null;
const weatherApiJsonCache = new Map<string, WeatherApiJsonCache>();
const weatherApiEncodedJsonCache = new Map<string, WeatherApiEncodedJsonCache>();
const snapshotCacheTtlMs = 60_000;
const weatherApiJsonCacheTtlMs = 60_000;
const weatherApiJsonCacheMaxEntries = 48;
const weatherApiEncodedJsonCacheMaxEntries = 96;
const supportedLocales: DisplayLocale[] = ['en', 'zh'];

type ExpiringCacheEntry = {
  expiresAt: number;
};

function readCacheEntry<T extends ExpiringCacheEntry>(cache: Map<string, T>, key: string): T | null {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt > Date.now()) return cached;

  cache.delete(key);
  return null;
}

function writeCacheEntry<T extends ExpiringCacheEntry>(cache: Map<string, T>, key: string, value: T, maxEntries: number): void {
  const now = Date.now();
  for (const [cachedKey, cachedValue] of cache) {
    if (cachedValue.expiresAt <= now) cache.delete(cachedKey);
  }

  if (cache.has(key)) cache.delete(key);

  while (cache.size >= maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }

  cache.set(key, value);
}

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

function readAcceptedEncoding(request: Request): 'br' | 'gzip' | null {
  const acceptEncoding = request.headers.get('accept-encoding') ?? '';
  if (acceptEncoding.includes('br')) return 'br';
  if (acceptEncoding.includes('gzip')) return 'gzip';
  return null;
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function compressedJsonTextResponse(json: string, request: Request, status = 200, cacheKey?: string): Response {
  const encoding = readAcceptedEncoding(request);
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=60, stale-while-revalidate=120',
    vary: 'accept-encoding'
  });

  if (!encoding) return new Response(json, { status, headers });

  headers.set('content-encoding', encoding);
  const encodedCacheKey = cacheKey ? `${encoding}:${cacheKey}` : null;
  const cachedBody = encodedCacheKey ? readCacheEntry(weatherApiEncodedJsonCache, encodedCacheKey) : null;
  if (cachedBody) {
    return new Response(cachedBody.body, { status, headers });
  }

  const body = bufferToArrayBuffer(
    encoding === 'br'
      ? brotliCompressSync(json, {
          params: {
            [zlibConstants.BROTLI_PARAM_QUALITY]: 5
          }
        })
      : gzipSync(json)
  );

  if (encodedCacheKey) {
    writeCacheEntry(
      weatherApiEncodedJsonCache,
      encodedCacheKey,
      {
        expiresAt: Date.now() + weatherApiJsonCacheTtlMs,
        body
      },
      weatherApiEncodedJsonCacheMaxEntries
    );
  }

  return new Response(body, { status, headers });
}

function compressedJsonResponse(body: unknown, request: Request, status = 200): Response {
  return compressedJsonTextResponse(JSON.stringify(body), request, status);
}

export function readLocaleFromSearchParams(searchParams: URLSearchParams): DisplayLocale | null {
  const localeParam = searchParams.get('locale');
  if (!localeParam) return 'en';
  if (supportedLocales.includes(localeParam as DisplayLocale)) return localeParam as DisplayLocale;
  return null;
}

export async function respondWithWeatherApiPayload({
  request,
  url,
  cacheNamespace,
  buildPayload
}: WeatherApiResponseParams): Promise<Response> {
  const locale = readLocaleFromSearchParams(url.searchParams);
  if (!locale) return compressedJsonResponse({ error: 'Unsupported locale.' }, request, 400);

  const cacheKey = `${cacheNamespace}:${url.searchParams.toString()}`;
  const cachedJson = readCacheEntry(weatherApiJsonCache, cacheKey);
  if (cachedJson) {
    return compressedJsonTextResponse(cachedJson.json, request, 200, cacheKey);
  }

  const snapshot = await readCachedSnapshot();
  const payload = buildPayload(snapshot, {
    locale,
    searchParams: url.searchParams
  });
  const json = JSON.stringify(payload);
  writeCacheEntry(
    weatherApiJsonCache,
    cacheKey,
    {
      expiresAt: Date.now() + weatherApiJsonCacheTtlMs,
      json
    },
    weatherApiJsonCacheMaxEntries
  );

  return compressedJsonTextResponse(json, request, 200, cacheKey);
}
