/**
 * 文件说明: 实现地图区块着色使用的三档静态矢量瓦片生成、manifest 写入和生成报告。
 * 对应文档: docs/specs/40-map-vector-tiles-performance.md
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GeoJSONVT, type GeoJSONVTTile } from '@maplibre/geojson-vt';
import { fromGeojsonVt } from '@maplibre/vt-pbf';

type GeoJsonGeometry = {
  type: string;
  coordinates: unknown;
};

type GeoJsonFeature = {
  type: 'Feature';
  id?: string;
  properties: Record<string, unknown>;
  geometry: GeoJsonGeometry;
};

type FeatureCollection = {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
};

type CountryTier = 'C1' | 'C2' | 'C3';
type WeatherRegionLevel = 'country' | 'admin1' | 'admin2' | 'boundary';
type WeatherLevel = 'country' | 'admin1' | 'admin2';
type TilePackageId = 'country' | 'admin1' | 'admin2';

type CountryProfile = {
  countryCode: string;
  countryTier: CountryTier;
};

type CountryProfilesPayload = {
  profiles: CountryProfile[];
};

type TileCountry = {
  code: string;
  tier: CountryTier;
  labelEn?: string;
  labelZh?: string;
};

type CliOptions = {
  dryRun: boolean;
  outputDir: string;
  ndjsonPath: string;
  reportMarkdownPath: string;
  sourceLayer: string;
  extent: number;
  buffer: number;
};

type RegionParseResult = {
  level: WeatherRegionLevel;
  countryCode: string;
  admin1Code?: string;
  admin2Code?: string;
};

type SourcePackageReport = {
  path: string;
  featureCount: number;
};

type TileTierDefinition = {
  id: TilePackageId;
  packageId: TilePackageId;
  outputSubdir: string;
  displayZoom: [number, number];
  tileZoom: [number, number];
  tolerance: number;
  featureSelector: string;
  features: GeoJsonFeature[];
};

type TileZoomReport = {
  zoom: number;
  tileCount: number;
  rawBytes: number;
};

type TileTierReport = {
  id: TileTierDefinition['id'];
  packageId: TilePackageId;
  outputSubdir: string;
  displayZoom: [number, number];
  tileZoom: [number, number];
  tolerance: number;
  featureSelector: string;
  featureCount: number;
  tileCount: number;
  rawBytes: number;
  maxTileBytes: number;
  maxTilePath: string | null;
  byZoom: TileZoomReport[];
};

type TilePackageReport = {
  id: TilePackageId;
  outputSubdir: string;
  minTileZoom: number;
  maxTileZoom: number;
  maxDisplayZoom: number;
  tileCount: number;
  rawBytes: number;
  fileCount: number;
  maxTileBytes: number;
  maxTilePath: string | null;
};

type GeoTileReport = {
  generatedAt: string;
  dryRun: boolean;
  sourceLayer: string;
  mapZoomRange: {
    minZoom: number;
    defaultZoom: number;
    maxZoom: number;
    countryFitMaxZoom: number;
    detailFitMaxZoom: number;
  };
  outputs: {
    tileRootDir: string;
    manifestPath: string;
    ndjsonPath: string;
    reportMarkdownPath: string;
  };
  sourcePackages: SourcePackageReport[];
  features: {
    total: number;
    byLevel: Record<WeatherRegionLevel, number>;
    byWeatherLevel: Record<WeatherLevel, number>;
    duplicateRegionKeys: string[];
    skippedRegionKeys: string[];
    countriesWithoutLowZoomBoundary: string[];
  };
  tiles: {
    totalCount: number;
    fileCount: number;
    rawBytes: number;
    maxTileBytes: number;
    maxTilePath: string | null;
    packages: TilePackageReport[];
    tiers: TileTierReport[];
  };
};

type RegionTileManifest = {
  generatedAt: string;
  sourceLayer: string;
  renderMode: 'vector';
  packages: Record<string, {
    tiles: string[];
    minzoom: number;
    maxzoom: number;
    displayMaxZoom: number;
  }>;
};

const rootDir = process.cwd();
const publicGeoDir = path.join(rootDir, 'apps', 'web', 'public', 'data', 'geo');
const generatedDir = path.join(rootDir, 'data', 'generated');
const generatedGeoDir = path.join(generatedDir, 'geo');
const generatedC3Admin2GeoDir = path.join(generatedGeoDir, 'c3_admin2');
const reportDir = path.join(rootDir, 'data', 'report');
const profilesPath = path.join(generatedDir, 'country-profiles.json');

const defaultMapMinZoom = 1;
const defaultMapZoom = 1.35;
const defaultMapMaxZoom = 8;
const countryFitMaxZoom = 4.8;
const detailFitMaxZoom = 5.6;

const defaultSourceLayer = 'weather_region';
const defaultTileRootDir = path.join(publicGeoDir, 'region-tiles');
const manifestFileName = 'manifest.json';
const countryDisplayNames = {
  zh: new Intl.DisplayNames(['zh-CN'], { type: 'region' }),
  en: new Intl.DisplayNames(['en-US'], { type: 'region' })
};
const productCountryLabels: Partial<Record<string, { zh: string; en: string }>> = {
  CN: { zh: '中国', en: 'China' },
  HK: { zh: '香港', en: 'Hong Kong' },
  MO: { zh: '澳门', en: 'Macau' },
  TW: { zh: '台湾', en: 'Taiwan' }
};

function usage(): string {
  return [
    'Usage: tsx scripts/generate-static-geo-tiles.ts [options]',
    '',
    'Options:',
    '  --dry-run                   Build report without writing tiles or generated files.',
    '  --output-dir=<path>          Tile output root. Default: apps/web/public/data/geo/region-tiles',
    '  --ndjson=<path>              GeoJSON feature NDJSON output path. Default: data/generated/geo-regions.ndjson',
    '  --report-md=<path>           Markdown report output path. Default: data/report/geo-tile-report.md',
    '  --source-layer=<name>        Vector tile source-layer name. Default: weather_region',
    '  --extent=<number>            Vector tile extent. Default: 4096',
    '  --buffer=<number>            Vector tile buffer. Default: 64',
    '  --help                      Show this help.'
  ].join('\n');
}

function parseNumberOption(name: string, value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${name}: ${value ?? ''}`);
  return parsed;
}

function parseStringOption(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing value for ${name}`);
  return value;
}

function resolveOutputPath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    outputDir: defaultTileRootDir,
    ndjsonPath: path.join(generatedDir, 'geo-regions.ndjson'),
    reportMarkdownPath: path.join(reportDir, 'geo-tile-report.md'),
    sourceLayer: defaultSourceLayer,
    extent: 4096,
    buffer: 64
  };

  for (const arg of args) {
    const [flag, value] = arg.split('=', 2);
    if (flag === '--help') {
      console.log(usage());
      process.exit(0);
    }
    if (flag === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (flag === '--output-dir') options.outputDir = resolveOutputPath(parseStringOption(flag, value));
    else if (flag === '--ndjson') options.ndjsonPath = resolveOutputPath(parseStringOption(flag, value));
    else if (flag === '--report-md') options.reportMarkdownPath = resolveOutputPath(parseStringOption(flag, value));
    else if (flag === '--source-layer') options.sourceLayer = parseStringOption(flag, value);
    else if (flag === '--extent') options.extent = parseNumberOption(flag, value);
    else if (flag === '--buffer') options.buffer = parseNumberOption(flag, value);
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!options.sourceLayer) throw new Error('source-layer must not be empty');
  if (!Number.isInteger(options.extent) || options.extent <= 0) throw new Error(`extent must be a positive integer: ${options.extent}`);
  if (!Number.isInteger(options.buffer) || options.buffer < 0) throw new Error(`buffer must be a non-negative integer: ${options.buffer}`);
  return options;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

function relativePath(filePath: string): string {
  return path.relative(rootDir, filePath);
}

async function loadSourcePackage(filePath: string): Promise<{ collection: FeatureCollection; report: SourcePackageReport }> {
  const content = await readFile(filePath, 'utf8');
  const collection = JSON.parse(content) as FeatureCollection;
  return {
    collection,
    report: {
      path: relativePath(filePath),
      featureCount: collection.features.length
    }
  };
}

async function tileCountries(): Promise<Map<string, TileCountry>> {
  const profilesPayload = await readJson<CountryProfilesPayload>(profilesPath);
  return new Map(
    profilesPayload.profiles.map((profile) => [
      profile.countryCode,
      {
        code: profile.countryCode,
        tier: profile.countryTier,
        labelEn: productCountryLabels[profile.countryCode]?.en ?? countryDisplayNames.en.of(profile.countryCode) ?? profile.countryCode,
        labelZh: productCountryLabels[profile.countryCode]?.zh ?? countryDisplayNames.zh.of(profile.countryCode) ?? profile.countryCode
      }
    ])
  );
}

function parseRegionKey(regionKey: string): RegionParseResult | null {
  const countryMatch = /^country:([A-Z]{2})$/.exec(regionKey);
  if (countryMatch) return { level: 'country', countryCode: countryMatch[1] };

  const admin1Match = /^admin1:([A-Z]{2})\.([^.]+)$/.exec(regionKey);
  if (admin1Match) return { level: 'admin1', countryCode: admin1Match[1], admin1Code: admin1Match[2] };

  const admin2Match = /^admin2:([A-Z]{2})\.(.+)$/.exec(regionKey);
  if (admin2Match) {
    const [admin1Code, ...admin2CodeParts] = admin2Match[2].split('.');
    return admin2CodeParts.length > 0
      ? { level: 'admin2', countryCode: admin2Match[1], admin1Code, admin2Code: admin2CodeParts.join('.') }
      : { level: 'admin2', countryCode: admin2Match[1], admin2Code: admin2Match[2] };
  }

  const boundaryMatch = /^boundary:([A-Z]{2})\.(.+)$/.exec(regionKey);
  if (boundaryMatch) {
    const [admin1Code, ...admin2CodeParts] = boundaryMatch[2].split('.');
    return admin2CodeParts.length > 0
      ? { level: 'boundary', countryCode: boundaryMatch[1], admin1Code, admin2Code: admin2CodeParts.join('.') }
      : { level: 'boundary', countryCode: boundaryMatch[1], admin2Code: boundaryMatch[2] };
  }

  return null;
}

function weatherLevelForCountry(countryCode: string, countries: Map<string, TileCountry>): WeatherLevel {
  const tier = countries.get(countryCode)?.tier;
  if (tier === 'C3') return 'admin2';
  if (tier === 'C2') return 'admin1';
  return 'country';
}

function minDisplayZoom(level: WeatherRegionLevel): number {
  if (level === 'country') return 1;
  if (level === 'admin1') return 3;
  return 5;
}

function normalizedTileFeature(feature: GeoJsonFeature, countries: Map<string, TileCountry>): GeoJsonFeature | null {
  const regionKey = typeof feature.properties.regionKey === 'string' ? feature.properties.regionKey : '';
  const parsed = parseRegionKey(regionKey);
  if (!parsed) return null;

  const country = countries.get(parsed.countryCode);
  const sourceLabelZh = typeof feature.properties.labelZh === 'string' ? feature.properties.labelZh : undefined;
  const sourceLabelEn = typeof feature.properties.labelEn === 'string' ? feature.properties.labelEn : undefined;
  const weatherRegionKey = typeof feature.properties.weatherRegionKey === 'string' ? feature.properties.weatherRegionKey : undefined;
  const weatherLevel = weatherLevelForCountry(parsed.countryCode, countries);

  return {
    type: 'Feature',
    id: regionKey,
    properties: {
      regionKey,
      level: parsed.level,
      countryCode: parsed.countryCode,
      ...(parsed.admin1Code ? { admin1Code: parsed.admin1Code } : {}),
      ...(parsed.admin2Code ? { admin2Code: parsed.admin2Code } : {}),
      ...(sourceLabelZh || country?.labelZh ? { labelZh: sourceLabelZh ?? country?.labelZh } : {}),
      ...(sourceLabelEn || country?.labelEn ? { labelEn: sourceLabelEn ?? country?.labelEn } : {}),
      ...(weatherRegionKey ? { weatherRegionKey } : {}),
      minDisplayZoom: minDisplayZoom(parsed.level),
      weatherLevel
    },
    geometry: feature.geometry
  };
}

async function c3Admin2GeojsonPaths(): Promise<string[]> {
  const countryEntries = await readdir(generatedC3Admin2GeoDir, { withFileTypes: true }).catch(() => []);
  return countryEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.geojson'))
    .map((entry) => path.join(generatedC3Admin2GeoDir, entry.name))
    .sort();
}

function featureLevel(feature: GeoJsonFeature): WeatherRegionLevel {
  return feature.properties.level as WeatherRegionLevel;
}

function featureCountryCode(feature: GeoJsonFeature): string {
  return String(feature.properties.countryCode ?? '');
}

function featureRegionKey(feature: GeoJsonFeature): string {
  return String(feature.properties.regionKey ?? '');
}

function sortedFeatures(features: GeoJsonFeature[]): GeoJsonFeature[] {
  return [...features].sort((left, right) => featureRegionKey(left).localeCompare(featureRegionKey(right)));
}

function addFeature(featuresByKey: Map<string, GeoJsonFeature>, feature: GeoJsonFeature, duplicateRegionKeys: Set<string>): void {
  const regionKey = featureRegionKey(feature);
  if (featuresByKey.has(regionKey)) {
    duplicateRegionKeys.add(regionKey);
    return;
  }
  featuresByKey.set(regionKey, feature);
}

async function buildTileSources(countries: Map<string, TileCountry>): Promise<{
  reports: SourcePackageReport[];
  allFeatures: GeoJsonFeature[];
  worldLowFeatures: GeoJsonFeature[];
  worldMidFeatures: GeoJsonFeature[];
  detailFeatures: GeoJsonFeature[];
  duplicateRegionKeys: string[];
  skippedRegionKeys: string[];
  countriesWithoutLowZoomBoundary: string[];
}> {
  const reports: SourcePackageReport[] = [];
  const skippedRegionKeys = new Set<string>();
  const duplicateRegionKeys = new Set<string>();
  const allFeaturesByKey = new Map<string, GeoJsonFeature>();
  const lowFeaturesByKey = new Map<string, GeoJsonFeature>();
  const worldMidFeatures: GeoJsonFeature[] = [];
  const detailParentKeysWithChildren = new Set<string>();
  const detailCountriesWithChildren = new Set<string>();

  const countryPackage = await loadSourcePackage(path.join(generatedGeoDir, 'country.geojson'));
  reports.push(countryPackage.report);
  for (const sourceFeature of countryPackage.collection.features) {
    const normalized = normalizedTileFeature(sourceFeature, countries);
    if (!normalized) {
      skippedRegionKeys.add(String(sourceFeature.properties.regionKey ?? ''));
      continue;
    }
    addFeature(allFeaturesByKey, normalized, duplicateRegionKeys);
    if (featureLevel(normalized) === 'country' && countries.has(featureCountryCode(normalized))) {
      lowFeaturesByKey.set(featureRegionKey(normalized), normalized);
      if (normalized.properties.weatherLevel === 'country') worldMidFeatures.push(normalized);
    }
  }

  for (const packageName of ['c2_admin1.geojson', 'c3_admin1.geojson']) {
    const admin1Package = await loadSourcePackage(path.join(generatedGeoDir, packageName));
    reports.push(admin1Package.report);
    for (const sourceFeature of admin1Package.collection.features) {
      const normalized = normalizedTileFeature(sourceFeature, countries);
      if (!normalized) {
        skippedRegionKeys.add(String(sourceFeature.properties.regionKey ?? ''));
        continue;
      }
      addFeature(allFeaturesByKey, normalized, duplicateRegionKeys);
      worldMidFeatures.push(normalized);
    }
  }

  for (const countryPath of await c3Admin2GeojsonPaths()) {
    const countryPackage = await loadSourcePackage(countryPath);
    reports.push(countryPackage.report);

    for (const sourceFeature of countryPackage.collection.features) {
      const normalized = normalizedTileFeature(sourceFeature, countries);
      if (!normalized) {
        skippedRegionKeys.add(String(sourceFeature.properties.regionKey ?? ''));
        continue;
      }
      addFeature(allFeaturesByKey, normalized, duplicateRegionKeys);
      if (['admin2', 'boundary'].includes(featureLevel(normalized)) && typeof normalized.properties.admin1Code === 'string') {
        detailParentKeysWithChildren.add(`admin1:${featureCountryCode(normalized)}.${normalized.properties.admin1Code}`);
      }
      if (['admin2', 'boundary'].includes(featureLevel(normalized))) detailCountriesWithChildren.add(featureCountryCode(normalized));
    }
  }

  const detailFeatures = [...allFeaturesByKey.values()].filter((feature) => {
    const level = featureLevel(feature);
    const weatherLevel = feature.properties.weatherLevel as WeatherLevel;
    if (weatherLevel === 'country') return level === 'country';
    if (weatherLevel === 'admin1') return level === 'admin1';
    if (['admin2', 'boundary'].includes(level)) return true;
    return level === 'admin1' && !detailCountriesWithChildren.has(featureCountryCode(feature)) && !detailParentKeysWithChildren.has(featureRegionKey(feature));
  });

  const countriesWithoutLowZoomBoundary = [...countries.keys()]
    .filter((countryCode) => !lowFeaturesByKey.has(`country:${countryCode}`))
    .sort();

  return {
    reports,
    allFeatures: sortedFeatures([...allFeaturesByKey.values()]),
    worldLowFeatures: sortedFeatures([...lowFeaturesByKey.values()]),
    worldMidFeatures: sortedFeatures(worldMidFeatures),
    detailFeatures: sortedFeatures(detailFeatures),
    duplicateRegionKeys: [...duplicateRegionKeys].sort(),
    skippedRegionKeys: [...skippedRegionKeys].filter(Boolean).sort(),
    countriesWithoutLowZoomBoundary
  };
}

function buildTierDefinitions(tileSources: Awaited<ReturnType<typeof buildTileSources>>): TileTierDefinition[] {
  const tiers: TileTierDefinition[] = [
    {
      id: 'country',
      packageId: 'country',
      outputSubdir: 'country',
      displayZoom: [1, 2],
      tileZoom: [1, 2],
      tolerance: 8,
      featureSelector: 'country',
      features: tileSources.worldLowFeatures
    },
    {
      id: 'admin1',
      packageId: 'admin1',
      outputSubdir: 'admin1',
      displayZoom: [3, 4],
      tileZoom: [3, 4],
      tolerance: 4,
      featureSelector: 'admin1+country-fallback',
      features: tileSources.worldMidFeatures
    }
  ];

  tiers.push({
    id: 'admin2',
    packageId: 'admin2',
    outputSubdir: 'admin2',
    displayZoom: [5, 8],
    tileZoom: [5, 5],
    tolerance: 3,
    featureSelector: 'admin2+boundary+admin1/country-fallback',
    features: tileSources.detailFeatures
  });

  return tiers;
}

function emptyLevelCounts(): Record<WeatherRegionLevel, number> {
  return { country: 0, admin1: 0, admin2: 0, boundary: 0 };
}

function emptyWeatherLevelCounts(): Record<WeatherLevel, number> {
  return { country: 0, admin1: 0, admin2: 0 };
}

function featureSummary(
  features: GeoJsonFeature[],
  duplicateRegionKeys: string[],
  skippedRegionKeys: string[],
  countriesWithoutLowZoomBoundary: string[]
): GeoTileReport['features'] {
  const byLevel = emptyLevelCounts();
  const byWeatherLevel = emptyWeatherLevelCounts();
  for (const feature of features) {
    const level = feature.properties.level as WeatherRegionLevel;
    const weatherLevel = feature.properties.weatherLevel as WeatherLevel;
    byLevel[level] += 1;
    byWeatherLevel[weatherLevel] += 1;
  }

  return {
    total: features.length,
    byLevel,
    byWeatherLevel,
    duplicateRegionKeys,
    skippedRegionKeys,
    countriesWithoutLowZoomBoundary
  };
}

function tilePath(tileRootDir: string, outputSubdir: string, z: number, x: number, y: number): string {
  return path.join(tileRootDir, outputSubdir, String(z), String(x), `${y}.mvt`);
}

function assertSafeOutputDir(outputDir: string): void {
  const resolved = path.resolve(outputDir);
  const forbiddenDirs = new Set([
    path.parse(resolved).root,
    rootDir,
    publicGeoDir,
    generatedDir
  ]);
  if (forbiddenDirs.has(resolved)) throw new Error(`Refusing to replace unsafe tile directory: ${resolved}`);
  if (!resolved.startsWith(`${publicGeoDir}${path.sep}`)) {
    throw new Error(`Tile output must stay under ${relativePath(publicGeoDir)}: ${resolved}`);
  }
}

async function writeTileIfNeeded(filePath: string, bytes: Uint8Array, dryRun: boolean): Promise<void> {
  if (dryRun) return;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
}

function addZoomReport(target: TileZoomReport, source: TileZoomReport): void {
  target.tileCount += source.tileCount;
  target.rawBytes += source.rawBytes;
}

async function generateTierTiles(tier: TileTierDefinition, options: CliOptions): Promise<TileTierReport> {
  const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: tier.features
  };
  const index = new GeoJSONVT(collection as ConstructorParameters<typeof GeoJSONVT>[0], {
    maxZoom: tier.tileZoom[1],
    indexMaxZoom: tier.tileZoom[1],
    indexMaxPoints: 0,
    tolerance: tier.tolerance,
    extent: options.extent,
    buffer: options.buffer,
    promoteId: 'regionKey'
  });
  const byZoom: TileZoomReport[] = [];
  let tileCount = 0;
  let rawBytes = 0;
  let maxTileBytes = 0;
  let maxTilePath: string | null = null;

  for (let z = tier.tileZoom[0]; z <= tier.tileZoom[1]; z += 1) {
    const zoomReport: TileZoomReport = { zoom: z, tileCount: 0, rawBytes: 0 };
    const dimension = 2 ** z;
    for (let x = 0; x < dimension; x += 1) {
      for (let y = 0; y < dimension; y += 1) {
        const tile = index.getTile(z, x, y) as GeoJSONVTTile | null;
        if (!tile || tile.features.length === 0) continue;
        const bytes = fromGeojsonVt({ [options.sourceLayer]: tile }, { version: 2, extent: options.extent });
        const outputPath = tilePath(options.outputDir, tier.outputSubdir, z, x, y);

        await writeTileIfNeeded(outputPath, bytes, options.dryRun);
        zoomReport.tileCount += 1;
        zoomReport.rawBytes += bytes.length;

        if (bytes.length > maxTileBytes) {
          maxTileBytes = bytes.length;
          maxTilePath = relativePath(outputPath);
        }
      }
    }

    byZoom.push(zoomReport);
    tileCount += zoomReport.tileCount;
    rawBytes += zoomReport.rawBytes;
  }

  return {
    id: tier.id,
    packageId: tier.packageId,
    outputSubdir: tier.outputSubdir,
    displayZoom: tier.displayZoom,
    tileZoom: tier.tileZoom,
    tolerance: tier.tolerance,
    featureSelector: tier.featureSelector,
    featureCount: tier.features.length,
    tileCount,
    rawBytes,
    maxTileBytes,
    maxTilePath,
    byZoom
  };
}

function aggregatePackageReports(tierReports: TileTierReport[]): TilePackageReport[] {
  const packages = new Map<TilePackageId, TilePackageReport>();

  for (const tier of tierReports) {
    const current = packages.get(tier.packageId) ?? {
      id: tier.packageId,
      outputSubdir: tier.outputSubdir,
      minTileZoom: tier.tileZoom[0],
      maxTileZoom: tier.tileZoom[1],
      maxDisplayZoom: tier.displayZoom[1],
      tileCount: 0,
      rawBytes: 0,
      fileCount: 0,
      maxTileBytes: 0,
      maxTilePath: null
    };

    current.minTileZoom = Math.min(current.minTileZoom, tier.tileZoom[0]);
    current.maxTileZoom = Math.max(current.maxTileZoom, tier.tileZoom[1]);
    current.maxDisplayZoom = Math.max(current.maxDisplayZoom, tier.displayZoom[1]);
    current.tileCount += tier.tileCount;
    current.fileCount += tier.tileCount;
    current.rawBytes += tier.rawBytes;
    if (tier.maxTileBytes > current.maxTileBytes) {
      current.maxTileBytes = tier.maxTileBytes;
      current.maxTilePath = tier.maxTilePath;
    }
    packages.set(tier.packageId, current);
  }

  return [...packages.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function aggregateTileTotals(tierReports: TileTierReport[], packageReports: TilePackageReport[]): GeoTileReport['tiles'] {
  let maxTileBytes = 0;
  let maxTilePath: string | null = null;
  for (const tier of tierReports) {
    if (tier.maxTileBytes > maxTileBytes) {
      maxTileBytes = tier.maxTileBytes;
      maxTilePath = tier.maxTilePath;
    }
  }

  return {
    totalCount: tierReports.reduce((sum, tier) => sum + tier.tileCount, 0),
    fileCount: packageReports.reduce((sum, item) => sum + item.fileCount, 0),
    rawBytes: tierReports.reduce((sum, tier) => sum + tier.rawBytes, 0),
    maxTileBytes,
    maxTilePath,
    packages: packageReports,
    tiers: tierReports
  };
}

function ndjsonContent(features: GeoJsonFeature[]): string {
  return `${features.map((feature) => JSON.stringify(feature)).join('\n')}\n`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function packageLabel(packageId: TilePackageId): string {
  return packageId;
}

function combinedZoomReports(tierReports: TileTierReport[]): TileZoomReport[] {
  const byZoom = new Map<number, TileZoomReport>();
  for (const tier of tierReports) {
    for (const zoom of tier.byZoom) {
      const current = byZoom.get(zoom.zoom) ?? { zoom: zoom.zoom, tileCount: 0, rawBytes: 0 };
      addZoomReport(current, zoom);
      byZoom.set(zoom.zoom, current);
    }
  }
  return [...byZoom.values()].sort((left, right) => left.zoom - right.zoom);
}

function reportMarkdown(report: GeoTileReport): string {
  const sourceRows = report.sourcePackages.map((item) =>
    `| ${item.path} | ${item.featureCount} |`
  ).join('\n');
  const packageRows = report.tiles.packages.map((item) =>
    `| ${packageLabel(item.id)} | z${item.minTileZoom}-z${item.maxTileZoom} | ${item.maxDisplayZoom > item.maxTileZoom ? `z${item.maxTileZoom} overzoom 到 z${item.maxDisplayZoom}` : `到 z${item.maxDisplayZoom}`} | ${item.tileCount} | ${formatBytes(item.rawBytes)} | ${formatBytes(item.maxTileBytes)} |`
  ).join('\n');
  const tierRows = report.tiles.tiers.map((item) =>
    `| ${packageLabel(item.packageId)} | ${item.id} | ${item.featureSelector} | ${item.featureCount} | z${item.tileZoom[0]}-z${item.tileZoom[1]} | z${item.displayZoom[0]}-z${item.displayZoom[1]} | ${item.tolerance} | ${item.tileCount} | ${formatBytes(item.rawBytes)} | ${formatBytes(item.maxTileBytes)} |`
  ).join('\n');
  const zoomRows = combinedZoomReports(report.tiles.tiers).map((item) =>
    `| z${item.zoom} | ${item.tileCount} | ${formatBytes(item.rawBytes)} |`
  ).join('\n');

  return [
    '# 地图瓦片报告',
    '',
    `生成时间：\`${report.generatedAt}\``,
    `Dry run：\`${report.dryRun ? 'true' : 'false'}\``,
    `Source layer：\`${report.sourceLayer}\``,
    '',
    '## 缩放范围',
    '',
    '| 对象 | minZoom | defaultZoom | maxZoom |',
    '| --- | ---: | ---: | ---: |',
    `| 当前地图 | ${report.mapZoomRange.minZoom} | ${report.mapZoomRange.defaultZoom} | ${report.mapZoomRange.maxZoom} |`,
    '',
    '## 输出',
    '',
    `- 瓦片目录：\`${report.outputs.tileRootDir}\``,
    `- Manifest：\`${report.outputs.manifestPath}\``,
    `- NDJSON：\`${report.outputs.ndjsonPath}\``,
    `- Markdown 报告：\`${report.outputs.reportMarkdownPath}\``,
    '',
    '## 源包',
    '',
    '| 路径 | feature 数 |',
    '| --- | ---: |',
    sourceRows || '| - | 0 |',
    '',
    '## Feature',
    '',
    `- 归一化 feature：${report.features.total}`,
    `- 层级：country ${report.features.byLevel.country}, admin1 ${report.features.byLevel.admin1}, admin2 ${report.features.byLevel.admin2}, boundary ${report.features.byLevel.boundary}`,
    `- 天气粒度：country ${report.features.byWeatherLevel.country}, admin1 ${report.features.byWeatherLevel.admin1}, admin2 ${report.features.byWeatherLevel.admin2}`,
    `- 去重 regionKey：${report.features.duplicateRegionKeys.length}`,
    `- 跳过非天气 regionKey：${report.features.skippedRegionKeys.length}`,
    `- 缺少低 zoom 国家边界：${report.features.countriesWithoutLowZoomBoundary.length}`,
    '',
    '## 分包',
    '',
    '| 包 | 实际 tile zoom | 显示 zoom | 瓦片文件数 | MVT 原始体积 | 最大单 tile |',
    '| --- | --- | --- | ---: | ---: | ---: |',
    packageRows || '| - | - | - | 0 | 0 B | 0 B |',
    '',
    '## 分档',
    '',
    '| 包 | 档位 | feature | feature 数 | 实际 tile zoom | 显示 zoom | tolerance | 瓦片数 | MVT 原始体积 | 最大单 tile |',
    '| --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: |',
    tierRows || '| - | - | - | 0 | - | - | 0 | 0 | 0 B | 0 B |',
    '',
    '## Zoom 汇总',
    '',
    '| Zoom | 瓦片数 | 原始体积 |',
    '| ---: | ---: | ---: |',
    zoomRows || '| - | 0 | 0 B |',
    '',
    `总瓦片文件：${report.tiles.fileCount}`,
    `总 MVT 原始体积：${formatBytes(report.tiles.rawBytes)}`,
    `最大单瓦片：${report.tiles.maxTilePath ? `\`${report.tiles.maxTilePath}\`` : '-'} (${formatBytes(report.tiles.maxTileBytes)})`,
    '',
    'z6-z8 不生成新高精度文件，由 MapLibre 对 z5 高精度瓦片 overzoom。文件数量下降主要来自高精度档停止继续切到 z6/z7/z8。',
    ''
  ].join('\n');
}

function buildManifest(report: GeoTileReport): RegionTileManifest {
  const packages: RegionTileManifest['packages'] = {};
  for (const item of report.tiles.packages) {
    const subdir = item.outputSubdir.split(path.sep).join('/');
    packages[packageLabel(item.id)] = {
      tiles: [`/data/geo/region-tiles/${subdir}/{z}/{x}/{y}.mvt`],
      minzoom: item.minTileZoom,
      maxzoom: item.maxTileZoom,
      displayMaxZoom: item.maxDisplayZoom
    };
  }
  return {
    generatedAt: report.generatedAt,
    sourceLayer: report.sourceLayer,
    renderMode: 'vector',
    packages
  };
}

async function writeOutputs(features: GeoJsonFeature[], report: GeoTileReport, options: CliOptions): Promise<void> {
  if (options.dryRun) return;

  const manifestPath = path.join(options.outputDir, manifestFileName);
  await mkdir(path.dirname(options.ndjsonPath), { recursive: true });
  await writeFile(options.ndjsonPath, ndjsonContent(features));
  await mkdir(path.dirname(options.reportMarkdownPath), { recursive: true });
  await writeFile(options.reportMarkdownPath, reportMarkdown(report));
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(buildManifest(report), null, 2)}\n`);
}

export async function runGenerateStaticGeoTiles(args: string[]): Promise<void> {
  const options = parseArgs(args);
  if (!options.dryRun) {
    assertSafeOutputDir(options.outputDir);
    await rm(options.outputDir, { recursive: true, force: true });
  }

  const countries = await tileCountries();
  const tileSources = await buildTileSources(countries);
  const tierDefinitions = buildTierDefinitions(tileSources);
  const tierReports: TileTierReport[] = [];
  for (const tier of tierDefinitions) {
    tierReports.push(await generateTierTiles(tier, options));
  }
  const packageReports = aggregatePackageReports(tierReports);
  const generatedAt = new Date().toISOString();
  const report: GeoTileReport = {
    generatedAt,
    dryRun: options.dryRun,
    sourceLayer: options.sourceLayer,
    mapZoomRange: {
      minZoom: defaultMapMinZoom,
      defaultZoom: defaultMapZoom,
      maxZoom: defaultMapMaxZoom,
      countryFitMaxZoom,
      detailFitMaxZoom
    },
    outputs: {
      tileRootDir: relativePath(options.outputDir),
      manifestPath: relativePath(path.join(options.outputDir, manifestFileName)),
      ndjsonPath: relativePath(options.ndjsonPath),
      reportMarkdownPath: relativePath(options.reportMarkdownPath)
    },
    sourcePackages: tileSources.reports,
    features: featureSummary(
      tileSources.allFeatures,
      tileSources.duplicateRegionKeys,
      tileSources.skippedRegionKeys,
      tileSources.countriesWithoutLowZoomBoundary
    ),
    tiles: aggregateTileTotals(tierReports, packageReports)
  };

  await writeOutputs(tileSources.allFeatures, report, options);
  console.log(
    `Generated region tiles${options.dryRun ? ' dry run' : ''}: ${report.tiles.fileCount} files, ${formatBytes(report.tiles.rawBytes)} raw MVT, ${packageReports.length} packages.`
  );
  console.log(`Report: ${relativePath(options.reportMarkdownPath)}`);
  console.log(`Tile root: ${relativePath(options.outputDir)}`);
}
