/**
 * 文件说明: 按国家分档从边界源自身的行政区生成前端地图使用的 GeoJSON 包。
 * 对应文档: docs/specs/30-weather-coverage-design.md, docs/specs/31-data-flow.md
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseZip } from 'shpjs';
import YAML from 'yaml';
import type { CountryTier } from 'weather-core/types';
import { generatedDataVersion, readJsonLines } from '../generated-jsonl.js';

type GeoJsonGeometry = {
  type: string;
  coordinates: unknown;
};

type GeoJsonFeature = {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: GeoJsonGeometry;
};

type FeatureCollection = {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
};

type CountryProfile = {
  countryCode: string;
  countryTier: CountryTier;
  detailedCoverage?: 'admin1' | 'admin2';
};

type CountryProfilesPayload = {
  version: string;
  profiles: CountryProfile[];
};

type GeoBoundarySourceLevel = 'ADM1' | 'ADM2' | 'ADM3';

type CountryDetailSourceSeed = {
  countryCode: string;
  admin2SourceLevel?: Extract<GeoBoundarySourceLevel, 'ADM2' | 'ADM3'>;
};

type GeoBoundarySourceSeed = {
  countryDetailSources?: CountryDetailSourceSeed[];
  naturalEarthCountryMapUnits?: Array<{
    countryCode: string;
    sourceNames: string[];
  }>;
  naturalEarthCountryAdmin1Units?: Array<{
    countryCode: string;
    sourceIso3166Codes: string[];
  }>;
};

type GeoBoundaryReport = {
  generatedAt: string;
  profileVersion: string;
  validationFailures: string[];
  worldCoverage: {
    expectedCountryCount: number;
    generatedCountryCount: number;
    expectedRegionCount: number;
    generatedRegionCount: number;
  };
  packages: Array<{
    id: string;
    outputPath: string;
    featureCount: number;
  }>;
  countries: Array<{
    countryCode: string;
    countryTier: CountryTier;
    admin1Expected: number;
    admin1Generated: number;
    admin2Expected: number;
    admin2Generated: number;
    admin1CountryAreaRatio?: number;
    boundaryOnlyGenerated: number;
    missingAdmin1: string[];
    missingAdmin2: string[];
    sources: string[];
  }>;
};

type NativeBoundaryFeatureParams = {
  countryCode: string;
  level: 'admin1' | 'admin2' | 'boundary';
  feature: GeoJsonFeature;
  fallbackId: string;
  source: string;
  weatherRegionKey?: string;
};

const rootDir = process.cwd();
const rawDir = path.join(rootDir, 'data', 'raw', 'geo-boundaries');
const generatedDir = path.join(rootDir, 'data', 'generated');
const generatedGeoDir = path.join(generatedDir, 'geo');
const reportDir = path.join(rootDir, 'data', 'report');
const profilesPath = path.join(rootDir, 'data', 'generated', 'country-profiles.jsonl');
const geoBoundarySourcesPath = path.join(rootDir, 'data', 'input', 'geo-boundary-sources.yml');
const geoCountryPath = 'data/generated/geo/country.geojson';
const geoC2Admin1Path = 'data/generated/geo/c2_admin1.geojson';
const geoC3Admin1Path = 'data/generated/geo/c3_admin1.geojson';
const geoC3Admin2Dir = 'data/generated/geo/c3_admin2';

const naturalEarthAdmin0Url = 'https://naturalearth.s3.amazonaws.com/110m_cultural/ne_110m_admin_0_countries.zip';
const naturalEarthAdmin0DetailedUrl = 'https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_0_countries.zip';
const naturalEarthAdmin0MapUnitsUrl = 'https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_0_map_units.zip';
const naturalEarthAdmin1Url = 'https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_1_states_provinces.zip';
const naturalEarthAdmin1LowUrl = 'https://naturalearth.s3.amazonaws.com/50m_cultural/ne_50m_admin_1_states_provinces.zip';
const naturalEarthAdmin0Path = path.join(rawDir, 'ne_110m_admin_0_countries.zip');
const naturalEarthAdmin0DetailedPath = path.join(rawDir, 'ne_10m_admin_0_countries.zip');
const naturalEarthAdmin0MapUnitsPath = path.join(rawDir, 'ne_10m_admin_0_map_units.zip');
const naturalEarthAdmin1Path = path.join(rawDir, 'ne_10m_admin_1_states_provinces.zip');
const naturalEarthAdmin1LowPath = path.join(rawDir, 'ne_50m_admin_1_states_provinces.zip');

const datavChinaUrl = 'https://geo.datav.aliyun.com/areas_v3/bound';
const chinaAmapAdmin1CodeByAdcode = new Map<number, string>([
  [110000, '22'],
  [120000, '28'],
  [130000, '10'],
  [140000, '24'],
  [150000, '20'],
  [210000, '19'],
  [220000, '05'],
  [230000, '08'],
  [310000, '23'],
  [320000, '04'],
  [330000, '02'],
  [340000, '01'],
  [350000, '07'],
  [360000, '03'],
  [370000, '25'],
  [410000, '09'],
  [420000, '12'],
  [430000, '11'],
  [440000, '30'],
  [450000, '16'],
  [460000, '31'],
  [500000, '33'],
  [510000, '32'],
  [520000, '18'],
  [530000, '29'],
  [540000, '14'],
  [610000, '26'],
  [620000, '15'],
  [630000, '06'],
  [640000, '21'],
  [650000, '13']
]);
const chinaCompanionRegions = [
  { countryCode: 'HK', admin1Code: 'HK', admin2Code: '810000', adcode: 810000, nameZh: '香港', nameEn: 'Hong Kong', source: 'full' },
  { countryCode: 'MO', admin1Code: 'MO', admin2Code: '820000', adcode: 820000, nameZh: '澳门', nameEn: 'Macau', source: 'full' },
  { countryCode: 'TW', admin1Code: 'TW', admin2Code: '710000', adcode: 710000, nameZh: '台湾', nameEn: 'Taiwan', source: 'single' }
] as const;
const chinaDirectMunicipalityAdcodes = new Set([110000, 120000, 310000, 500000]);

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

async function readCountryProfiles(): Promise<CountryProfilesPayload> {
  const profiles = await readJsonLines<CountryProfile>(profilesPath);
  return {
    version: generatedDataVersion('country-profiles', profiles),
    profiles
  };
}

async function readYaml<T>(filePath: string): Promise<T> {
  return YAML.parse(await readFile(filePath, 'utf8')) as T;
}

async function downloadFile(url: string, destination: string): Promise<void> {
  try {
    await readFile(destination);
    return;
  } catch {
    // Download below.
  }

  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporaryPath = `${destination}.tmp`;
  await rm(temporaryPath, { force: true });
  const body = response.body as unknown as Parameters<typeof Readable.fromWeb>[0];
  await pipeline(Readable.fromWeb(body), createWriteStream(temporaryPath));
  await rm(destination, { force: true });
  await rename(temporaryPath, destination);
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function downloadJson(url: string, destination: string): Promise<FeatureCollection> {
  try {
    return await readJson<FeatureCollection>(destination);
  } catch {
    // Download below.
  }

  const response = await fetchWithRetry(url);
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  const payload = await response.text();
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, payload.endsWith('\n') ? payload : `${payload}\n`);
  return JSON.parse(payload) as FeatureCollection;
}

async function parseShapefileZip(filePath: string): Promise<FeatureCollection> {
  const content = await readFile(filePath);
  const parsed = await parseZip(content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength));
  return (Array.isArray(parsed) ? parsed[0] : parsed) as FeatureCollection;
}

function normalizeName(value: string): string {
  return value
    .replace(/[Đđ]/g, 'd')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(province|provincia|departement|department|region|regione|regency|kabupaten|kota|district|township|urban|municipality|comunidad|comunitat|autonoma|autonomous|principado|ciudad|citta|metropolitana|capitale|foral|of|de|di|da|do|del|dell|du|d|la|le|the|y)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function nameVariants(value: string): string[] {
  const normalized = normalizeName(value);
  return [
    normalized,
    ...value.split('/').map(normalizeName),
    normalized.replace(/\bprovince\b/g, ''),
    normalized.replace(/\bcity\b/g, '')
  ].map(normalizeName).filter((item, index, items) => item && items.indexOf(item) === index);
}

function normalizeChineseName(value: string): string {
  return value
    .replace(/省|市|特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区/g, '')
    .replace(/内蒙古/g, '内蒙古')
    .trim();
}

function stringProperty(properties: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function validIsoA2(properties: Record<string, unknown>): string | null {
  const candidates = [properties.ISO_A2, properties.ISO_A2_EH, properties.WB_A2, properties.iso_a2];
  for (const value of candidates) {
    if (typeof value === 'string' && /^[A-Z]{2}$/.test(value)) return value;
  }
  return null;
}

function validIsoA3(properties: Record<string, unknown>): string | null {
  const candidates = [properties.ISO_A3, properties.ISO_A3_EH, properties.ADM0_A3, properties.adm0_a3];
  for (const value of candidates) {
    if (typeof value === 'string' && /^[A-Z]{3}$/.test(value)) return value;
  }
  return null;
}

function sourceAdmin1Code(countryCode: string, feature: GeoJsonFeature): string | undefined {
  const gnCode = stringProperty(feature.properties, ['gn_a1_code']);
  if (gnCode?.startsWith(`${countryCode}.`)) return gnCode.split('.')[1];
  const isoCode = stringProperty(feature.properties, ['iso_3166_2', 'shapeISO']);
  if (isoCode?.startsWith(`${countryCode}-`)) return isoCode.slice(countryCode.length + 1);
  return undefined;
}

function sourceLabel(feature: GeoJsonFeature): string {
  return stringProperty(feature.properties, ['shapeName', 'name', 'NAME', 'name_en', 'NAME_EN', 'woe_name']) ?? '';
}

function sourceStableId(feature: GeoJsonFeature, fallbackId: string): string {
  return stringProperty(feature.properties, ['shapeISO', 'iso_3166_2', 'gn_a1_code', 'shapeID', 'adm1_code', 'adm2_code', 'name', 'NAME']) ?? fallbackId;
}

function boundaryFeature(regionKey: string, geometry: GeoJsonGeometry, properties: Record<string, unknown> = {}): GeoJsonFeature {
  return {
    type: 'Feature',
    properties: { regionKey, ...properties },
    geometry
  };
}

function geometryToMultiPolygon(geometry: GeoJsonGeometry): unknown[] {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) return geometry.coordinates;
  return [];
}

function groupedMultiPolygonFeature(regionKey: string, features: GeoJsonFeature[], properties: Record<string, unknown> = {}): GeoJsonFeature | null {
  const coordinates = features.flatMap((feature) => geometryToMultiPolygon(feature.geometry));
  if (coordinates.length === 0) return null;
  return boundaryFeature(regionKey, { type: 'MultiPolygon', coordinates }, properties);
}

function coordinatePair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || typeof value[0] !== 'number' || typeof value[1] !== 'number') return null;
  if (!Number.isFinite(value[0]) || !Number.isFinite(value[1])) return null;
  return [value[0], value[1]];
}

function ringApproxArea(ring: unknown): number {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  const points = ring.map(coordinatePair).filter((point): point is [number, number] => Boolean(point));
  if (points.length < 4) return 0;
  const meanLat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const lngScale = Math.cos(meanLat * Math.PI / 180);
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += (current[0] * lngScale) * next[1] - (next[0] * lngScale) * current[1];
  }
  return Math.abs(area) / 2;
}

function polygonApproxArea(polygon: unknown): number {
  if (!Array.isArray(polygon) || polygon.length === 0) return 0;
  const [outer, ...holes] = polygon;
  return Math.max(0, ringApproxArea(outer) - holes.reduce((sum, ring) => sum + ringApproxArea(ring), 0));
}

function geometryApproxArea(geometry: GeoJsonGeometry): number {
  if (geometry.type === 'Polygon') return polygonApproxArea(geometry.coordinates);
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.reduce((sum, polygon) => sum + polygonApproxArea(polygon), 0);
  }
  return 0;
}

function sortFeatures(features: GeoJsonFeature[]): GeoJsonFeature[] {
  return [...features].sort((left, right) => String(left.properties.regionKey).localeCompare(String(right.properties.regionKey)));
}

function uniqueFeatures(features: GeoJsonFeature[]): GeoJsonFeature[] {
  const counts = new Map<string, number>();
  return sortFeatures(features.map((feature) => {
    const regionKey = String(feature.properties.regionKey ?? '');
    const count = counts.get(regionKey) ?? 0;
    counts.set(regionKey, count + 1);
    if (count === 0) return feature;
    return {
      ...feature,
      properties: {
        ...feature.properties,
        regionKey: `${regionKey}.${count + 1}`
      }
    };
  }));
}

function nativeBoundaryFeature(params: NativeBoundaryFeatureParams): GeoJsonFeature {
  const label = sourceLabel(params.feature);
  const sourceId = sourceStableId(params.feature, params.fallbackId).replace(/[^A-Za-z0-9_-]+/g, '_');
  const keyLevel = params.level === 'boundary' ? 'boundary' : params.level;
  const regionKey = `${keyLevel}:${params.countryCode}.${sourceId}`;
  return boundaryFeature(regionKey, params.feature.geometry, {
    labelEn: label || sourceId,
    labelZh: label || sourceId,
    source: params.source,
    sourceId,
    ...(params.weatherRegionKey ? { weatherRegionKey: params.weatherRegionKey } : {})
  });
}

function nativeAdmin1Features(countryCode: string, source: FeatureCollection, sourceName: string): GeoJsonFeature[] {
  return uniqueFeatures(source.features.map((feature, index) => {
    const code = sourceAdmin1Code(countryCode, feature);
    return nativeBoundaryFeature({
      countryCode,
      level: 'admin1',
      feature,
      fallbackId: `${sourceName}-${index + 1}`,
      source: sourceName,
      weatherRegionKey: code ? `admin1:${countryCode}.${code}` : undefined
    });
  }));
}

function nativeAdmin2Features(countryCode: string, source: FeatureCollection, sourceName: string): GeoJsonFeature[] {
  return uniqueFeatures(source.features.map((feature, index) =>
    nativeBoundaryFeature({
      countryCode,
      level: 'admin2',
      feature,
      fallbackId: `${sourceName}-${index + 1}`,
      source: sourceName
    })
  ));
}

function appendNaturalEarthCountryAdmin1Units(featuresByCode: Map<string, GeoJsonFeature>, admin1Units: FeatureCollection, seed: GeoBoundarySourceSeed): void {
  for (const config of seed.naturalEarthCountryAdmin1Units ?? []) {
    const sourceIso3166Codes = new Set(config.sourceIso3166Codes);
    const features = admin1Units.features.filter((feature) => {
      const iso3166Code = stringProperty(feature.properties, ['iso_3166_2']);
      return Boolean(iso3166Code && sourceIso3166Codes.has(iso3166Code));
    });
    const baseFeature = featuresByCode.get(config.countryCode);
    const feature = groupedMultiPolygonFeature(`country:${config.countryCode}`, [
      ...(baseFeature ? [baseFeature] : []),
      ...features
    ]);
    if (feature) featuresByCode.set(config.countryCode, feature);
  }
}

function naturalEarthCountryFeaturesByCode(sources: FeatureCollection[], mapUnits: FeatureCollection, admin1Units: FeatureCollection, seed: GeoBoundarySourceSeed): Map<string, GeoJsonFeature> {
  const featuresByCode = new Map<string, GeoJsonFeature>();
  for (const source of sources) {
    const sourceFeaturesByCode = new Map<string, GeoJsonFeature[]>();
    for (const feature of source.features) {
      const countryCode = validIsoA2(feature.properties);
      if (!countryCode) continue;
      const features = sourceFeaturesByCode.get(countryCode) ?? [];
      features.push(feature);
      sourceFeaturesByCode.set(countryCode, features);
    }
    for (const [countryCode, features] of sourceFeaturesByCode) {
      const feature = groupedMultiPolygonFeature(`country:${countryCode}`, features);
      if (feature) featuresByCode.set(countryCode, feature);
    }
  }

  for (const config of seed.naturalEarthCountryMapUnits ?? []) {
    const sourceNames = new Set(config.sourceNames.map(normalizeName));
    const features = mapUnits.features.filter((feature) => {
      const names = [
        feature.properties.NAME,
        feature.properties.NAME_LONG,
        feature.properties.BRK_NAME
      ].flatMap((value) => typeof value === 'string' ? nameVariants(value) : []);
      return names.some((name) => sourceNames.has(name));
    });
    const feature = groupedMultiPolygonFeature(`country:${config.countryCode}`, features);
    if (feature) featuresByCode.set(config.countryCode, feature);
  }

  appendNaturalEarthCountryAdmin1Units(featuresByCode, admin1Units, seed);
  return featuresByCode;
}

function naturalEarthIso3ByCountry(sources: FeatureCollection[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const source of sources) {
    for (const feature of source.features) {
      const iso2 = validIsoA2(feature.properties);
      const iso3 = validIsoA3(feature.properties);
      if (iso2 && iso3 && !result.has(iso2)) result.set(iso2, iso3);
    }
  }
  return result;
}

async function chinaCountryOutlineFeature(): Promise<GeoJsonFeature | null> {
  const china = await downloadJson(`${datavChinaUrl}/100000.json`, path.join(rawDir, 'datav-cn-100000.geojson'));
  const feature = china.features.find((item) => Number(item.properties.adcode) === 100000);
  return feature ? boundaryFeature('country:CN', feature.geometry, {
    ...chinaBoundaryProperties('中国', 'China'),
    source: 'DataV/高德（Amap）'
  }) : null;
}

function chinaBoundaryProperties(nameZh: string, nameEn?: string): Record<string, unknown> {
  return {
    labelZh: normalizeChineseName(nameZh) || nameZh,
    labelEn: nameEn || normalizeChineseName(nameZh) || nameZh
  };
}

function chinaFeatureName(feature: GeoJsonFeature): string {
  return typeof feature.properties.name === 'string' ? feature.properties.name : '';
}

function chinaCompanionAdmin1Key(countryCode: string): string {
  return `admin1:CN.${countryCode}`;
}

function chinaCompanionAdmin2Key(countryCode: string): string | null {
  const region = chinaCompanionRegions.find((item) => item.countryCode === countryCode);
  return region ? `admin2:CN.${region.admin1Code}.${region.admin2Code}` : null;
}

async function chinaCompanionAdmin1Features(): Promise<GeoJsonFeature[]> {
  const output: GeoJsonFeature[] = [];
  for (const region of chinaCompanionRegions) {
    const suffix = region.source === 'full' ? '_full' : '';
    const source = await downloadJson(
      `${datavChinaUrl}/${region.adcode}${suffix}.json`,
      path.join(rawDir, `datav-cn-${region.adcode}${suffix}.geojson`)
    );
    const feature = groupedMultiPolygonFeature(chinaCompanionAdmin1Key(region.countryCode), source.features, {
      ...chinaBoundaryProperties(region.nameZh, region.nameEn),
      weatherRegionKey: chinaCompanionAdmin1Key(region.countryCode),
      source: 'DataV/高德（Amap）'
    });
    if (feature) output.push(feature);
  }
  return sortFeatures(output);
}

async function chinaAdmin1Features(): Promise<{ features: GeoJsonFeature[]; sources: string[] }> {
  const china = await downloadJson(`${datavChinaUrl}/100000_full.json`, path.join(rawDir, 'datav-cn-100000-full.geojson'));
  const mainlandFeatures = china.features.flatMap((feature): GeoJsonFeature[] => {
    const adcode = Number(feature.properties.adcode);
    const admin1Code = Number.isFinite(adcode) ? chinaAmapAdmin1CodeByAdcode.get(adcode) : undefined;
    if (!Number.isFinite(adcode) || !admin1Code) return [];
    const name = chinaFeatureName(feature);
    return [boundaryFeature(`admin1:CN.${admin1Code}`, feature.geometry, {
      ...chinaBoundaryProperties(name),
      source: 'DataV/高德（Amap）',
      sourceId: String(adcode),
      weatherRegionKey: `admin1:CN.${admin1Code}`
    })];
  });
  return {
    features: sortFeatures([...mainlandFeatures, ...await chinaCompanionAdmin1Features()]),
    sources: ['DataV/高德（Amap） province and Hong Kong/Macau/Taiwan admin1 boundary']
  };
}

async function chinaAdmin2Features(): Promise<{ features: GeoJsonFeature[]; sources: string[] }> {
  const output: GeoJsonFeature[] = [];

  for (const [provinceAdcode, admin1Code] of chinaAmapAdmin1CodeByAdcode) {
    if (chinaDirectMunicipalityAdcodes.has(provinceAdcode)) continue;
    const province = await downloadJson(`${datavChinaUrl}/${provinceAdcode}_full.json`, path.join(rawDir, `datav-cn-${provinceAdcode}-full.geojson`));
    for (const feature of province.features) {
      const adcode = Number(feature.properties.adcode);
      if (!Number.isFinite(adcode)) continue;
      const featureName = chinaFeatureName(feature);
      const admin2Code = String(Math.trunc(adcode / 100));
      const key = `admin2:CN.${admin1Code}.${admin2Code}`;
      output.push(boundaryFeature(key, feature.geometry, {
        ...chinaBoundaryProperties(featureName),
        source: 'DataV/高德（Amap）',
        sourceId: String(adcode),
        weatherRegionKey: key
      }));
    }
  }

  for (const region of chinaCompanionRegions) {
    const suffix = region.source === 'full' ? '_full' : '';
    const source = await downloadJson(
      `${datavChinaUrl}/${region.adcode}${suffix}.json`,
      path.join(rawDir, `datav-cn-${region.adcode}${suffix}.geojson`)
    );
    const admin2Key = chinaCompanionAdmin2Key(region.countryCode);
    if (!admin2Key) continue;
    for (const feature of source.features) {
      output.push(boundaryFeature(admin2Key, feature.geometry, {
        ...chinaBoundaryProperties(region.nameZh, region.nameEn),
        source: 'DataV/高德（Amap）',
        sourceId: String(region.adcode),
        weatherRegionKey: admin2Key
      }));
    }
  }

  return {
    features: uniqueFeatures(output),
    sources: ['DataV/高德（Amap） province full boundary', 'DataV/高德（Amap） Hong Kong/Macau/Taiwan detail boundary']
  };
}

function geoBoundariesCountryDetailSource(seed: GeoBoundarySourceSeed, countryCode: string): CountryDetailSourceSeed | undefined {
  return seed.countryDetailSources?.find((item) => item.countryCode === countryCode);
}

async function geoBoundariesPackage(countryCode: string, sourceLevel: GeoBoundarySourceLevel, iso3ByCountry: Map<string, string>): Promise<FeatureCollection | null> {
  const iso3 = iso3ByCountry.get(countryCode);
  if (!iso3) return null;
  const apiResponse = await fetchWithRetry(`https://www.geoboundaries.org/api/current/gbOpen/${iso3}/${sourceLevel}/`);
  if (!apiResponse.ok) return null;
  const metadata = await apiResponse.json() as { simplifiedGeometryGeoJSON?: string };
  if (!metadata.simplifiedGeometryGeoJSON) return null;

  const rawPath = path.join(rawDir, `geoboundaries-${countryCode}-${sourceLevel.toLowerCase()}-simplified.geojson`);
  return downloadJson(metadata.simplifiedGeometryGeoJSON, rawPath);
}

async function admin1FeaturesForCountry(
  countryCode: string,
  naturalEarthAdmin1Low: FeatureCollection,
  naturalEarthAdmin1: FeatureCollection,
  iso3ByCountry: Map<string, string>
): Promise<{ features: GeoJsonFeature[]; sources: string[] }> {
  if (countryCode === 'CN') return chinaAdmin1Features();

  const geoBoundariesAdm1 = await geoBoundariesPackage(countryCode, 'ADM1', iso3ByCountry);
  if (geoBoundariesAdm1?.features.length) {
    return {
      features: nativeAdmin1Features(countryCode, geoBoundariesAdm1, 'geoBoundaries gbOpen ADM1'),
      sources: ['geoBoundaries gbOpen ADM1 native shape']
    };
  }

  const naturalEarth10mFeatures = naturalEarthAdmin1.features.filter((feature) => feature.properties.iso_a2 === countryCode);
  if (naturalEarth10mFeatures.length) {
    return {
      features: nativeAdmin1Features(countryCode, { type: 'FeatureCollection', features: naturalEarth10mFeatures }, 'Natural Earth 10m admin1'),
      sources: ['Natural Earth 10m admin1 native shape']
    };
  }

  const naturalEarth50mFeatures = naturalEarthAdmin1Low.features.filter((feature) => feature.properties.iso_a2 === countryCode);
  return {
    features: nativeAdmin1Features(countryCode, { type: 'FeatureCollection', features: naturalEarth50mFeatures }, 'Natural Earth 50m admin1'),
    sources: naturalEarth50mFeatures.length ? ['Natural Earth 50m admin1 native shape'] : []
  };
}

async function admin2FeaturesForCountry(
  countryCode: string,
  seed: GeoBoundarySourceSeed,
  iso3ByCountry: Map<string, string>
): Promise<{ features: GeoJsonFeature[]; sources: string[] }> {
  if (countryCode === 'CN') return chinaAdmin2Features();

  const sourceLevel = geoBoundariesCountryDetailSource(seed, countryCode)?.admin2SourceLevel ?? 'ADM2';
  const geoBoundaries = await geoBoundariesPackage(countryCode, sourceLevel, iso3ByCountry);
  if (!geoBoundaries?.features.length) return { features: [], sources: [] };

  return {
    features: nativeAdmin2Features(countryCode, geoBoundaries, `geoBoundaries gbOpen ${sourceLevel}`),
    sources: [`geoBoundaries gbOpen ${sourceLevel} native shape`]
  };
}

function countryCodeFromRegionKey(regionKey: string): string | null {
  const match = /^(?:country|admin1|admin2|boundary):([A-Z]{2})(?:\.|$)/.exec(regionKey);
  return match ? match[1] : null;
}

function featureRegionKeys(features: GeoJsonFeature[]): Set<string> {
  return new Set(features.map((feature) => String(feature.properties.regionKey ?? '')).filter(Boolean));
}

function countFeaturesWithRegionKeyPrefix(features: GeoJsonFeature[], prefix: string): number {
  return features.filter((feature) => String(feature.properties.regionKey ?? '').startsWith(prefix)).length;
}

function admin1AreaRatio(countryCode: string, countryFeature: GeoJsonFeature | undefined, admin1Features: GeoJsonFeature[]): number | undefined {
  if (!countryFeature) return undefined;
  const countryArea = geometryApproxArea(countryFeature.geometry);
  if (countryArea <= 0) return undefined;
  const adminArea = admin1Features
    .filter((feature) => String(feature.properties.regionKey ?? '').startsWith(`admin1:${countryCode}.`))
    .reduce((sum, feature) => sum + geometryApproxArea(feature.geometry), 0);
  return Number((adminArea / countryArea).toFixed(3));
}

function worldCoverageSummary(
  profiles: CountryProfile[],
  countries: GeoBoundaryReport['countries'],
  countryFeatures: GeoJsonFeature[],
  admin1Features: GeoJsonFeature[]
): GeoBoundaryReport['worldCoverage'] {
  const expectedCountryCount = profiles.length;
  const expectedRegionCount = expectedCountryCount + countries.reduce((total, country) => total + country.admin1Expected, 0);
  const generatedCountries = new Set(
    countryFeatures
      .map((feature) => countryCodeFromRegionKey(String(feature.properties.regionKey ?? '')))
      .filter((countryCode): countryCode is string => Boolean(countryCode))
  );

  return {
    expectedCountryCount,
    generatedCountryCount: generatedCountries.size,
    expectedRegionCount,
    generatedRegionCount: countryFeatures.length + admin1Features.length
  };
}

function collectRequiredGeoFeatureFailures(report: GeoBoundaryReport, packagesByOutputPath: Map<string, GeoJsonFeature[]>, profiles: CountryProfile[]): string[] {
  const failures: string[] = [];
  const countryFeatures = packagesByOutputPath.get(geoCountryPath) ?? [];
  const c2Admin1Features = packagesByOutputPath.get(geoC2Admin1Path) ?? [];
  const c3Admin1Features = packagesByOutputPath.get(geoC3Admin1Path) ?? [];
  const c3Admin2Features = [...packagesByOutputPath.entries()]
    .filter(([packagePath]) => packagePath.startsWith(`${geoC3Admin2Dir}/`))
    .flatMap(([, features]) => features);
  const countryKeys = featureRegionKeys(countryFeatures);
  const c3Admin2Keys = featureRegionKeys(c3Admin2Features);

  if (report.worldCoverage.generatedCountryCount !== report.worldCoverage.expectedCountryCount) {
    failures.push(`world view generated ${report.worldCoverage.generatedCountryCount}/${report.worldCoverage.expectedCountryCount} countries`);
  }
  for (const profile of profiles) {
    const key = `country:${profile.countryCode}`;
    if (!countryKeys.has(key)) failures.push(`${geoCountryPath} lacks ${key}`);
  }

  for (const country of report.countries) {
    if (country.countryTier !== 'C1' && country.admin1Generated === 0) {
      failures.push(`${country.countryCode} ${country.countryTier} generated no admin1 boundary`);
    }
    if (typeof country.admin1CountryAreaRatio === 'number' && country.admin1CountryAreaRatio < 0.75) {
      failures.push(`${country.countryCode} admin1 area ratio too low: ${country.admin1CountryAreaRatio}`);
    }
    if (country.countryTier !== 'C3') continue;
    if (country.admin2Generated === 0) failures.push(`${country.countryCode} C3 generated no admin2 boundary`);
    const packagePath = `${geoC3Admin2Dir}/${country.countryCode}.geojson`;
    const hasCountryDetail = [...c3Admin2Keys].some((key) => key.startsWith(`admin2:${country.countryCode}.`) || key.startsWith(`boundary:${country.countryCode}.`));
    if (!hasCountryDetail) failures.push(`${packagePath} has no detail feature`);
  }

  // Keep package reads referenced so TS does not treat them as accidental dead state while validation evolves.
  void c2Admin1Features;
  return failures;
}

function roundCoordinates(value: unknown, precision: number): unknown {
  if (typeof value === 'number') return Number(value.toFixed(precision));
  if (Array.isArray(value)) return value.map((item) => roundCoordinates(item, precision));
  return value;
}

function quantizeFeature(feature: GeoJsonFeature, precision: number): GeoJsonFeature {
  return {
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: roundCoordinates(feature.geometry.coordinates, precision)
    }
  };
}

function featureCollectionContent(payload: FeatureCollection): string {
  return [
    '{',
    '  "type": "FeatureCollection",',
    '  "features": [',
    payload.features.map((feature, index) => {
      const suffix = index === payload.features.length - 1 ? '' : ',';
      return `    ${JSON.stringify(feature)}${suffix}`;
    }).join('\n'),
    '  ]',
    '}',
    ''
  ].join('\n');
}

async function writeGeoPackage(relativePath: string, features: GeoJsonFeature[], precision: number): Promise<GeoBoundaryReport['packages'][number]> {
  const filePath = path.join(rootDir, relativePath);
  const payload: FeatureCollection = { type: 'FeatureCollection', features: sortFeatures(features).map((feature) => quantizeFeature(feature, precision)) };
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, featureCollectionContent(payload));
  return {
    id: path.basename(relativePath, '.geojson'),
    outputPath: relativePath,
    featureCount: features.length
  };
}

function reportMarkdown(report: GeoBoundaryReport): string {
  const packageRows = report.packages.map((item) =>
    `| ${item.outputPath} | ${item.featureCount} |`
  ).join('\n');
  const countryRows = report.countries.map((item) =>
    `| ${item.countryCode} | ${item.countryTier} | ${item.admin1Generated}/${item.admin1Expected} | ${item.admin2Generated}/${item.admin2Expected} | ${item.admin1CountryAreaRatio ?? '-'} | ${item.sources.join(', ')} |`
  ).join('\n');

  return [
    '# 地图边界报告',
    '',
    `生成时间：\`${report.generatedAt}\``,
    `国家分层版本：\`${report.profileVersion}\``,
    '',
    '## 生成检查',
    '',
    report.validationFailures.length === 0
      ? '全部通过。'
      : report.validationFailures.map((item) => `- ${item}`).join('\n'),
    '',
    '## 全球视图覆盖',
    '',
    '| 预期国家 | 生成国家 | 预期 regionKey | 生成 regionKey |',
    '| ---: | ---: | ---: | ---: |',
    `| ${report.worldCoverage.expectedCountryCount} | ${report.worldCoverage.generatedCountryCount} | ${report.worldCoverage.expectedRegionCount} | ${report.worldCoverage.generatedRegionCount} |`,
    '',
    '## 边界包',
    '',
    '| 路径 | feature 数 |',
    '| --- | ---: |',
    packageRows || '| - | 0 |',
    '',
    '## 国家',
    '',
    '| 国家 | 档位 | admin1 | admin2 | admin1/国家面积比 | 来源 |',
    '| --- | --- | ---: | ---: | ---: | --- |',
    countryRows || '| - | - | 0/0 | 0/0 | - | - |'
  ].join('\n').replace(/\n+$/, '\n');
}

export async function runGenerateStaticGeo(): Promise<void> {
  await mkdir(rawDir, { recursive: true });
  await downloadFile(naturalEarthAdmin0Url, naturalEarthAdmin0Path);
  await downloadFile(naturalEarthAdmin0DetailedUrl, naturalEarthAdmin0DetailedPath);
  await downloadFile(naturalEarthAdmin0MapUnitsUrl, naturalEarthAdmin0MapUnitsPath);
  await downloadFile(naturalEarthAdmin1LowUrl, naturalEarthAdmin1LowPath);
  await downloadFile(naturalEarthAdmin1Url, naturalEarthAdmin1Path);

  const [profilesPayload, geoBoundarySourceSeed, naturalEarthAdmin0, naturalEarthAdmin0Detailed, naturalEarthAdmin0MapUnits, naturalEarthAdmin1Low, naturalEarthAdmin1] = await Promise.all([
    readCountryProfiles(),
    readYaml<GeoBoundarySourceSeed>(geoBoundarySourcesPath),
    parseShapefileZip(naturalEarthAdmin0Path),
    parseShapefileZip(naturalEarthAdmin0DetailedPath),
    parseShapefileZip(naturalEarthAdmin0MapUnitsPath),
    parseShapefileZip(naturalEarthAdmin1LowPath),
    parseShapefileZip(naturalEarthAdmin1Path)
  ]);

  const profiles = profilesPayload.profiles;
  const profileByCountry = new Map(profiles.map((profile) => [profile.countryCode, profile]));
  const detailedCountryCodes = new Set(profiles.filter((profile) => profile.detailedCoverage).map((profile) => profile.countryCode));
  const c3CountryCodes = new Set(profiles.filter((profile) => profile.detailedCoverage === 'admin2').map((profile) => profile.countryCode));
  const iso3ByCountry = naturalEarthIso3ByCountry([naturalEarthAdmin0Detailed, naturalEarthAdmin0MapUnits, naturalEarthAdmin0]);

  await rm(generatedGeoDir, { recursive: true, force: true });

  const countryFeatures: GeoJsonFeature[] = [];
  const c2Admin1Features: GeoJsonFeature[] = [];
  const c3Admin1Features: GeoJsonFeature[] = [];
  const countryReports: GeoBoundaryReport['countries'] = [];
  const packageFeaturesByOutputPath = new Map<string, GeoJsonFeature[]>();
  const admin1GeneratedByCountry = new Map<string, { features: GeoJsonFeature[]; sources: string[] }>();
  const countryFeaturesByCode = naturalEarthCountryFeaturesByCode([naturalEarthAdmin0, naturalEarthAdmin0Detailed, naturalEarthAdmin0MapUnits], naturalEarthAdmin0MapUnits, naturalEarthAdmin1, geoBoundarySourceSeed);
  const countryOutlineFeaturesByCode = naturalEarthCountryFeaturesByCode([naturalEarthAdmin0Detailed, naturalEarthAdmin0MapUnits, naturalEarthAdmin0], naturalEarthAdmin0MapUnits, naturalEarthAdmin1, geoBoundarySourceSeed);
  const chinaOutlineFeature = await chinaCountryOutlineFeature();
  if (chinaOutlineFeature) countryOutlineFeaturesByCode.set('CN', chinaOutlineFeature);

  countryFeatures.push(...sortFeatures(profiles.flatMap((profile): GeoJsonFeature[] => {
    if (profile.countryTier === 'C1') return [];
    const feature = countryOutlineFeaturesByCode.get(profile.countryCode);
    return feature ? [feature] : [];
  })));

  for (const profile of profiles) {
    if (profile.countryTier !== 'C1') continue;
    const feature = countryFeaturesByCode.get(profile.countryCode);
    if (feature) countryFeatures.push(feature);
  }

  for (const countryCode of [...detailedCountryCodes].sort()) {
    const profile = profileByCountry.get(countryCode);
    const generated = await admin1FeaturesForCountry(countryCode, naturalEarthAdmin1Low, naturalEarthAdmin1, iso3ByCountry);
    admin1GeneratedByCountry.set(countryCode, generated);
    if (profile?.detailedCoverage === 'admin2') c3Admin1Features.push(...generated.features);
    else c2Admin1Features.push(...generated.features);
  }

  async function writeTrackedGeoPackage(relativePath: string, features: GeoJsonFeature[], precision: number): Promise<GeoBoundaryReport['packages'][number]> {
    const sorted = sortFeatures(features);
    packageFeaturesByOutputPath.set(relativePath, sorted);
    return writeGeoPackage(relativePath, sorted, precision);
  }

  const report: GeoBoundaryReport = {
    generatedAt: new Date().toISOString(),
    profileVersion: profilesPayload.version ?? 'unknown',
    validationFailures: [],
    worldCoverage: {
      expectedCountryCount: 0,
      generatedCountryCount: 0,
      expectedRegionCount: 0,
      generatedRegionCount: 0
    },
    packages: [
      await writeTrackedGeoPackage(geoCountryPath, countryFeatures, 3),
      await writeTrackedGeoPackage(geoC2Admin1Path, c2Admin1Features, 3),
      await writeTrackedGeoPackage(geoC3Admin1Path, c3Admin1Features, 3)
    ],
    countries: []
  };

  for (const countryCode of [...c3CountryCodes].sort()) {
    const profile = profileByCountry.get(countryCode);
    const admin1Generated = admin1GeneratedByCountry.get(countryCode) ?? await admin1FeaturesForCountry(countryCode, naturalEarthAdmin1Low, naturalEarthAdmin1, iso3ByCountry);
    const admin2Generated = await admin2FeaturesForCountry(countryCode, geoBoundarySourceSeed, iso3ByCountry);
    report.packages.push(await writeTrackedGeoPackage(`${geoC3Admin2Dir}/${countryCode}.geojson`, admin2Generated.features, 3));
    countryReports.push({
      countryCode,
      countryTier: profile?.countryTier ?? 'C3',
      admin1Expected: admin1Generated.features.length,
      admin1Generated: admin1Generated.features.length,
      admin2Expected: admin2Generated.features.length,
      admin2Generated: admin2Generated.features.length,
      admin1CountryAreaRatio: admin1AreaRatio(countryCode, countryOutlineFeaturesByCode.get(countryCode), admin1Generated.features),
      boundaryOnlyGenerated: countFeaturesWithRegionKeyPrefix(admin2Generated.features, `boundary:${countryCode}.`),
      missingAdmin1: [],
      missingAdmin2: [],
      sources: [...new Set([...admin1Generated.sources, ...admin2Generated.sources])]
    });
  }

  for (const countryCode of [...detailedCountryCodes].filter((countryCode) => !c3CountryCodes.has(countryCode)).sort()) {
    const profile = profileByCountry.get(countryCode);
    const admin1Generated = admin1GeneratedByCountry.get(countryCode) ?? await admin1FeaturesForCountry(countryCode, naturalEarthAdmin1Low, naturalEarthAdmin1, iso3ByCountry);
    countryReports.push({
      countryCode,
      countryTier: profile?.countryTier ?? 'C2',
      admin1Expected: admin1Generated.features.length,
      admin1Generated: admin1Generated.features.length,
      admin2Expected: 0,
      admin2Generated: 0,
      admin1CountryAreaRatio: admin1AreaRatio(countryCode, countryOutlineFeaturesByCode.get(countryCode), admin1Generated.features),
      boundaryOnlyGenerated: 0,
      missingAdmin1: [],
      missingAdmin2: [],
      sources: admin1Generated.sources
    });
  }

  report.countries = countryReports.sort((left, right) => left.countryCode.localeCompare(right.countryCode));
  report.worldCoverage = worldCoverageSummary(profiles, report.countries, countryFeatures, [...c2Admin1Features, ...c3Admin1Features]);
  report.validationFailures = collectRequiredGeoFeatureFailures(report, packageFeaturesByOutputPath, profiles);
  await mkdir(reportDir, { recursive: true });
  await writeFile(path.join(reportDir, 'geo-boundary-report.md'), reportMarkdown(report));

  console.log(`Generated geo boundaries: ${report.packages.map((item) => `${item.outputPath}=${item.featureCount}`).join(', ')}.`);
  if (report.validationFailures.length > 0) {
    throw new Error(`Geo boundary coverage check failed after writing outputs:\n${report.validationFailures.join('\n')}`);
  }
}
