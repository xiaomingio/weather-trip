/**
 * 文件说明: 实现免费静态版天气数据源，负责读取城市 JSON 和天气二进制包并解码为 UI 可用快照。
 * 对应文档: docs/specs/32-public-data-contract.md, docs/specs/41-weather-matrix-performance.md
 */
import { decodeCitiesPayload, decodeWeatherDataSnapshot, type CitiesPayloadWire, type WeatherCurrentWire } from 'weather-core/static-data';
import type { City, WeatherDataSnapshot } from 'weather-core/types';
import { getStaticDataBaseUrl, getWeatherDataBaseUrl } from './site-config';

export type WeatherDataSource = {
  loadSnapshot: () => Promise<WeatherDataSnapshot>;
};

export type CityDataSnapshot = {
  version: string;
  cities: City[];
};

const staticDataBaseUrl = getStaticDataBaseUrl();
const weatherDataBaseUrl = getWeatherDataBaseUrl();

let snapshotPromise: Promise<WeatherDataSnapshot> | null = null;
let citySnapshotPromise: Promise<CityDataSnapshot> | null = null;

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${normalizedBase}/${normalizedPath}`;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Static weather data request failed with ${response.status}: ${url}`);
  return (await response.json()) as T;
}

async function fetchArrayBuffer(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Static weather data request failed with ${response.status}: ${url}`);
  return response.arrayBuffer();
}

async function loadStaticSnapshot(signal?: AbortSignal): Promise<WeatherDataSnapshot> {
  const cities = await fetchJson<CitiesPayloadWire>(joinUrl(staticDataBaseUrl, 'cities.json'), signal);
  const current = await fetchJson<WeatherCurrentWire>(joinUrl(weatherDataBaseUrl, 'weather/current.json'), signal);
  const forecast = await fetchArrayBuffer(joinUrl(weatherDataBaseUrl, current.f), signal);
  return decodeWeatherDataSnapshot(cities, current, forecast);
}

async function loadStaticCitySnapshot(signal?: AbortSignal): Promise<CityDataSnapshot> {
  const cities = await fetchJson<CitiesPayloadWire>(joinUrl(staticDataBaseUrl, 'cities.json'), signal);
  return {
    version: cities.v,
    cities: decodeCitiesPayload(cities)
  };
}

export const staticWeatherDataSource: WeatherDataSource = {
  loadSnapshot: () => {
    snapshotPromise ??= loadStaticSnapshot();
    return snapshotPromise;
  }
};

export function loadWeatherSnapshot(): Promise<WeatherDataSnapshot> {
  return staticWeatherDataSource.loadSnapshot();
}

export function loadCitySnapshot(): Promise<CityDataSnapshot> {
  citySnapshotPromise ??= loadStaticCitySnapshot();
  return citySnapshotPromise;
}
