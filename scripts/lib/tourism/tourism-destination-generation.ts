/**
 * 文件说明: 读取旅行目的地 raw、人工 override 和 GeoNames 城市池，生成可审计旅游目的地输入。
 * 对应文档: docs/specs/30-weather-coverage-design.md, docs/specs/31-data-flow.md
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { loadGeoNamesDataset, type GeoNamesCity } from '../static-data/geonames.js';
import { generatedDataVersion, jsonLineContent } from '../generated-jsonl.js';

type TourismDestinationSource = 'curated' | 'wikivoyage' | 'unesco' | 'un-tourism-village' | 'reference-list';
type TourismWeatherMode = 'standalone' | 'map_to_nearest_city' | 'boost_existing_city';

type ManualTourismDestinationOverride = {
  id: string;
  name: string;
  countryCode: string;
  source?: TourismDestinationSource;
  weatherMode?: TourismWeatherMode;
  priority?: number;
  geonameId?: number;
  mappedGeonameId?: number;
  notes?: string;
};

export type CountryNameAlias = {
  name: string;
  countryCode: string;
  reason?: string;
};

type TourismDestination = {
  id: string;
  name: string;
  countryCode: string;
  source: TourismDestinationSource;
  weatherMode: TourismWeatherMode;
  priority: number;
  geonameId?: number;
  mappedGeonameId?: number;
  notes?: string;
};

type RawTourismSummary = {
  generatedAt: string;
  outputDir: string;
  sources: Array<{
    source: string;
    url: string;
    extractable: 'yes' | 'partial' | 'blocked';
    count: number | null;
    fields: string[];
    risks: string[];
    rawFiles: string[];
  }>;
};

type RawDestination = {
  id: string;
  name: string;
  source: string;
  sourceCategory?: string;
  countryCode?: string;
  countryName?: string;
  latitude?: number | null;
  longitude?: number | null;
};

type TourismDestinationGap = {
  id: string;
  name: string;
  source: string;
  reason: string;
};

type TourismDestinationReport = {
  version: string;
  generatedAt: string;
  rawData: {
    path: string | null;
    generatedAt: string | null;
    sourceCount: number;
    destinationCount: number;
    uniqueNameCount: number;
    sources: RawTourismSummary['sources'];
    matchedUniqueNameCount: number;
    ambiguousNameCount: number;
    unmatchedNameCount: number;
  };
  overrides: {
    overrideCount: number;
    alignedCount: number;
    unmatchedCount: number;
  };
  rawGenerated: {
    promotedCount: number;
    skippedCount: number;
    bySource: Record<string, number>;
    byWeatherMode: Record<string, number>;
  };
  output: {
    destinationCount: number;
    bySource: Record<string, number>;
    byWeatherMode: Record<string, number>;
    byCountry: Record<string, number>;
  };
  unmatchedOverrides: TourismDestinationGap[];
  rawSkippedExamples: TourismDestinationGap[];
  rawAmbiguousExamples: TourismDestinationGap[];
  rawUnmatchedExamples: TourismDestinationGap[];
};

const rootDir = process.cwd();
const rawTourismDir = path.join(rootDir, 'data', 'raw', 'tourism-destinations');
const overridesPath = path.join(rootDir, 'data', 'input', 'tourism-destination-overrides.yml');
const countryNameAliasesPath = path.join(rootDir, 'data', 'input', 'country-name-aliases.yml');
const generatedDir = path.join(rootDir, 'data', 'generated');
const reportDir = path.join(rootDir, 'data', 'report');
const outputPath = path.join(generatedDir, 'tourism-destinations.jsonl');
const legacyOutputPath = path.join(generatedDir, 'tourism-destinations.json');
const reportMarkdownPath = path.join(reportDir, 'tourism-destination-report.md');

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

async function readYaml<T>(filePath: string): Promise<T> {
  return YAML.parse(await readFile(filePath, 'utf8')) as T;
}

function normalizeName(value: string): string {
  return value
    .replace(/\s+\([^)]*\)$/g, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeIsoCode(value: string): string | undefined {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : undefined;
}

async function loadRawData(): Promise<{ summary: RawTourismSummary | null; destinations: RawDestination[] }> {
  let summary: RawTourismSummary | null = null;
  try {
    summary = await readJson<RawTourismSummary>(path.join(rawTourismDir, 'summary.json'));
  } catch {
    return { summary: null, destinations: [] };
  }

  const destinations: RawDestination[] = [];

  try {
    const rows = await readJson<Array<{ pageId: number; title: string; sourceCategories: string[] }>>(path.join(rawTourismDir, 'wikivoyage-destinations.json'));
    destinations.push(...rows.map((row) => ({
      id: `wikivoyage:${row.pageId}`,
      name: row.title,
      source: 'wikivoyage',
      sourceCategory: row.sourceCategories.join(',')
    })));
  } catch {
    // Summary still records source extraction status; missing raw files are reflected by lower destination counts.
  }

  try {
    const rows = await readJson<Array<{ id: string; title: string; country: string; latitude: number | null; longitude: number | null }>>(
      path.join(rawTourismDir, 'un-tourism-villages-destinations.json')
    );
    destinations.push(...rows.map((row) => ({
      id: `un-tourism-village:${row.id}`,
      name: row.title,
      source: 'un-tourism-village',
      countryName: row.country,
      latitude: row.latitude,
      longitude: row.longitude
    })));
  } catch {
    // See comment above.
  }

  try {
    const rows = await readJson<Array<{ idNumber: string; name: string; isoCodes: string[]; latitude: number | null; longitude: number | null }>>(
      path.join(rawTourismDir, 'unesco-world-heritage-destinations.json')
    );
    destinations.push(...rows.map((row) => ({
      id: `unesco:${row.idNumber}`,
      name: row.name,
      source: 'unesco',
      countryCode: row.isoCodes.map(normalizeIsoCode).filter(Boolean).join(',') || undefined,
      latitude: row.latitude,
      longitude: row.longitude
    })));
  } catch {
    // See comment above.
  }

  return { summary, destinations };
}

export function buildCountryCodeByName(countries: Map<string, { code: string; name: string }>, aliases: CountryNameAlias[] = []): Map<string, string> {
  const names = new Map<string, string>();
  for (const country of countries.values()) {
    names.set(normalizeName(country.name), country.code);
  }
  for (const alias of aliases) {
    names.set(normalizeName(alias.name), alias.countryCode);
  }
  return names;
}

function destinationCityKey(destination: TourismDestination): string {
  return String(destination.mappedGeonameId ?? destination.geonameId ?? destination.id);
}

function sourceRank(source: TourismDestinationSource): number {
  if (source === 'curated') return 0;
  if (source === 'wikivoyage') return 1;
  if (source === 'un-tourism-village') return 2;
  if (source === 'unesco') return 3;
  return 4;
}

function mergeDestinations(destinations: TourismDestination[]): TourismDestination[] {
  const byCity = new Map<string, TourismDestination>();
  for (const destination of destinations) {
    const key = destinationCityKey(destination);
    const current = byCity.get(key);
    if (
      !current ||
      sourceRank(destination.source) < sourceRank(current.source) ||
      (sourceRank(destination.source) === sourceRank(current.source) && destination.priority < current.priority)
    ) {
      byCity.set(key, destination);
    }
  }
  return [...byCity.values()].sort((a, b) => a.countryCode.localeCompare(b.countryCode) || a.priority - b.priority || a.name.localeCompare(b.name));
}

function wikivoyagePriority(sourceCategory: string | undefined): number {
  const categories = sourceCategory?.split(',') ?? [];
  if (categories.includes('Star cities')) return 14;
  if (categories.includes('Huge city articles')) return 20;
  return 32;
}

function distanceKm(left: { latitude: number; longitude: number }, right: { latitude: number; longitude: number }): number {
  const radiusKm = 6371;
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLon = toRadians(right.longitude - left.longitude);
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function compareByPopulation(left: GeoNamesCity, right: GeoNamesCity): number {
  return right.population - left.population || left.featureCode.localeCompare(right.featureCode) || left.id.localeCompare(right.id);
}

function rawSource(source: string): TourismDestinationSource | null {
  if (source === 'wikivoyage') return 'wikivoyage';
  if (source === 'un-tourism-village') return 'un-tourism-village';
  if (source === 'unesco') return 'unesco';
  return null;
}

function nearestCity(
  target: { latitude: number; longitude: number },
  candidates: GeoNamesCity[]
): { city: GeoNamesCity; distanceKm: number } | null {
  const [nearest] = candidates
    .filter((city) => Number.isFinite(city.latitude) && Number.isFinite(city.longitude))
    .map((city) => ({
      city,
      distanceKm: distanceKm(target, { latitude: city.latitude, longitude: city.longitude })
    }))
    .sort((left, right) => left.distanceKm - right.distanceKm || compareByPopulation(left.city, right.city));
  return nearest ?? null;
}

function alignWikivoyageRaw(
  destination: RawDestination,
  nameIndex: Map<string, GeoNamesCity[]>
): { destination?: TourismDestination; skipped?: TourismDestinationGap } {
  const categories = destination.sourceCategory?.split(',') ?? [];
  const hasAutoCategory = categories.includes('Star cities') || categories.includes('Huge city articles');
  if (!hasAutoCategory) {
    return {
      skipped: {
        id: destination.id,
        name: destination.name,
        source: destination.source,
        reason: 'Wikivoyage Guide-only 城市需要人工复核后再提升'
      }
    };
  }

  const matches = nameIndex.get(normalizeName(destination.name)) ?? [];
  const countries = new Set(matches.map((city) => city.countryCode));
  if (matches.length === 0) {
    return {
      skipped: {
        id: destination.id,
        name: destination.name,
        source: destination.source,
        reason: '没有匹配到 GeoNames 人口地点名称'
      }
    };
  }
  if (countries.size !== 1) {
    return {
      skipped: {
        id: destination.id,
        name: destination.name,
        source: destination.source,
        reason: `匹配到多个国家：${[...countries].sort().slice(0, 8).join(', ')}`
      }
    };
  }

  const city = [...matches].sort(compareByPopulation)[0];
  return {
    destination: {
      id: destination.id,
      name: city.asciiName || destination.name,
      countryCode: city.countryCode,
      source: 'wikivoyage',
      weatherMode: 'standalone',
      priority: wikivoyagePriority(destination.sourceCategory),
      geonameId: city.geonameId
    }
  };
}

function alignUntourismRaw(
  destination: RawDestination,
  groupedCities: Map<string, GeoNamesCity[]>,
  countryNames: Map<string, string>
): { destination?: TourismDestination; skipped?: TourismDestinationGap } {
  const countryCode = destination.countryName ? countryNames.get(normalizeName(destination.countryName)) : undefined;
  if (!countryCode) {
    return {
      skipped: {
        id: destination.id,
        name: destination.name,
        source: destination.source,
        reason: `未知国家名：${destination.countryName ?? '-'}`
      }
    };
  }

  const countryCities = groupedCities.get(countryCode) ?? [];
  const targetName = normalizeName(destination.name);
  const nameMatches = countryCities
    .filter((city) => normalizeName(city.asciiName) === targetName || city.alternateNames.some((name) => normalizeName(name) === targetName))
    .sort(compareByPopulation);
  if (nameMatches[0]) {
    return {
      destination: {
        id: destination.id,
        name: nameMatches[0].asciiName || destination.name,
        countryCode,
        source: 'un-tourism-village',
        weatherMode: 'standalone',
        priority: 28,
        geonameId: nameMatches[0].geonameId
      }
    };
  }

  if (typeof destination.latitude !== 'number' || typeof destination.longitude !== 'number') {
    return {
      skipped: {
        id: destination.id,
        name: destination.name,
        source: destination.source,
        reason: '缺少坐标，无法映射到附近城市'
      }
    };
  }

  const nearest = nearestCity({ latitude: destination.latitude, longitude: destination.longitude }, countryCities);
  if (!nearest || nearest.distanceKm > 50) {
    return {
      skipped: {
        id: destination.id,
        name: destination.name,
        source: destination.source,
        reason: nearest ? `最近 GeoNames 城市距离 ${Math.round(nearest.distanceKm)} 公里` : '没有同国家 GeoNames 城市候选'
      }
    };
  }

  return {
    destination: {
      id: destination.id,
      name: destination.name,
      countryCode,
      source: 'un-tourism-village',
      weatherMode: 'map_to_nearest_city',
      priority: nearest.distanceKm <= 15 ? 30 : 34,
      mappedGeonameId: nearest.city.geonameId,
      notes: `根据 UN Tourism village 坐标映射到 ${nearest.city.asciiName}，距离 ${Math.round(nearest.distanceKm)} 公里`
    }
  };
}

function alignRawDestinations(
  rawDestinations: RawDestination[],
  cities: GeoNamesCity[],
  groupedCities: Map<string, GeoNamesCity[]>,
  countryNames: Map<string, string>
): { destinations: TourismDestination[]; skipped: TourismDestinationGap[] } {
  const nameIndex = cityNameIndex(cities);
  const destinations: TourismDestination[] = [];
  const skipped: TourismDestinationGap[] = [];

  for (const raw of rawDestinations) {
    const source = rawSource(raw.source);
    if (!source) {
      skipped.push({ id: raw.id, name: raw.name, source: raw.source, reason: '不支持的 raw 来源' });
      continue;
    }

    const result = source === 'wikivoyage'
      ? alignWikivoyageRaw(raw, nameIndex)
      : source === 'un-tourism-village'
        ? alignUntourismRaw(raw, groupedCities, countryNames)
        : { skipped: { id: raw.id, name: raw.name, source: raw.source, reason: 'UNESCO 候选需要人工复核后再提升' } };

    if (result.destination) destinations.push(result.destination);
    if (result.skipped) skipped.push(result.skipped);
  }

  return { destinations: mergeDestinations(destinations), skipped };
}

function citiesByCountry(cities: GeoNamesCity[]): Map<string, GeoNamesCity[]> {
  const groups = new Map<string, GeoNamesCity[]>();
  for (const city of cities) {
    const list = groups.get(city.countryCode) ?? [];
    list.push(city);
    groups.set(city.countryCode, list);
  }
  return groups;
}

function findOverrideMatch(
  override: ManualTourismDestinationOverride,
  groupedCities: Map<string, GeoNamesCity[]>
): GeoNamesCity | null {
  const countryCities = groupedCities.get(override.countryCode) ?? [];
  const targetName = normalizeName(override.name);
  const matches = countryCities.filter((city) => {
    if (override.geonameId && city.geonameId === override.geonameId) return true;
    if (override.mappedGeonameId && city.geonameId === override.mappedGeonameId) return true;
    if (!override.geonameId && !override.mappedGeonameId) {
      if (normalizeName(city.asciiName) === targetName) return true;
      return city.alternateNames.some((name) => normalizeName(name) === targetName);
    }
    return false;
  });

  return matches.sort((left, right) => right.population - left.population || left.id.localeCompare(right.id))[0] ?? null;
}

function cityNameIndex(cities: GeoNamesCity[]): Map<string, GeoNamesCity[]> {
  const index = new Map<string, GeoNamesCity[]>();
  for (const city of cities) {
    const names = new Set([city.name, city.asciiName, ...city.alternateNames].map(normalizeName).filter(Boolean));
    for (const name of names) {
      const list = index.get(name) ?? [];
      list.push(city);
      index.set(name, list);
    }
  }
  return index;
}

function alignOverrides(
  overrides: ManualTourismDestinationOverride[],
  groupedCities: Map<string, GeoNamesCity[]>
): { destinations: TourismDestination[]; unmatched: TourismDestinationGap[] } {
  const destinations: TourismDestination[] = [];
  const unmatched: TourismDestinationGap[] = [];

  for (const override of overrides) {
    const matched = findOverrideMatch(override, groupedCities);
    if (!matched) {
      unmatched.push({
        id: override.id,
        name: override.name,
        source: override.source ?? 'curated',
        reason: '未按 geonameId、mappedGeonameId、英文精确名或别名匹配到 GeoNames 城市'
      });
      continue;
    }

    destinations.push({
      id: override.id,
      name: override.name,
      countryCode: override.countryCode,
      source: override.source ?? 'curated',
      weatherMode: override.weatherMode ?? 'standalone',
      priority: override.priority ?? 30,
      ...(override.geonameId && { geonameId: override.geonameId }),
      ...(override.mappedGeonameId && { mappedGeonameId: override.mappedGeonameId }),
      ...(override.notes && { notes: override.notes })
    });
  }

  return {
    destinations: destinations.sort((a, b) => a.countryCode.localeCompare(b.countryCode) || a.priority - b.priority || a.name.localeCompare(b.name)),
    unmatched
  };
}

function summarizeRawMatches(rawDestinations: RawDestination[], cities: GeoNamesCity[]): {
  uniqueNameCount: number;
  matchedUniqueNameCount: number;
  ambiguousNameCount: number;
  unmatchedNameCount: number;
  ambiguousExamples: TourismDestinationGap[];
  unmatchedExamples: TourismDestinationGap[];
} {
  const index = cityNameIndex(cities);
  const rawByName = new Map<string, RawDestination>();
  for (const destination of rawDestinations) {
    const normalized = normalizeName(destination.name);
    if (!normalized || rawByName.has(normalized)) continue;
    rawByName.set(normalized, destination);
  }

  let matchedUniqueNameCount = 0;
  let ambiguousNameCount = 0;
  let unmatchedNameCount = 0;
  const ambiguousExamples: TourismDestinationGap[] = [];
  const unmatchedExamples: TourismDestinationGap[] = [];

  for (const [normalized, destination] of rawByName) {
    const matches = index.get(normalized) ?? [];
    const countries = new Set(matches.map((city) => city.countryCode));
    if (matches.length === 0) {
      unmatchedNameCount += 1;
      if (unmatchedExamples.length < 40) {
        unmatchedExamples.push({ id: destination.id, name: destination.name, source: destination.source, reason: '没有匹配到 GeoNames 人口地点名称' });
      }
    } else if (countries.size === 1) {
      matchedUniqueNameCount += 1;
    } else {
      ambiguousNameCount += 1;
      if (ambiguousExamples.length < 40) {
        ambiguousExamples.push({ id: destination.id, name: destination.name, source: destination.source, reason: `匹配到多个国家：${[...countries].sort().slice(0, 8).join(', ')}` });
      }
    }
  }

  return {
    uniqueNameCount: rawByName.size,
    matchedUniqueNameCount,
    ambiguousNameCount,
    unmatchedNameCount,
    ambiguousExamples,
    unmatchedExamples
  };
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function reportMarkdown(report: TourismDestinationReport): string {
  const sourceRows = report.rawData.sources.map((source) => `| ${source.source} | ${source.extractable} | ${source.count ?? '-'} | ${source.url} |`).join('\n');
  const countryRows = Object.entries(report.output.byCountry)
    .slice(0, 40)
    .map(([countryCode, count]) => `| ${countryCode} | ${count} |`)
    .join('\n');
  const modeRows = Object.entries(report.output.byWeatherMode).map(([mode, count]) => `| ${mode} | ${count} |`).join('\n');
  const rawModeRows = Object.entries(report.rawGenerated.byWeatherMode).map(([mode, count]) => `| ${mode} | ${count} |`).join('\n');
  const rawSourceRows = Object.entries(report.rawGenerated.bySource).map(([source, count]) => `| ${source} | ${count} |`).join('\n');
  const unmatchedRows = report.unmatchedOverrides.map((item) => `| ${item.id} | ${item.name} | ${item.reason} |`).join('\n');
  const skippedRows = report.rawSkippedExamples.map((item) => `| ${item.id} | ${item.name} | ${item.source} | ${item.reason} |`).join('\n');

  return [
    '# 旅游目的地报告',
    '',
    `版本：\`${report.version}\``,
    `生成时间：\`${report.generatedAt}\``,
    `raw 目录：\`${report.rawData.path ?? '无'}\``,
    '',
    '## raw 来源',
    '',
    `- raw 目的地：${report.rawData.destinationCount}`,
    `- raw 去重名称：${report.rawData.uniqueNameCount}`,
    `- raw 名称匹配 GeoNames：${report.rawData.matchedUniqueNameCount}`,
    `- raw 歧义名称：${report.rawData.ambiguousNameCount}`,
    `- raw 未匹配名称：${report.rawData.unmatchedNameCount}`,
    '',
    '| 来源 | 可抽取 | 数量 | URL |',
    '| --- | --- | ---: | --- |',
    sourceRows || '| - | - | 0 | - |',
    '',
    '## raw 提升结果',
    '',
    `- 提升的 raw 目的地：${report.rawGenerated.promotedCount}`,
    `- 跳过的 raw 目的地：${report.rawGenerated.skippedCount}`,
    '',
    '| 来源 | 提升数量 |',
    '| --- | ---: |',
    rawSourceRows || '| - | 0 |',
    '',
    '| 天气处理模式 | 提升数量 |',
    '| --- | ---: |',
    rawModeRows || '| - | 0 |',
    '',
    '## 人工输入',
    '',
    `- 人工目的地：${report.overrides.overrideCount}`,
    `- 已对齐目的地：${report.overrides.alignedCount}`,
    `- 未匹配目的地：${report.overrides.unmatchedCount}`,
    '',
    '## 输出',
    '',
    `- 目的地：${report.output.destinationCount}`,
    '',
    '| 天气处理模式 | 数量 |',
    '| --- | ---: |',
    modeRows || '| - | 0 |',
    '',
    '## 目的地最多的国家',
    '',
    '| 国家 | 目的地数 |',
    '| --- | ---: |',
    countryRows || '| - | 0 |',
    '',
    '## 未匹配人工输入',
    '',
    '| ID | 名称 | 原因 |',
    '| --- | --- | --- |',
    unmatchedRows || '| - | - | - |',
    '',
    '## raw 跳过示例',
    '',
    '| ID | 名称 | 来源 | 原因 |',
    '| --- | --- | --- | --- |',
    skippedRows || '| - | - | - | - |',
    ''
  ].join('\n');
}

export async function runGenerateTourismDestinations(): Promise<void> {
  const [{ summary: rawSummary, destinations: rawDestinations }, overrides, countryNameAliases, dataset] = await Promise.all([
    loadRawData(),
    readYaml<ManualTourismDestinationOverride[]>(overridesPath),
    readYaml<CountryNameAlias[]>(countryNameAliasesPath),
    loadGeoNamesDataset(rootDir)
  ]);

  const groupedCities = citiesByCountry(dataset.cities);
  const rawResult = alignRawDestinations(rawDestinations, dataset.cities, groupedCities, buildCountryCodeByName(dataset.countries, countryNameAliases));
  const overrideResult = alignOverrides(overrides, groupedCities);
  const destinations = mergeDestinations([...rawResult.destinations, ...overrideResult.destinations]);
  const rawMatchSummary = summarizeRawMatches(rawDestinations, dataset.cities);
  const generatedAt = new Date().toISOString();
  const version = generatedDataVersion('tourism-destinations', destinations);
  const report: TourismDestinationReport = {
    version,
    generatedAt,
    rawData: {
      path: rawSummary?.outputDir ?? null,
      generatedAt: rawSummary?.generatedAt ?? null,
      sourceCount: rawSummary?.sources.length ?? 0,
      destinationCount: rawDestinations.length,
      uniqueNameCount: rawMatchSummary.uniqueNameCount,
      sources: rawSummary?.sources ?? [],
      matchedUniqueNameCount: rawMatchSummary.matchedUniqueNameCount,
      ambiguousNameCount: rawMatchSummary.ambiguousNameCount,
      unmatchedNameCount: rawMatchSummary.unmatchedNameCount
    },
    overrides: {
      overrideCount: overrides.length,
      alignedCount: overrideResult.destinations.length,
      unmatchedCount: overrideResult.unmatched.length
    },
    rawGenerated: {
      promotedCount: rawResult.destinations.length,
      skippedCount: rawResult.skipped.length,
      bySource: countBy(rawResult.destinations, (item) => item.source),
      byWeatherMode: countBy(rawResult.destinations, (item) => item.weatherMode)
    },
    output: {
      destinationCount: destinations.length,
      bySource: countBy(destinations, (item) => item.source),
      byWeatherMode: countBy(destinations, (item) => item.weatherMode),
      byCountry: countBy(destinations, (item) => item.countryCode)
    },
    unmatchedOverrides: overrideResult.unmatched,
    rawSkippedExamples: rawResult.skipped.slice(0, 80),
    rawAmbiguousExamples: rawMatchSummary.ambiguousExamples,
    rawUnmatchedExamples: rawMatchSummary.unmatchedExamples
  };

  await mkdir(generatedDir, { recursive: true });
  await mkdir(reportDir, { recursive: true });
  await rm(legacyOutputPath, { force: true });
  await writeFile(outputPath, jsonLineContent(destinations));
  await writeFile(reportMarkdownPath, reportMarkdown(report));

  console.log(`Generated ${destinations.length} tourism destinations from ${rawResult.destinations.length} raw promotions, ${overrides.length} overrides and ${rawDestinations.length} raw destinations (${version}).`);
}
