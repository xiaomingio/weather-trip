/**
 * 文件说明: 从公开低精度边界源生成前端地图使用的纯分块 GeoJSON 包。
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
import { isSupportedAdmin2, loadCoverageOverrides, type CoverageOverrideSeed } from '../static-data/coverage-overrides.js';
import { loadGeoNamesAdminDataset, type CountryInfo, type GeoNamesAdmin1, type GeoNamesAdmin2 } from '../static-data/geonames.js';

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

type BBox = [minLng: number, minLat: number, maxLng: number, maxLat: number];

type CountryProfile = {
  countryCode: string;
  countryTier: CountryTier;
  detailedCoverage?: 'admin1' | 'admin2';
};

type CountryProfilesPayload = {
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
    boundaryOnlyGenerated: number;
    missingAdmin1: string[];
    missingAdmin2: string[];
    sources: string[];
    admin2ByAdmin1?: Array<{
      admin1Code: string;
      admin1Name: string;
      generated: number;
      matchedAdmin2: number;
      boundaryOnly: number;
      boundaryOnlyRegions: Array<{
        regionKey: string;
        labelZh: string;
        labelEn: string;
      }>;
    }>;
  }>;
};

type Admin1SourceCandidate = {
  features: GeoJsonFeature[];
  missing: string[];
  source: string;
};

type RegionFeatureMetadata = {
  labelEn: string;
  labelZh: string;
};

const rootDir = process.cwd();
const rawDir = path.join(rootDir, 'data', 'raw', 'geo-boundaries');
const generatedDir = path.join(rootDir, 'data', 'generated');
const generatedGeoDir = path.join(generatedDir, 'geo');
const reportDir = path.join(rootDir, 'data', 'report');
const profilesPath = path.join(rootDir, 'data', 'generated', 'country-profiles.json');
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

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
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

function repairedMojibake(value: string): string | null {
  const repaired = Buffer.from(value, 'latin1').toString('utf8');
  if (repaired === value || repaired.includes('\uFFFD')) return null;
  return repaired;
}

function nameVariants(value: string): string[] {
  const repaired = repairedMojibake(value);
  const normalized = normalizeName(value);
  return [
    normalized,
    ...(repaired ? [normalizeName(repaired), ...repaired.split('/').map(normalizeName)] : []),
    ...value.split('/').map(normalizeName),
    normalized.replace(/\bprovince\b/g, ''),
    normalized.replace(/\bcity\b/g, ''),
    normalized.replace(/\bis\b/g, 'islands'),
    normalized.replace(/\band\b/g, ''),
    normalized.replace(/\bsouth pemba\b/g, 'pemba south'),
    normalized.replace(/\bpemba south\b/g, 'south pemba'),
    normalized.replace(/\bzanzibar south central\b/g, 'zanzibar central south'),
    normalized.replace(/\bzanzibar central south\b/g, 'zanzibar south central'),
    normalized.replace(/\bcastille\b/g, 'castilla'),
    normalized.replace(/\bcastille and leon\b/g, 'castilla leon'),
    normalized.replace(/\bcastilla y leon\b/g, 'castilla leon'),
    normalized.replace(/\bandalusia\b/g, 'andalucia'),
    normalized.replace(/\bbalearic\b/g, 'islas baleares'),
    normalized.replace(/\bbalearic islands\b/g, 'illes balears'),
    normalized.replace(/\bcanary\b/g, 'canarias'),
    normalized.replace(/\bcanary islands\b/g, 'canarias'),
    normalized.replace(/\blas palmas\b/g, 'palmas las'),
    normalized.replace(/\bpalmas las\b/g, 'las palmas'),
    normalized.replace(/\billes balears\b/g, 'balears illes'),
    normalized.replace(/\bbalears illes\b/g, 'illes balears'),
    normalized.replace(/\bcastellon\b/g, 'castello'),
    normalized.replace(/\bvalencia\b/g, 'valenciana'),
    normalized.replace(/\bvalencian community\b/g, 'valenciana'),
    normalized.replace(/\bnavarre\b/g, 'navarra'),
    normalized.replace(/\bbasque country\b/g, 'pais vasco'),
    normalized.replace(/\bcatalonia\b/g, 'cataluna'),
    normalized.replace(/\bthe marches\b/g, 'marche'),
    normalized.replace(/\bapulia\b/g, 'puglia'),
    normalized.replace(/\bpiedmont\b/g, 'piemonte'),
    normalized.replace(/\blombardy\b/g, 'lombardia'),
    normalized.replace(/\bsicily\b/g, 'sicilia'),
    normalized.replace(/\bsardinia\b/g, 'sardegna'),
    normalized.replace(/\btuscany\b/g, 'toscana'),
    normalized.replace(/\baosta valley\b/g, 'valle d aosta'),
    normalized.replace(/\bvalle aosta\b/g, 'aosta'),
    normalized.replace(/\baosta\b/g, 'valle aosta'),
    normalized.replace(/\baoste\b/g, 'aosta'),
    normalized.replace(/\bflorence\b/g, 'firenze'),
    normalized.replace(/\bfirenze\b/g, 'florence'),
    normalized.replace(/\brome\b/g, 'roma'),
    normalized.replace(/\broma capitale\b/g, 'roma'),
    normalized.replace(/\breggio emilia\b/g, 'reggio nell emilia'),
    normalized.replace(/\breggio nell emilia\b/g, 'reggio emilia'),
    normalized.replace(/\baquila\b/g, 'l aquila'),
    normalized.replace(/\bl aquila\b/g, 'aquila'),
    normalized.replace(/\bloir et cher\b/g, 'loire et cher'),
    normalized.replace(/\bupper garonne\b/g, 'haute garonne'),
    normalized.replace(/\bupper corsica\b/g, 'haute corse'),
    normalized.replace(/\bsouth corsica\b/g, 'corse du sud'),
    normalized.replace(/\btanger\b/g, 'tangier'),
    normalized.replace(/\btangier\b/g, 'tanger'),
    normalized.replace(/\bfes\b/g, 'fez'),
    normalized.replace(/\bfez\b/g, 'fes'),
    normalized.replace(/\bmarrakesh\b/g, 'marrakech'),
    normalized.replace(/\bmarrakech\b/g, 'marrakesh')
  ].map(normalizeName).filter((item, index, items) => item && items.indexOf(item) === index);
}

function normalizeChineseName(value: string): string {
  return value
    .replace(/省|市|特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区/g, '')
    .replace(/内蒙古/g, '内蒙古')
    .trim();
}

function validIsoA2(properties: Record<string, unknown>): string | null {
  const candidates = [properties.ISO_A2, properties.ISO_A2_EH, properties.WB_A2, properties.iso_a2];
  for (const value of candidates) {
    if (typeof value === 'string' && /^[A-Z]{2}$/.test(value)) return value;
  }
  return null;
}

function boundaryFeature(regionKey: string, geometry: GeoJsonGeometry, properties: Record<string, unknown> = {}): GeoJsonFeature {
  return {
    type: 'Feature',
    properties: { regionKey, ...properties },
    geometry
  };
}

function expandBBoxForCoordinate(bbox: BBox | null, coordinate: unknown): BBox | null {
  if (!Array.isArray(coordinate)) return bbox;
  if (typeof coordinate[0] === 'number' && typeof coordinate[1] === 'number') {
    const lng = coordinate[0];
    const lat = coordinate[1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return bbox;
    return bbox
      ? [Math.min(bbox[0], lng), Math.min(bbox[1], lat), Math.max(bbox[2], lng), Math.max(bbox[3], lat)]
      : [lng, lat, lng, lat];
  }
  return coordinate.reduce((current: BBox | null, item) => expandBBoxForCoordinate(current, item), bbox);
}

function geometryBBox(geometry: GeoJsonGeometry): BBox | null {
  return expandBBoxForCoordinate(null, geometry.coordinates);
}

function pointInBBox(point: [number, number], bbox: BBox, padding = 0): boolean {
  return point[0] >= bbox[0] - padding && point[0] <= bbox[2] + padding && point[1] >= bbox[1] - padding && point[1] <= bbox[3] + padding;
}

function pointCoveredByGeometry(point: [number, number], geometry: GeoJsonGeometry): boolean {
  if (pointInGeometry(point, geometry)) return true;
  const bbox = geometryBBox(geometry);
  return bbox ? pointInBBox(point, bbox, 0.15) : false;
}

function admin2Key(countryCode: string, admin1Code: string, admin2Code: string): string {
  return `${countryCode}.${admin1Code}.${admin2Code}`;
}

function pointInRing(point: [number, number], ring: unknown): boolean {
  if (!Array.isArray(ring)) return false;
  const [x, y] = point;
  let inside = false;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const current = ring[index];
    const previous = ring[previousIndex];
    if (!Array.isArray(current) || !Array.isArray(previous)) continue;
    const xi = Number(current[0]);
    const yi = Number(current[1]);
    const xj = Number(previous[0]);
    const yj = Number(previous[1]);
    if (!Number.isFinite(xi) || !Number.isFinite(yi) || !Number.isFinite(xj) || !Number.isFinite(yj)) continue;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: [number, number], polygon: unknown): boolean {
  if (!Array.isArray(polygon) || !pointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((ring) => pointInRing(point, ring));
}

function pointInGeometry(point: [number, number], geometry: GeoJsonGeometry): boolean {
  if (geometry.type === 'Polygon') return pointInPolygon(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  }
  return false;
}

function chinaBoundaryProperties(nameZh: string, nameEn: string): Record<string, unknown> {
  return {
    labelZh: normalizeChineseName(nameZh) || nameZh,
    labelEn: nameEn || normalizeChineseName(nameZh) || nameZh
  };
}

function boundaryLabelOverridesByKey(seed: CoverageOverrideSeed): Map<string, { zh: string; en: string }> {
  return new Map(
    (seed.boundaryLabelOverrides ?? []).map((item) => [
      `${item.countryCode}.${item.admin1Code}.${item.sourceAdcode}`,
      item.name
    ])
  );
}

function chinaAdmin2NameFromFeature(feature: GeoJsonFeature): string {
  return typeof feature.properties.name === 'string' ? feature.properties.name : '';
}

function chinaFeatureNameMatchesAdmin2(featureName: string, admin2: GeoNamesAdmin2): boolean {
  const normalizedFeatureName = normalizeChineseName(featureName);
  if (!normalizedFeatureName) return false;

  const admin2Names = [admin2.name, admin2.asciiName].map(normalizeChineseName);
  return admin2Names.includes(normalizedFeatureName);
}

function chinaCompanionAdmin1Key(countryCode: string): string {
  return `admin1:CN.${countryCode}`;
}

function chinaCompanionAdmin2Key(countryCode: string): string | null {
  const region = chinaCompanionRegions.find((item) => item.countryCode === countryCode);
  return region ? `admin2:CN.${region.admin1Code}.${region.admin2Code}` : null;
}

function sortFeatures(features: GeoJsonFeature[]): GeoJsonFeature[] {
  return [...features].sort((left, right) => String(left.properties.regionKey).localeCompare(String(right.properties.regionKey)));
}

function countFeaturesWithRegionKeyPrefix(features: GeoJsonFeature[], prefix: string): number {
  return features.filter((feature) => String(feature.properties.regionKey ?? '').startsWith(prefix)).length;
}

function countUniqueRegionKeysWithPrefix(features: GeoJsonFeature[], prefix: string): number {
  return new Set(features.map((feature) => String(feature.properties.regionKey ?? '')).filter((regionKey) => regionKey.startsWith(prefix))).size;
}

function admin2FeatureAuditByAdmin1(countryCode: string, admin1Items: GeoNamesAdmin1[], features: GeoJsonFeature[]): GeoBoundaryReport['countries'][number]['admin2ByAdmin1'] {
  const rows = admin1Items.map((admin1) => {
    const admin2Prefix = `admin2:${countryCode}.${admin1.admin1Code}.`;
    const boundaryPrefix = `boundary:${countryCode}.${admin1.admin1Code}.`;
    const scopedFeatures = features.filter((feature) => {
      const regionKey = String(feature.properties.regionKey ?? '');
      return regionKey.startsWith(admin2Prefix) || regionKey.startsWith(boundaryPrefix);
    });
    const boundaryOnlyRegions = scopedFeatures
      .filter((feature) => String(feature.properties.regionKey ?? '').startsWith(boundaryPrefix))
      .map((feature) => ({
        regionKey: String(feature.properties.regionKey ?? ''),
        labelZh: String(feature.properties.labelZh ?? ''),
        labelEn: String(feature.properties.labelEn ?? '')
      }));

    return {
      admin1Code: admin1.admin1Code,
      admin1Name: admin1.name,
      generated: scopedFeatures.length,
      matchedAdmin2: scopedFeatures.length - boundaryOnlyRegions.length,
      boundaryOnly: boundaryOnlyRegions.length,
      boundaryOnlyRegions
    };
  });

  return rows.filter((row) => row.generated > 0 || row.boundaryOnly > 0).sort((left, right) => left.admin1Code.localeCompare(right.admin1Code));
}

function boundaryAdmin2ItemsForCountry(countryCode: string, allAdmin2Items: GeoNamesAdmin2[], seed: CoverageOverrideSeed): GeoNamesAdmin2[] {
  const countryItems = allAdmin2Items.filter((admin2) => admin2.countryCode === countryCode);
  if (countryCode !== 'CN') return countryItems;
  return countryItems.filter((admin2) => isSupportedAdmin2(seed, admin2));
}

function geometryToMultiPolygon(geometry: GeoJsonGeometry): unknown[] {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) return geometry.coordinates;
  return [];
}

function groupedMultiPolygonFeature(regionKey: string, features: GeoJsonFeature[]): GeoJsonFeature | null {
  const coordinates = features.flatMap((feature) => geometryToMultiPolygon(feature.geometry));
  if (coordinates.length === 0) return null;
  return boundaryFeature(regionKey, { type: 'MultiPolygon', coordinates });
}

function buildAdminIndex<T extends GeoNamesAdmin1 | GeoNamesAdmin2>(items: T[]): Map<string, T> {
  const index = new Map<string, T>();
  for (const item of items) {
    for (const variant of [...nameVariants(item.asciiName), ...nameVariants(item.name)]) {
      index.set(variant, item);
    }
  }
  return index;
}

function naturalEarthAdmin1FeaturesForCountry(countryCode: string, naturalEarthAdmin1: FeatureCollection): GeoJsonFeature[] {
  return naturalEarthAdmin1.features.filter((feature) => feature.properties.iso_a2 === countryCode);
}

function naturalEarthAdmin1FeaturesByGeoNamesAdmin1Id(countryCode: string, admin1Items: GeoNamesAdmin1[], naturalEarthAdmin1: FeatureCollection): GeoJsonFeature[] {
  const admin1ByGeoNameId = new Map(admin1Items.map((item) => [item.geonameId, item]));
  const featuresByKey = new Map<string, GeoJsonFeature>();
  for (const feature of naturalEarthAdmin1FeaturesForCountry(countryCode, naturalEarthAdmin1)) {
    const admin1 = admin1ByGeoNameId.get(Number(feature.properties.gn_id));
    if (!admin1) continue;
    const key = `admin1:${countryCode}.${admin1.admin1Code}`;
    if (!featuresByKey.has(key)) featuresByKey.set(key, boundaryFeature(key, feature.geometry));
  }
  return sortFeatures([...featuresByKey.values()]);
}

function naturalEarthAdmin1FeaturesByGeoNamesAdmin1Code(countryCode: string, admin1Items: GeoNamesAdmin1[], naturalEarthAdmin1: FeatureCollection): GeoJsonFeature[] {
  const admin1Codes = new Set(admin1Items.map((item) => item.admin1Code));
  const featuresByKey = new Map<string, GeoJsonFeature>();
  for (const feature of naturalEarthAdmin1FeaturesForCountry(countryCode, naturalEarthAdmin1)) {
    const code = typeof feature.properties.gn_a1_code === 'string' ? feature.properties.gn_a1_code.split('.')[1] : null;
    if (!code || !admin1Codes.has(code)) continue;
    const key = `admin1:${countryCode}.${code}`;
    if (!featuresByKey.has(key)) featuresByKey.set(key, boundaryFeature(key, feature.geometry));
  }
  return sortFeatures([...featuresByKey.values()]);
}

function groupedAdmin1FeaturesByAdmin2Id(countryCode: string, sourceFeatures: GeoJsonFeature[], admin2Items: GeoNamesAdmin2[]): GeoJsonFeature[] {
  const admin2ByGeoNameId = new Map(admin2Items.map((item) => [item.geonameId, item]));
  const grouped = new Map<string, GeoJsonFeature[]>();
  for (const feature of sourceFeatures) {
    const admin2 = admin2ByGeoNameId.get(Number(feature.properties.gn_id));
    if (!admin2) continue;
    const key = `admin1:${countryCode}.${admin2.admin1Code}`;
    const list = grouped.get(key) ?? [];
    list.push(feature);
    grouped.set(key, list);
  }

  return sortFeatures([...grouped.entries()].flatMap(([regionKey, features]) => {
    const feature = groupedMultiPolygonFeature(regionKey, features);
    return feature ? [feature] : [];
  }));
}

function appendNaturalEarthCountryAdmin1Units(featuresByCode: Map<string, GeoJsonFeature>, admin1Units: FeatureCollection, seed: GeoBoundarySourceSeed): void {
  for (const config of seed.naturalEarthCountryAdmin1Units ?? []) {
    const sourceIso3166Codes = new Set(config.sourceIso3166Codes);
    const features = admin1Units.features.filter((feature) => {
      const iso3166Code = typeof feature.properties.iso_3166_2 === 'string' ? feature.properties.iso_3166_2 : '';
      return sourceIso3166Codes.has(iso3166Code);
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

function naturalEarthCountryOutlineFeaturesByCode(sources: FeatureCollection[], mapUnits: FeatureCollection, admin1Units: FeatureCollection, seed: GeoBoundarySourceSeed): Map<string, GeoJsonFeature> {
  const featuresByCode = new Map<string, GeoJsonFeature>();
  for (const source of sources) {
    const sourceFeaturesByCode = new Map<string, GeoJsonFeature[]>();
    for (const feature of source.features) {
      const countryCode = validIsoA2(feature.properties);
      if (!countryCode || featuresByCode.has(countryCode)) continue;
      const features = sourceFeaturesByCode.get(countryCode) ?? [];
      features.push(feature);
      sourceFeaturesByCode.set(countryCode, features);
    }
    for (const [countryCode, features] of sourceFeaturesByCode) {
      const feature = groupedMultiPolygonFeature(`country:${countryCode}`, features);
      if (feature && !featuresByCode.has(countryCode)) featuresByCode.set(countryCode, feature);
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

function detailedCountryOutlineFeatures(profiles: CountryProfile[], countryOutlineFeaturesByCode: Map<string, GeoJsonFeature>): GeoJsonFeature[] {
  return sortFeatures(profiles.flatMap((profile): GeoJsonFeature[] => {
    if (profile.countryTier !== 'C1') {
      const feature = countryOutlineFeaturesByCode.get(profile.countryCode);
      return feature ? [feature] : [];
    }
    return [];
  }));
}

async function chinaCountryOutlineFeature(): Promise<GeoJsonFeature | null> {
  const china = await downloadJson(`${datavChinaUrl}/100000.json`, path.join(rawDir, 'datav-cn-100000.geojson'));
  const feature = china.features.find((item) => Number(item.properties.adcode) === 100000);
  return feature ? boundaryFeature('country:CN', feature.geometry) : null;
}

function geoBoundariesIso3ByCountry(countries: Map<string, CountryInfo>): Map<string, string> {
  return new Map([...countries.values()].map((country) => [country.code, country.iso3]));
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

function matchedGeoBoundariesFeatures(
  source: FeatureCollection,
  items: Array<GeoNamesAdmin1 | GeoNamesAdmin2>,
  regionKeyForItem: (item: GeoNamesAdmin1 | GeoNamesAdmin2) => string
): { features: GeoJsonFeature[]; missing: string[] } {
  const index = buildAdminIndex(items);
  const used = new Set<string>();
  const features: GeoJsonFeature[] = [];

  for (const feature of source.features) {
    const shapeName = typeof feature.properties.shapeName === 'string' ? feature.properties.shapeName : '';
    const matched = nameVariants(shapeName).map((variant) => index.get(variant)).find(Boolean);
    if (!matched) continue;
    const regionKey = regionKeyForItem(matched);
    if (used.has(regionKey)) continue;
    used.add(regionKey);
    features.push(boundaryFeature(regionKey, feature.geometry));
  }

  const expectedKeys = items.map(regionKeyForItem);
  return {
    features: sortFeatures(features),
    missing: expectedKeys.filter((key) => !used.has(key))
  };
}

function matchedGeoBoundariesAdmin2Features(
  countryCode: string,
  source: FeatureCollection,
  admin2Items: GeoNamesAdmin2[]
): { features: GeoJsonFeature[]; missing: string[] } {
  const index = buildAdminIndex(admin2Items);
  const usedGeoNamesKeys = new Set<string>();
  const features: GeoJsonFeature[] = [];

  for (const feature of source.features) {
    const shapeName = typeof feature.properties.shapeName === 'string' ? feature.properties.shapeName : '';
    const matched = nameVariants(shapeName).map((variant) => index.get(variant) as GeoNamesAdmin2 | undefined).find(Boolean);
    if (!matched) continue;

    const geoNamesKey = admin2Key(countryCode, matched.admin1Code, matched.admin2Code);
    if (usedGeoNamesKeys.has(geoNamesKey)) continue;
    usedGeoNamesKeys.add(geoNamesKey);

    features.push(boundaryFeature(`admin2:${geoNamesKey}`, feature.geometry, {
      labelEn: matched.asciiName || matched.name || shapeName,
      labelZh: matched.name || matched.asciiName || shapeName
    }));
  }

  const expectedKeys = admin2Items.map((admin2) => admin2Key(admin2.countryCode, admin2.admin1Code, admin2.admin2Code));
  return {
    features: sortFeatures(features),
    missing: expectedKeys.filter((key) => !usedGeoNamesKeys.has(key)).map((key) => `admin2:${key}`)
  };
}

function admin2MatchesFromGeoBoundaries(countryCode: string, source: FeatureCollection, admin2Items: GeoNamesAdmin2[]): Array<{ admin2: GeoNamesAdmin2; feature: GeoJsonFeature }> {
  const index = buildAdminIndex(admin2Items);
  const used = new Set<string>();
  const matches: Array<{ admin2: GeoNamesAdmin2; feature: GeoJsonFeature }> = [];

  for (const feature of source.features) {
    const shapeName = typeof feature.properties.shapeName === 'string' ? feature.properties.shapeName : '';
    const matched = nameVariants(shapeName).map((variant) => index.get(variant) as GeoNamesAdmin2 | undefined).find(Boolean);
    if (!matched) continue;
    const key = `admin2:${countryCode}.${matched.admin1Code}.${matched.admin2Code}`;
    if (used.has(key)) continue;
    used.add(key);
    matches.push({ admin2: matched, feature });
  }

  return matches;
}

function compositeAdmin1FeaturesFromSource(countryCode: string, source: FeatureCollection, admin2Items: GeoNamesAdmin2[]): GeoJsonFeature[] {
  const grouped = new Map<string, GeoJsonFeature[]>();
  for (const match of admin2MatchesFromGeoBoundaries(countryCode, source, admin2Items)) {
    const key = `admin1:${countryCode}.${match.admin2.admin1Code}`;
    const list = grouped.get(key) ?? [];
    list.push(match.feature);
    grouped.set(key, list);
  }

  return sortFeatures([...grouped.entries()].flatMap(([regionKey, features]) => {
    const feature = groupedMultiPolygonFeature(regionKey, features);
    return feature ? [feature] : [];
  }));
}

function admin1MissingKeys(countryCode: string, admin1Items: GeoNamesAdmin1[], features: GeoJsonFeature[]): string[] {
  const keys = featureRegionKeys(features);
  return admin1Items.map((item) => `admin1:${countryCode}.${item.admin1Code}`).filter((key) => !keys.has(key));
}

function admin1SourceCandidate(countryCode: string, admin1Items: GeoNamesAdmin1[], features: GeoJsonFeature[], source: string): Admin1SourceCandidate {
  return {
    features: sortFeatures(features),
    missing: admin1MissingKeys(countryCode, admin1Items, features),
    source
  };
}

function chooseAdmin1SourceCandidate(countryCode: string, admin1Items: GeoNamesAdmin1[], candidates: Admin1SourceCandidate[]): Admin1SourceCandidate {
  const uniqueCandidates = candidates.filter((candidate) => candidate.features.length > 0);
  if (uniqueCandidates.length === 0) return admin1SourceCandidate(countryCode, admin1Items, [], 'none');

  const expectedCount = admin1Items.length;
  const scored = uniqueCandidates.map((candidate) => ({
    candidate,
    generated: expectedCount - candidate.missing.length
  }));
  scored.sort((left, right) =>
    right.generated - left.generated ||
    left.candidate.source.localeCompare(right.candidate.source)
  );

  return scored[0].candidate;
}

function admin1SourceCandidateIsComplete(candidate: Admin1SourceCandidate, admin1Items: GeoNamesAdmin1[]): boolean {
  return candidate.missing.length === 0 && candidate.features.length === admin1Items.length;
}

function mergedAdmin1SourceCandidate(countryCode: string, admin1Items: GeoNamesAdmin1[], candidates: Admin1SourceCandidate[]): Admin1SourceCandidate {
  const best = chooseAdmin1SourceCandidate(countryCode, admin1Items, candidates);
  const featuresByKey = new Map(best.features.map((feature) => [String(feature.properties.regionKey ?? ''), feature]));
  const sources = new Set<string>([best.source]);

  for (const key of best.missing) {
    const filler = candidates.find((candidate) => candidate.features.some((feature) => String(feature.properties.regionKey ?? '') === key));
    const feature = filler?.features.find((item) => String(item.properties.regionKey ?? '') === key);
    if (!feature) continue;
    featuresByKey.set(key, feature);
    sources.add(filler.source);
  }

  const features = sortFeatures([...featuresByKey.values()]);
  return {
    features,
    missing: admin1MissingKeys(countryCode, admin1Items, features),
    source: [...sources].join(' + ')
  };
}

function chinaAmapAdmin1Assignments(china: FeatureCollection, admin1Items: GeoNamesAdmin1[]): Array<{ adcode: number; admin1: GeoNamesAdmin1; feature: GeoJsonFeature }> {
  const admin1ByCode = new Map(admin1Items.map((item) => [item.admin1Code, item]));
  const result: Array<{ adcode: number; admin1: GeoNamesAdmin1; feature: GeoJsonFeature }> = [];
  for (const feature of china.features) {
    const adcode = Number(feature.properties.adcode);
    const admin1Code = Number.isFinite(adcode) ? chinaAmapAdmin1CodeByAdcode.get(adcode) : undefined;
    const admin1 = admin1Code ? admin1ByCode.get(admin1Code) : undefined;
    if (Number.isFinite(adcode) && admin1) result.push({ adcode, admin1, feature });
  }
  return result;
}

async function chinaAmapAdmin1Map(admin1Items: GeoNamesAdmin1[]): Promise<Map<number, GeoNamesAdmin1>> {
  const china = await downloadJson(`${datavChinaUrl}/100000_full.json`, path.join(rawDir, 'datav-cn-100000-full.geojson'));
  return new Map(chinaAmapAdmin1Assignments(china, admin1Items).map((item) => [item.adcode, item.admin1]));
}

async function chinaCompanionAdmin1Features(): Promise<GeoJsonFeature[]> {
  const output: GeoJsonFeature[] = [];
  for (const region of chinaCompanionRegions) {
    const suffix = region.source === 'full' ? '_full' : '';
    const source = await downloadJson(
      `${datavChinaUrl}/${region.adcode}${suffix}.json`,
      path.join(rawDir, `datav-cn-${region.adcode}${suffix}.geojson`)
    );
    const feature = groupedMultiPolygonFeature(chinaCompanionAdmin1Key(region.countryCode), source.features);
    if (feature) {
      output.push({
        ...feature,
        properties: {
          ...feature.properties,
          ...chinaBoundaryProperties(region.nameZh, region.nameEn)
        }
      });
    }
  }
  return sortFeatures(output);
}

async function chinaAdmin1Features(admin1Items: GeoNamesAdmin1[]): Promise<{ features: GeoJsonFeature[]; missing: string[]; sources: string[] }> {
  const china = await downloadJson(`${datavChinaUrl}/100000_full.json`, path.join(rawDir, 'datav-cn-100000-full.geojson'));
  const mainlandFeatures = chinaAmapAdmin1Assignments(china, admin1Items).map(({ admin1, feature }) =>
    boundaryFeature(`admin1:CN.${admin1.admin1Code}`, feature.geometry)
  );
  const features = sortFeatures([...mainlandFeatures, ...await chinaCompanionAdmin1Features()]);
  return {
    features,
    missing: admin1MissingKeys('CN', admin1Items, mainlandFeatures),
    sources: ['DataV/高德（Amap） province and Hong Kong/Macau/Taiwan admin1 boundary converted by adcode']
  };
}

async function chinaAdmin2Features(
  admin1Items: GeoNamesAdmin1[],
  admin2Items: GeoNamesAdmin2[],
  boundaryLabelsByKey: Map<string, { zh: string; en: string }>
): Promise<{ features: GeoJsonFeature[]; missing: string[] }> {
  const amapAdmin1ByAdcode = await chinaAmapAdmin1Map(admin1Items);
  const admin2ByKey = new Map(admin2Items.map((item) => [`${item.admin1Code}.${item.admin2Code}`, item]));
  const used = new Set<string>();
  const output: GeoJsonFeature[] = [];

  for (const [provinceAdcode, admin1] of amapAdmin1ByAdcode) {
    const provinceAdmin2 = admin2Items.filter((item) => item.admin1Code === admin1.admin1Code);
    if (provinceAdmin2.length === 1 && !/^[0-9]{4}$/.test(provinceAdmin2[0].admin2Code)) {
      const china = await downloadJson(`${datavChinaUrl}/100000_full.json`, path.join(rawDir, 'datav-cn-100000-full.geojson'));
      const provinceFeature = china.features.find((feature) => Number(feature.properties.adcode) === provinceAdcode);
      if (provinceFeature) {
        const featureName = chinaAdmin2NameFromFeature(provinceFeature);
        const key = `admin2:CN.${admin1.admin1Code}.${provinceAdmin2[0].admin2Code}`;
        output.push(boundaryFeature(key, provinceFeature.geometry, chinaBoundaryProperties(featureName, provinceAdmin2[0].asciiName)));
        used.add(key);
      }
      continue;
    }

    const province = await downloadJson(`${datavChinaUrl}/${provinceAdcode}_full.json`, path.join(rawDir, `datav-cn-${provinceAdcode}-full.geojson`));
    for (const feature of province.features) {
      const adcode = Number(feature.properties.adcode);
      if (!Number.isFinite(adcode)) continue;
      const featureName = chinaAdmin2NameFromFeature(feature);
      const admin2Code = String(Math.trunc(adcode / 100));
      const boundaryLabel = boundaryLabelsByKey.get(`CN.${admin1.admin1Code}.${adcode}`);
      const admin2 =
        admin2ByKey.get(`${admin1.admin1Code}.${admin2Code}`) ??
        provinceAdmin2.find((item) => !used.has(`admin2:CN.${item.admin1Code}.${item.admin2Code}`) && chinaFeatureNameMatchesAdmin2(featureName, item));
      if (!admin2) {
        const boundaryKey = `boundary:CN.${admin1.admin1Code}.${adcode}`;
        output.push(boundaryFeature(boundaryKey, feature.geometry, chinaBoundaryProperties(boundaryLabel?.zh ?? featureName, boundaryLabel?.en ?? featureName)));
        continue;
      }
      const key = `admin2:CN.${admin1.admin1Code}.${admin2.admin2Code}`;
      if (used.has(key)) {
        output.push(boundaryFeature(
          `boundary:CN.${admin1.admin1Code}.${adcode}`,
          feature.geometry,
          chinaBoundaryProperties(boundaryLabel?.zh ?? featureName, boundaryLabel?.en ?? featureName)
        ));
        continue;
      }
      output.push(boundaryFeature(key, feature.geometry, chinaBoundaryProperties(featureName, admin2.asciiName)));
      used.add(key);
    }
  }

  const expectedKeys = admin2Items.map((item) => `admin2:CN.${item.admin1Code}.${item.admin2Code}`);
  return {
    features: sortFeatures(output),
    missing: expectedKeys.filter((key) => !used.has(key))
  };
}

async function chinaCompanionRegionFeatures(): Promise<GeoJsonFeature[]> {
  const output: GeoJsonFeature[] = [];

  for (const region of chinaCompanionRegions) {
    const suffix = region.source === 'full' ? '_full' : '';
    const source = await downloadJson(
      `${datavChinaUrl}/${region.adcode}${suffix}.json`,
      path.join(rawDir, `datav-cn-${region.adcode}${suffix}.geojson`)
    );
    const parentFeature = groupedMultiPolygonFeature(chinaCompanionAdmin1Key(region.countryCode), source.features);
    if (parentFeature) {
      output.push({
        ...parentFeature,
        properties: {
          ...parentFeature.properties,
          ...chinaBoundaryProperties(region.nameZh, region.nameEn)
        }
      });
    }

    const admin2Key = chinaCompanionAdmin2Key(region.countryCode);
    if (!admin2Key) continue;
    for (const feature of source.features) {
      output.push(boundaryFeature(admin2Key, feature.geometry, chinaBoundaryProperties(region.nameZh, region.nameEn)));
    }
  }

  return sortFeatures(output);
}

async function admin1FeaturesForCountry(
  countryCode: string,
  admin1Items: GeoNamesAdmin1[],
  admin2Items: GeoNamesAdmin2[],
  naturalEarthAdmin1Low: FeatureCollection,
  naturalEarthAdmin1: FeatureCollection,
  iso3ByCountry: Map<string, string>
): Promise<{ features: GeoJsonFeature[]; missing: string[]; sources: string[] }> {
  if (countryCode === 'CN') return chinaAdmin1Features(admin1Items);

  const naturalEarth10mFeatures = naturalEarthAdmin1FeaturesForCountry(countryCode, naturalEarthAdmin1);
  const naturalEarth50mFeatures = naturalEarthAdmin1FeaturesForCountry(countryCode, naturalEarthAdmin1Low);
  const candidates: Admin1SourceCandidate[] = [
    admin1SourceCandidate(countryCode, admin1Items, naturalEarthAdmin1FeaturesByGeoNamesAdmin1Id(countryCode, admin1Items, naturalEarthAdmin1), 'Natural Earth 10m admin1 gn_id -> GeoNames admin1'),
    admin1SourceCandidate(countryCode, admin1Items, naturalEarthAdmin1FeaturesByGeoNamesAdmin1Id(countryCode, admin1Items, naturalEarthAdmin1Low), 'Natural Earth 50m admin1 gn_id -> GeoNames admin1'),
    admin1SourceCandidate(countryCode, admin1Items, groupedAdmin1FeaturesByAdmin2Id(countryCode, naturalEarth10mFeatures, admin2Items), 'Natural Earth 10m admin1 gn_id -> GeoNames admin2 grouped to admin1'),
    admin1SourceCandidate(countryCode, admin1Items, groupedAdmin1FeaturesByAdmin2Id(countryCode, naturalEarth50mFeatures, admin2Items), 'Natural Earth 50m admin1 gn_id -> GeoNames admin2 grouped to admin1')
  ];
  const localBest = chooseAdmin1SourceCandidate(countryCode, admin1Items, candidates);
  if (admin1SourceCandidateIsComplete(localBest, admin1Items)) {
    return {
      features: localBest.features,
      missing: localBest.missing,
      sources: [localBest.source]
    };
  }

  const geoBoundariesAdm1 = await geoBoundariesPackage(countryCode, 'ADM1', iso3ByCountry);
  if (geoBoundariesAdm1) {
    const matched = matchedGeoBoundariesFeatures(geoBoundariesAdm1, admin1Items, (item) => `admin1:${countryCode}.${(item as GeoNamesAdmin1).admin1Code}`);
    candidates.push(admin1SourceCandidate(countryCode, admin1Items, matched.features, 'geoBoundaries gbOpen ADM1 simplified shapeName -> GeoNames admin1'));
  }

  const sourceLevel: Extract<GeoBoundarySourceLevel, 'ADM2'> = 'ADM2';
  const source = await geoBoundariesPackage(countryCode, sourceLevel, iso3ByCountry);
  if (source) {
    const composite = compositeAdmin1FeaturesFromSource(countryCode, source, admin2Items);
    candidates.push(admin1SourceCandidate(countryCode, admin1Items, composite, `geoBoundaries gbOpen ${sourceLevel} shapeName -> GeoNames admin2 grouped to admin1`));
  }

  candidates.push(admin1SourceCandidate(countryCode, admin1Items, naturalEarthAdmin1FeaturesByGeoNamesAdmin1Code(countryCode, admin1Items, naturalEarthAdmin1), 'Natural Earth 10m admin1 gn_a1_code fallback'));
  candidates.push(admin1SourceCandidate(countryCode, admin1Items, naturalEarthAdmin1FeaturesByGeoNamesAdmin1Code(countryCode, admin1Items, naturalEarthAdmin1Low), 'Natural Earth 50m admin1 gn_a1_code fallback'));

  const merged = mergedAdmin1SourceCandidate(countryCode, admin1Items, candidates);
  return {
    features: merged.features,
    missing: merged.missing,
    sources: [merged.source]
  };
}

async function admin2FeaturesForCountry(
  countryCode: string,
  admin1Items: GeoNamesAdmin1[],
  admin2Items: GeoNamesAdmin2[],
  boundaryLabelsByKey: Map<string, { zh: string; en: string }>,
  seed: GeoBoundarySourceSeed,
  iso3ByCountry: Map<string, string>
): Promise<{ features: GeoJsonFeature[]; missing: string[]; sources: string[] }> {
  if (countryCode === 'CN') {
    const matched = await chinaAdmin2Features(admin1Items, admin2Items, boundaryLabelsByKey);
    const companionFeatures = await chinaCompanionRegionFeatures();
    return {
      ...matched,
      features: sortFeatures([...matched.features, ...companionFeatures]),
      sources: ['DataV/高德（Amap） province full boundary converted by adcode', 'DataV/高德（Amap） Hong Kong/Macau/Taiwan detail boundary']
    };
  }

  const sourceLevel = geoBoundariesCountryDetailSource(seed, countryCode)?.admin2SourceLevel ?? 'ADM2';
  const geoBoundaries = await geoBoundariesPackage(countryCode, sourceLevel, iso3ByCountry);
  if (!geoBoundaries) {
    return {
      features: [],
      missing: admin2Items.map((item) => `admin2:${countryCode}.${item.admin1Code}.${item.admin2Code}`),
      sources: []
    };
  }

  return { ...matchedGeoBoundariesAdmin2Features(countryCode, geoBoundaries, admin2Items), sources: [`geoBoundaries gbOpen ${sourceLevel} simplified`] };
}

function featureRegionKeys(features: GeoJsonFeature[]): Set<string> {
  return new Set(features.map((feature) => String(feature.properties.regionKey ?? '')).filter(Boolean));
}

function regionFeatureMetadata(admin1Items: GeoNamesAdmin1[], admin2Items: GeoNamesAdmin2[]): Map<string, RegionFeatureMetadata> {
  const metadata = new Map<string, RegionFeatureMetadata>();

  for (const admin1 of admin1Items) {
    const key = `admin1:${admin1.countryCode}.${admin1.admin1Code}`;
    metadata.set(key, {
      labelEn: admin1.asciiName || admin1.name,
      labelZh: admin1.name || admin1.asciiName
    });
  }

  for (const admin2 of admin2Items) {
    const key = `admin2:${admin2.countryCode}.${admin2.admin1Code}.${admin2.admin2Code}`;
    metadata.set(key, {
      labelEn: admin2.asciiName || admin2.name,
      labelZh: admin2.name || admin2.asciiName
    });
  }

  return metadata;
}

function annotateRegionFeatures(features: GeoJsonFeature[], metadataByKey: Map<string, RegionFeatureMetadata>): GeoJsonFeature[] {
  return features.map((feature) => {
    const regionKey = String(feature.properties.regionKey ?? '');
    const metadata = metadataByKey.get(regionKey);
    if (!metadata) return feature;

    return {
      ...feature,
      properties: {
        ...feature.properties,
        labelEn: typeof feature.properties.labelEn === 'string' ? feature.properties.labelEn : metadata.labelEn,
        labelZh: typeof feature.properties.labelZh === 'string' ? feature.properties.labelZh : metadata.labelZh
      }
    };
  });
}

function countryCodeFromRegionKey(regionKey: string): string | null {
  const match = /^(?:country|admin1|admin2|boundary):([A-Z]{2})(?:\.|$)/.exec(regionKey);
  return match ? match[1] : null;
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
  const admin1Features = [...c2Admin1Features, ...c3Admin1Features];
  const admin1Keys = featureRegionKeys(admin1Features);
  const c3Admin2Keys = featureRegionKeys(c3Admin2Features);

  if (report.worldCoverage.generatedCountryCount !== report.worldCoverage.expectedCountryCount) {
    failures.push(`world view generated ${report.worldCoverage.generatedCountryCount}/${report.worldCoverage.expectedCountryCount} countries`);
  }
  if (report.worldCoverage.generatedRegionCount !== report.worldCoverage.expectedRegionCount) {
    failures.push(`world view generated ${report.worldCoverage.generatedRegionCount}/${report.worldCoverage.expectedRegionCount} regionKeys`);
  }

  for (const profile of profiles) {
    const key = `country:${profile.countryCode}`;
    if (!countryKeys.has(key)) failures.push(`${geoCountryPath} lacks ${key}`);
  }

  for (const country of report.countries) {
    if (country.missingAdmin1.length > 0 || country.admin1Generated !== country.admin1Expected) {
      failures.push(`${country.countryCode} ${country.countryTier} admin1 package missing admin1: ${country.missingAdmin1.join(', ') || `${country.admin1Generated}/${country.admin1Expected}`}`);
    }
    for (const missing of country.missingAdmin1) {
      if (!admin1Keys.has(missing)) failures.push(`${country.countryCode} admin1 package lacks ${missing}`);
    }

    if (country.countryTier !== 'C3') continue;
    if (country.missingAdmin2.length > 0 || country.admin2Generated !== country.admin2Expected) {
      failures.push(`${country.countryCode} C3 detail view missing admin2: ${country.missingAdmin2.join(', ') || `${country.admin2Generated}/${country.admin2Expected}`}`);
    }
    for (const key of country.missingAdmin2) {
      if (!c3Admin2Keys.has(key)) failures.push(`${country.countryCode} ${geoC3Admin2Dir}/${country.countryCode}.geojson lacks ${key}`);
    }
  }

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

async function writeGeoPackage(relativePath: string, features: GeoJsonFeature[], precision: number): Promise<GeoBoundaryReport['packages'][number]> {
  const filePath = path.join(rootDir, relativePath);
  const payload: FeatureCollection = { type: 'FeatureCollection', features: sortFeatures(features).map((feature) => quantizeFeature(feature, precision)) };
  const content = `${JSON.stringify(payload, null, 2)}\n`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
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
    `| ${item.countryCode} | ${item.countryTier} | ${item.admin1Generated}/${item.admin1Expected} | ${item.admin2Generated}/${item.admin2Expected} | ${item.boundaryOnlyGenerated} | ${item.sources.join(', ')} | ${item.missingAdmin1.length} | ${item.missingAdmin2.length} |`
  ).join('\n');
  const admin2AuditSections = report.countries.flatMap((country) => {
    if (!country.admin2ByAdmin1?.length) return [];
    const rows = country.admin2ByAdmin1.map((item) => {
      const boundaryOnlyRegions = item.boundaryOnlyRegions.map((region) => `${region.labelZh || region.labelEn} (${region.regionKey})`).join('<br>') || '-';
      return `| ${item.admin1Code} | ${item.admin1Name} | ${item.generated} | ${item.matchedAdmin2} | ${item.boundaryOnly} | ${boundaryOnlyRegions} |`;
    }).join('\n');
    return [
      `## ${country.countryCode} admin2 审计`,
      '',
      '| admin1 code | admin1 名称 | 生成数量 | 匹配 admin2 | 仅边界 | 仅边界区域 |',
      '| --- | --- | ---: | ---: | ---: | --- |',
      rows,
      ''
    ];
  });

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
    '| 国家 | 档位 | admin1 | admin2 | 仅边界 | 来源 | 缺 admin1 | 缺 admin2 |',
    '| --- | --- | ---: | ---: | ---: | --- | ---: | ---: |',
    countryRows || '| - | - | 0/0 | 0/0 | 0 | - | 0 | 0 |',
    '',
    ...admin2AuditSections
  ].join('\n').replace(/\n+$/, '\n');
}

export async function runGenerateStaticGeo(): Promise<void> {
await mkdir(rawDir, { recursive: true });
await downloadFile(naturalEarthAdmin0Url, naturalEarthAdmin0Path);
await downloadFile(naturalEarthAdmin0DetailedUrl, naturalEarthAdmin0DetailedPath);
await downloadFile(naturalEarthAdmin0MapUnitsUrl, naturalEarthAdmin0MapUnitsPath);
await downloadFile(naturalEarthAdmin1LowUrl, naturalEarthAdmin1LowPath);
await downloadFile(naturalEarthAdmin1Url, naturalEarthAdmin1Path);

const [profilesPayload, overrideSeed, geoBoundarySourceSeed, dataset, naturalEarthAdmin0, naturalEarthAdmin0Detailed, naturalEarthAdmin0MapUnits, naturalEarthAdmin1Low, naturalEarthAdmin1] = await Promise.all([
  readJson<CountryProfilesPayload>(profilesPath),
  loadCoverageOverrides(rootDir),
  readYaml<GeoBoundarySourceSeed>(geoBoundarySourcesPath),
  loadGeoNamesAdminDataset(rootDir),
  parseShapefileZip(naturalEarthAdmin0Path),
  parseShapefileZip(naturalEarthAdmin0DetailedPath),
  parseShapefileZip(naturalEarthAdmin0MapUnitsPath),
  parseShapefileZip(naturalEarthAdmin1LowPath),
  parseShapefileZip(naturalEarthAdmin1Path)
]);

const profiles = profilesPayload.profiles;
const iso3ByCountry = geoBoundariesIso3ByCountry(dataset.countries);
const profileByCountry = new Map(profiles.map((profile) => [profile.countryCode, profile]));
const detailedCountryCodes = new Set(profiles.filter((profile) => profile.detailedCoverage).map((profile) => profile.countryCode));
const c3CountryCodes = new Set(profiles.filter((profile) => profile.detailedCoverage === 'admin2').map((profile) => profile.countryCode));
const admin1ByCountry = new Map<string, GeoNamesAdmin1[]>();
const allAdmin2ByCountry = new Map<string, GeoNamesAdmin2[]>();
for (const item of dataset.admin1Items) {
  const list = admin1ByCountry.get(item.countryCode) ?? [];
  list.push(item);
  admin1ByCountry.set(item.countryCode, list);
}
for (const item of dataset.admin2Items) {
  const list = allAdmin2ByCountry.get(item.countryCode) ?? [];
  list.push(item);
  allAdmin2ByCountry.set(item.countryCode, list);
}
const boundaryLabelsByKey = boundaryLabelOverridesByKey(overrideSeed);

await rm(generatedGeoDir, { recursive: true, force: true });

const countryFeatures: GeoJsonFeature[] = [];
const c2Admin1Features: GeoJsonFeature[] = [];
const c3Admin1Features: GeoJsonFeature[] = [];
const countryReports: GeoBoundaryReport['countries'] = [];
const packageFeaturesByOutputPath = new Map<string, GeoJsonFeature[]>();
const admin1GeneratedByCountry = new Map<string, { features: GeoJsonFeature[]; missing: string[]; sources: string[] }>();
const countryFeaturesByCode = naturalEarthCountryFeaturesByCode([naturalEarthAdmin0, naturalEarthAdmin0Detailed, naturalEarthAdmin0MapUnits], naturalEarthAdmin0MapUnits, naturalEarthAdmin1, geoBoundarySourceSeed);
const countryOutlineFeaturesByCode = naturalEarthCountryOutlineFeaturesByCode([naturalEarthAdmin0Detailed, naturalEarthAdmin0MapUnits, naturalEarthAdmin0], naturalEarthAdmin0MapUnits, naturalEarthAdmin1, geoBoundarySourceSeed);
const chinaOutlineFeature = await chinaCountryOutlineFeature();
if (chinaOutlineFeature) countryOutlineFeaturesByCode.set('CN', chinaOutlineFeature);
const regionMetadataByKey = regionFeatureMetadata(dataset.admin1Items, dataset.admin2Items);
countryFeatures.push(...detailedCountryOutlineFeatures(profiles, countryOutlineFeaturesByCode));

async function writeTrackedGeoPackage(relativePath: string, features: GeoJsonFeature[], precision: number): Promise<GeoBoundaryReport['packages'][number]> {
  const annotatedFeatures = annotateRegionFeatures(features, regionMetadataByKey);
  packageFeaturesByOutputPath.set(relativePath, annotatedFeatures);
  return writeGeoPackage(relativePath, annotatedFeatures, precision);
}

for (const profile of profiles) {
  if (profile.countryTier !== 'C1') continue;
  const feature = countryFeaturesByCode.get(profile.countryCode);
  if (feature) countryFeatures.push(feature);
}

for (const countryCode of [...detailedCountryCodes].sort()) {
  const profile = profileByCountry.get(countryCode);
  const admin1Items = admin1ByCountry.get(countryCode) ?? [];
  const admin2Items = boundaryAdmin2ItemsForCountry(countryCode, allAdmin2ByCountry.get(countryCode) ?? [], overrideSeed);
  const generated = await admin1FeaturesForCountry(countryCode, admin1Items, admin2Items, naturalEarthAdmin1Low, naturalEarthAdmin1, iso3ByCountry);
  admin1GeneratedByCountry.set(countryCode, generated);
  if (profile?.detailedCoverage === 'admin2') c3Admin1Features.push(...generated.features);
  else c2Admin1Features.push(...generated.features);
}

const report: GeoBoundaryReport = {
  generatedAt: new Date().toISOString(),
  profileVersion: (profilesPayload as { version?: string }).version ?? 'unknown',
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
  const admin1Items = admin1ByCountry.get(countryCode) ?? [];
  const admin2Items = boundaryAdmin2ItemsForCountry(countryCode, allAdmin2ByCountry.get(countryCode) ?? [], overrideSeed);
  const admin1Generated = admin1GeneratedByCountry.get(countryCode) ?? await admin1FeaturesForCountry(countryCode, admin1Items, admin2Items, naturalEarthAdmin1Low, naturalEarthAdmin1, iso3ByCountry);
  const admin2Generated = await admin2FeaturesForCountry(countryCode, admin1Items, admin2Items, boundaryLabelsByKey, geoBoundarySourceSeed, iso3ByCountry);
  const companionRegionExpectedCount = countryCode === 'CN' ? chinaCompanionRegions.length : 0;
  const matchedAdmin2FeatureCount = countUniqueRegionKeysWithPrefix(admin2Generated.features, `admin2:${countryCode}.`);
  const boundaryOnlyFeatureCount = countFeaturesWithRegionKeyPrefix(admin2Generated.features, `boundary:${countryCode}.`);
  report.packages.push(await writeTrackedGeoPackage(`${geoC3Admin2Dir}/${countryCode}.geojson`, admin2Generated.features, 3));
  countryReports.push({
    countryCode,
    countryTier: profile?.countryTier ?? 'C3',
    admin1Expected: admin1Items.length + companionRegionExpectedCount,
    admin1Generated: admin1Generated.features.length,
    admin2Expected: admin2Items.length + companionRegionExpectedCount,
    admin2Generated: matchedAdmin2FeatureCount,
    boundaryOnlyGenerated: boundaryOnlyFeatureCount,
    missingAdmin1: admin1Generated.missing,
    missingAdmin2: admin2Generated.missing,
    sources: [...new Set([...admin1Generated.sources, ...admin2Generated.sources])],
    admin2ByAdmin1: admin2FeatureAuditByAdmin1(countryCode, admin1Items, admin2Generated.features)
  });
}

for (const countryCode of [...detailedCountryCodes].filter((countryCode) => !c3CountryCodes.has(countryCode)).sort()) {
  const profile = profileByCountry.get(countryCode);
  const admin1Items = admin1ByCountry.get(countryCode) ?? [];
  const admin2Items = boundaryAdmin2ItemsForCountry(countryCode, allAdmin2ByCountry.get(countryCode) ?? [], overrideSeed);
  const admin1Generated = admin1GeneratedByCountry.get(countryCode) ?? await admin1FeaturesForCountry(countryCode, admin1Items, admin2Items, naturalEarthAdmin1Low, naturalEarthAdmin1, iso3ByCountry);
  countryReports.push({
    countryCode,
    countryTier: profile?.countryTier ?? 'C2',
    admin1Expected: admin1Items.length,
    admin1Generated: admin1Generated.features.length,
    admin2Expected: 0,
    admin2Generated: 0,
    boundaryOnlyGenerated: 0,
    missingAdmin1: admin1Generated.missing,
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
