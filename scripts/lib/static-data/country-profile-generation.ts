/**
 * 文件说明: 从 GeoNames 原始数据、生成后的旅游目的地输入和覆盖规则生成国家 C1/C2/C3 分档与行政区统计报告。
 * 对应文档: docs/specs/30-weather-coverage-design.md, docs/specs/31-data-flow.md
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import {
  buildSupportedAdmin2KeySet,
  detailedCoverageCountry,
  isSupportedAdmin2ByKey,
  loadAdmin2SupportOverrides,
  loadCoverageOverrides,
  type CoverageOverrideSeed
} from './coverage-overrides.js';
import { loadGeoNamesDataset, type GeoNamesAdmin1, type GeoNamesAdmin2, type GeoNamesCity } from './geonames.js';
import type { CountryTier } from 'weather-core/types';

type CoverageRules = {
  version: number;
  cityBudget: {
    maxCities: number;
    targetMinCities: number;
    targetMaxCities: number;
  };
  populationFallback: {
    globalHotspot: number;
    major: number;
    regional: number;
    baseline: number;
    largeCountryBoost: Array<{ minPopulation: number; value: number }>;
  };
  tierRules: {
    globalHotspot: { minTravelSeedCount: number; minTravelSeedScore: number };
    major: { minTravelSeedCount: number; minTravelSeedScore: number; minAreaSqKm: number; minPopulation: number };
    regional: { minTravelSeedCount: number; minPopulation: number };
  };
  detailedCoverageRules: {
    c3: {
      minAdmin2Count: number;
      maxAdmin2Count: number;
      minAdmin2CityCoverageRatio: number;
      minAreaSqKm: number;
      minSpatialScore: number;
      minTravelSeedScore: number;
    };
    c2: {
      minAdmin1Count: number;
      largeAreaSqKm: number;
      largeAdmin2Count: number;
      minSpatialScore: number;
      minTravelSeedScore: number;
    };
  };
};

type TourismSeed = {
  id: string;
  name: string;
  countryCode: string;
  geonameId?: number;
  mappedGeonameId?: number;
  priority: number;
};

type CountryAdminStats = {
  countryCode: string;
  countryName: string;
  continentCode: string;
  areaSqKm: number;
  population: number;
  cityCandidateCount: number;
  populatedCandidateCount: number;
  admin1Count: number;
  admin2Count: number;
  supportedAdmin2Count: number;
  admin1WithCityCandidateCount: number;
  admin2WithCityCandidateCount: number;
  admin2CityCoverageRatio: number;
  latitudeSpan: number;
  longitudeSpan: number;
  elevationP10M: number;
  elevationP90M: number;
  elevationSpanM: number;
  tourismSeedCount: number;
  tourismSeedScore: number;
  spatialScore: number;
};

type CountryProfile = {
  countryCode: string;
  tier: 'global_hotspot' | 'major' | 'regional' | 'baseline';
  countryTier: CountryTier;
  detailedCoverage?: 'admin1' | 'admin2';
  populationFallback: number;
};

type CountryProfileReport = {
  version: string;
  generatedAt: string;
  rulesVersion: number;
  source: {
    cityCandidateCount: number;
    admin1Count: number;
    admin2Count: number;
    tourismSeedCount: number;
  };
  budget: CoverageRules['cityBudget'];
  profileCount: number;
  countryTierCounts: Record<CountryTier, number>;
  expectedRepresentativeCounts: {
    c2Admin1: number;
    c3Admin2: number;
  };
  c2Countries: Array<{ countryCode: string; stats: Pick<CountryAdminStats, 'admin1Count' | 'admin2Count' | 'areaSqKm' | 'tourismSeedScore' | 'spatialScore'> }>;
  c3Countries: Array<{ countryCode: string; stats: Pick<CountryAdminStats, 'supportedAdmin2Count' | 'admin2Count' | 'admin2CityCoverageRatio' | 'areaSqKm' | 'tourismSeedScore' | 'spatialScore'> }>;
};

type CountryTierCandidate = {
  countryCode: string;
  countryNameZh: string;
  c3Candidate: boolean;
  c2Candidate: boolean;
  c3PriorityScore: number;
  c2PriorityScore: number;
  c1PointCount: number;
  c2PointCount: number;
  c2AddedCityCount: number;
  c2DuplicateCount: number;
  c3PointCount: number;
  c3AddedCityCount: number;
  c3AddedOverC2CityCount: number;
  c3DuplicateCount: number;
  missingAdmin1RepresentativeCount: number;
  missingAdmin2RepresentativeCount: number;
  stats: Pick<CountryAdminStats,
    | 'admin1Count'
    | 'admin2Count'
    | 'supportedAdmin2Count'
    | 'admin2CityCoverageRatio'
    | 'areaSqKm'
    | 'latitudeSpan'
    | 'longitudeSpan'
    | 'elevationSpanM'
    | 'population'
    | 'tourismSeedCount'
    | 'tourismSeedScore'
    | 'spatialScore'
  >;
};

type CountryTierCandidateReport = {
  version: string;
  generatedAt: string;
  rulesVersion: number;
  source: CountryProfileReport['source'];
  budget: CoverageRules['cityBudget'];
  candidateCount: number;
  candidates: CountryTierCandidate[];
};

const supportedFeatureCodes = new Set(['PPLC', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPL']);
const countryDisplayNamesZh = new Intl.DisplayNames(['zh-Hans'], { type: 'region' });
const adminRepresentativeFeatureRank: Record<string, number> = {
  PPLC: 1,
  PPLA2: 1,
  PPLA: 2,
  PPLA4: 3,
  PPLA3: 4,
  PPL: 5
};

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

async function readYaml<T>(filePath: string): Promise<T> {
  return YAML.parse(await readFile(filePath, 'utf8')) as T;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function longitudeSpan(longitudes: number[]): number {
  if (longitudes.length <= 1) return 0;
  const normalized = longitudes.map((value) => ((value % 360) + 360) % 360).sort((a, b) => a - b);
  let largestGap = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    const next = normalized[(index + 1) % normalized.length] + (index + 1 === normalized.length ? 360 : 0);
    largestGap = Math.max(largestGap, next - current);
  }
  return 360 - largestGap;
}

function tourismSeedScore(seeds: TourismSeed[]): number {
  return seeds.reduce((sum, seed) => sum + Math.max(1, 40 - seed.priority), 0);
}

function spatialScore(stats: {
  areaSqKm: number;
  latitudeSpan: number;
  longitudeSpan: number;
  elevationSpanM: number;
}): number {
  let score = 0;
  if (stats.areaSqKm >= 7_000_000) score += 6;
  else if (stats.areaSqKm >= 2_000_000) score += 5;
  else if (stats.areaSqKm >= 900_000) score += 4;
  else if (stats.areaSqKm >= 300_000) score += 2;
  else if (stats.areaSqKm >= 80_000) score += 1;
  if (stats.latitudeSpan >= 35) score += 3;
  else if (stats.latitudeSpan >= 20) score += 2;
  else if (stats.latitudeSpan >= 10) score += 1;
  if (stats.longitudeSpan >= 45) score += 3;
  else if (stats.longitudeSpan >= 25) score += 2;
  else if (stats.longitudeSpan >= 12) score += 1;
  if (stats.elevationSpanM >= 2500) score += 3;
  else if (stats.elevationSpanM >= 1200) score += 2;
  else if (stats.elevationSpanM >= 600) score += 1;
  return score;
}

function groupByCountry<T extends { countryCode: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(item.countryCode) ?? [];
    list.push(item);
    groups.set(item.countryCode, list);
  }
  return groups;
}

function supportedAdmin2Items(supportedAdmin2Keys: Set<string>, items: GeoNamesAdmin2[]): GeoNamesAdmin2[] {
  return items.filter((admin2) => isSupportedAdmin2ByKey(supportedAdmin2Keys, admin2));
}

function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compareByPopulation(left: GeoNamesCity, right: GeoNamesCity): number {
  return right.population - left.population || left.featureCode.localeCompare(right.featureCode) || left.id.localeCompare(right.id);
}

function compareRepresentative(
  left: GeoNamesCity,
  right: GeoNamesCity,
  regionName: string,
  seedPriorityByGeonameId: Map<number, number>
): number {
  const normalizedRegionName = normalizeName(regionName).split(' ')[0] ?? '';
  const leftNames = [left.name, left.asciiName, ...left.alternateNames].map((name) => normalizeName(name).split(' ')[0] ?? '');
  const rightNames = [right.name, right.asciiName, ...right.alternateNames].map((name) => normalizeName(name).split(' ')[0] ?? '');
  const leftNameMatches = leftNames.includes(normalizedRegionName) ? 0 : 1;
  const rightNameMatches = rightNames.includes(normalizedRegionName) ? 0 : 1;

  return (
    (seedPriorityByGeonameId.get(left.geonameId) ?? 9999) - (seedPriorityByGeonameId.get(right.geonameId) ?? 9999) ||
    leftNameMatches - rightNameMatches ||
    (adminRepresentativeFeatureRank[left.featureCode] ?? 9) - (adminRepresentativeFeatureRank[right.featureCode] ?? 9) ||
    right.population - left.population ||
    left.id.localeCompare(right.id)
  );
}

function cityMatchesAdmin2Name(city: GeoNamesCity, admin2: GeoNamesAdmin2): boolean {
  const admin2Names = new Set([normalizeName(admin2.name), normalizeName(admin2.asciiName)].filter(Boolean));
  return [city.name, city.asciiName, ...city.alternateNames].map(normalizeName).some((name) => admin2Names.has(name));
}

function cityAsAdmin2Representative(city: GeoNamesCity, admin2: GeoNamesAdmin2): GeoNamesCity {
  return {
    ...city,
    admin1Code: admin2.admin1Code,
    admin2Code: admin2.admin2Code
  };
}

function buildCountryStats(
  supportedAdmin2Keys: Set<string>,
  seeds: TourismSeed[],
  cities: GeoNamesCity[],
  admin1ByCountry: Map<string, unknown[]>,
  admin2ByCountry: Map<string, GeoNamesAdmin2[]>,
  countries: Awaited<ReturnType<typeof loadGeoNamesDataset>>['countries']
): CountryAdminStats[] {
  const citiesByCountry = groupByCountry(cities);
  const seedsByCountry = groupByCountry(seeds);
  const populatedSupportedCities = cities.filter((city) => city.population > 0 && supportedFeatureCodes.has(city.featureCode));
  const admin1KeysWithCity = new Set(populatedSupportedCities.flatMap((city) => city.admin1Code ? [`${city.countryCode}.${city.admin1Code}`] : []));
  const admin2KeysWithCity = new Set(
    populatedSupportedCities.flatMap((city) => city.admin1Code && city.admin2Code ? [`${city.countryCode}.${city.admin1Code}.${city.admin2Code}`] : [])
  );

  return [...countries.values()]
    .flatMap((country): CountryAdminStats[] => {
      const countryCities = citiesByCountry.get(country.code) ?? [];
      if (countryCities.length === 0) return [];

      const countryAdmin1 = admin1ByCountry.get(country.code) ?? [];
      const countryAdmin2 = admin2ByCountry.get(country.code) ?? [];
      const supportedAdmin2 = supportedAdmin2Items(supportedAdmin2Keys, countryAdmin2);
      const elevations = countryCities.map((city) => city.elevation ?? city.dem).filter((value): value is number => typeof value === 'number');
      const latitudes = countryCities.map((city) => city.latitude);
      const longitudes = countryCities.map((city) => city.longitude);
      const countrySeeds = seedsByCountry.get(country.code) ?? [];
      const supportedAdmin2Count = supportedAdmin2.length;
      const admin2WithCityCandidateCount = supportedAdmin2.filter((admin2) =>
        admin2KeysWithCity.has(`${admin2.countryCode}.${admin2.admin1Code}.${admin2.admin2Code}`)
      ).length;
      const elevationP10M = percentile(elevations, 0.1);
      const elevationP90M = percentile(elevations, 0.9);
      const baseStats = {
        areaSqKm: country.areaSqKm,
        latitudeSpan: round(Math.max(...latitudes) - Math.min(...latitudes)),
        longitudeSpan: round(longitudeSpan(longitudes)),
        elevationSpanM: Math.max(0, elevationP90M - elevationP10M)
      };

      return [{
        countryCode: country.code,
        countryName: country.name,
        continentCode: country.continentCode,
        areaSqKm: country.areaSqKm,
        population: country.population,
        cityCandidateCount: countryCities.length,
        populatedCandidateCount: countryCities.filter((city) => city.population > 0).length,
        admin1Count: countryAdmin1.length,
        admin2Count: countryAdmin2.length,
        supportedAdmin2Count,
        admin1WithCityCandidateCount: countryAdmin1.filter((admin1) => admin1KeysWithCity.has(`${country.code}.${(admin1 as { admin1Code: string }).admin1Code}`)).length,
        admin2WithCityCandidateCount,
        admin2CityCoverageRatio: supportedAdmin2Count > 0 ? round(admin2WithCityCandidateCount / supportedAdmin2Count, 4) : 0,
        latitudeSpan: baseStats.latitudeSpan,
        longitudeSpan: baseStats.longitudeSpan,
        elevationP10M,
        elevationP90M,
        elevationSpanM: baseStats.elevationSpanM,
        tourismSeedCount: countrySeeds.length,
        tourismSeedScore: tourismSeedScore(countrySeeds),
        spatialScore: spatialScore(baseStats)
      }];
    })
    .sort((a, b) => a.countryCode.localeCompare(b.countryCode));
}

function classifyTier(stats: CountryAdminStats, rules: CoverageRules): CountryProfile['tier'] {
  if (
    stats.tourismSeedCount >= rules.tierRules.globalHotspot.minTravelSeedCount &&
    stats.tourismSeedScore >= rules.tierRules.globalHotspot.minTravelSeedScore
  ) {
    return 'global_hotspot';
  }
  if (
    stats.tourismSeedCount >= rules.tierRules.major.minTravelSeedCount ||
    stats.tourismSeedScore >= rules.tierRules.major.minTravelSeedScore ||
    stats.areaSqKm >= rules.tierRules.major.minAreaSqKm ||
    stats.population >= rules.tierRules.major.minPopulation
  ) {
    return 'major';
  }
  if (
    stats.tourismSeedCount >= rules.tierRules.regional.minTravelSeedCount ||
    stats.population >= rules.tierRules.regional.minPopulation
  ) {
    return 'regional';
  }
  return 'baseline';
}

function populationFallback(stats: CountryAdminStats, tier: CountryProfile['tier'], rules: CoverageRules): number {
  const largeCountryValue = rules.populationFallback.largeCountryBoost.find((item) => stats.population >= item.minPopulation)?.value;
  if (largeCountryValue) return largeCountryValue;
  if (tier === 'global_hotspot') return rules.populationFallback.globalHotspot;
  if (tier === 'major') return rules.populationFallback.major;
  if (tier === 'regional') return rules.populationFallback.regional;
  return rules.populationFallback.baseline;
}

function isC3Candidate(stats: CountryAdminStats, rules: CoverageRules): boolean {
  const exceedsGeneralMax = stats.supportedAdmin2Count > rules.detailedCoverageRules.c3.maxAdmin2Count;
  if (stats.supportedAdmin2Count < rules.detailedCoverageRules.c3.minAdmin2Count) return false;
  if (exceedsGeneralMax) return false;
  if (stats.admin2CityCoverageRatio < rules.detailedCoverageRules.c3.minAdmin2CityCoverageRatio) return false;
  if (stats.areaSqKm < rules.detailedCoverageRules.c3.minAreaSqKm) return false;
  if (stats.tourismSeedScore < rules.detailedCoverageRules.c3.minTravelSeedScore) return false;
  if (stats.spatialScore < rules.detailedCoverageRules.c3.minSpatialScore) return false;
  return true;
}

function isC2Candidate(stats: CountryAdminStats, rules: CoverageRules): boolean {
  if (stats.admin1Count < rules.detailedCoverageRules.c2.minAdmin1Count) return false;
  const largeArea = stats.areaSqKm >= rules.detailedCoverageRules.c2.largeAreaSqKm;
  const largeAdmin2 = stats.admin2Count >= rules.detailedCoverageRules.c2.largeAdmin2Count;
  const spatialTravel = stats.spatialScore >= rules.detailedCoverageRules.c2.minSpatialScore && stats.tourismSeedScore >= rules.detailedCoverageRules.c2.minTravelSeedScore;
  return largeArea || largeAdmin2 || spatialTravel;
}

function c3SortScore(stats: CountryAdminStats): number {
  return stats.tourismSeedScore + stats.spatialScore * 9 + stats.supportedAdmin2Count * 0.08 + stats.admin2CityCoverageRatio * 24;
}

function c2SortScore(stats: CountryAdminStats): number {
  return stats.tourismSeedScore + stats.spatialScore * 12 + Math.log10(Math.max(stats.areaSqKm, 1)) * 8 + stats.admin1Count * 0.5;
}

function projectedPointCounts(params: {
  stats: CountryAdminStats;
  rules: CoverageRules;
  countryCities: GeoNamesCity[];
  admin1Items: GeoNamesAdmin1[];
  admin2Items: GeoNamesAdmin2[];
  supportedAdmin2Keys: Set<string>;
  seedPriorityByGeonameId: Map<number, number>;
}): Pick<CountryTierCandidate,
  | 'c1PointCount'
  | 'c2PointCount'
  | 'c2AddedCityCount'
  | 'c2DuplicateCount'
  | 'c3PointCount'
  | 'c3AddedCityCount'
  | 'c3AddedOverC2CityCount'
  | 'c3DuplicateCount'
  | 'missingAdmin1RepresentativeCount'
  | 'missingAdmin2RepresentativeCount'
> {
  const tier = classifyTier(params.stats, params.rules);
  const fallbackCount = populationFallback(params.stats, tier, params.rules);
  const baseIds = new Set(
    params.countryCities
      .filter((city) => city.population > 0 && supportedFeatureCodes.has(city.featureCode))
      .sort(compareByPopulation)
      .slice(0, fallbackCount)
      .map((city) => city.id)
  );

  const admin1RepresentativeIds: string[] = [];
  let missingAdmin1RepresentativeCount = 0;
  for (const admin1 of params.admin1Items) {
    const candidates = params.countryCities.filter((city) =>
      city.admin1Code === admin1.admin1Code && city.population > 0 && supportedFeatureCodes.has(city.featureCode)
    );
    const representative = candidates.sort((left, right) =>
      compareRepresentative(left, right, admin1.asciiName, params.seedPriorityByGeonameId)
    )[0];
    if (representative) admin1RepresentativeIds.push(representative.id);
    else missingAdmin1RepresentativeCount += 1;
  }

  const admin2RepresentativeIds: string[] = [];
  let missingAdmin2RepresentativeCount = 0;
  for (const admin2 of params.admin2Items) {
    if (!isSupportedAdmin2ByKey(params.supportedAdmin2Keys, admin2)) continue;
    const directCandidates = params.countryCities.filter((city) =>
      city.admin1Code === admin2.admin1Code &&
      city.admin2Code === admin2.admin2Code &&
      city.population > 0 &&
      supportedFeatureCodes.has(city.featureCode)
    );
    const nameMatchedCandidates = params.countryCities
      .filter((city) => city.admin1Code === admin2.admin1Code && city.population > 0 && supportedFeatureCodes.has(city.featureCode))
      .filter((city) => cityMatchesAdmin2Name(city, admin2))
      .map((city) => cityAsAdmin2Representative(city, admin2));
    const representative = [...directCandidates, ...nameMatchedCandidates].sort((left, right) =>
      compareRepresentative(left, right, admin2.asciiName, params.seedPriorityByGeonameId)
    )[0];
    if (representative) admin2RepresentativeIds.push(representative.id);
    else missingAdmin2RepresentativeCount += 1;
  }

  const c2Ids = new Set([...baseIds, ...admin1RepresentativeIds]);
  const c3Ids = new Set([...baseIds, ...admin1RepresentativeIds, ...admin2RepresentativeIds]);
  return {
    c1PointCount: baseIds.size,
    c2PointCount: c2Ids.size,
    c2AddedCityCount: c2Ids.size - baseIds.size,
    c2DuplicateCount: baseIds.size + admin1RepresentativeIds.length - c2Ids.size,
    c3PointCount: c3Ids.size,
    c3AddedCityCount: c3Ids.size - baseIds.size,
    c3AddedOverC2CityCount: c3Ids.size - c2Ids.size,
    c3DuplicateCount: baseIds.size + admin1RepresentativeIds.length + admin2RepresentativeIds.length - c3Ids.size,
    missingAdmin1RepresentativeCount,
    missingAdmin2RepresentativeCount
  };
}

function buildSeedPriorityByGeonameId(seeds: TourismSeed[]): Map<number, number> {
  const result = new Map<number, number>();
  for (const seed of seeds) {
    for (const geonameId of [seed.geonameId, seed.mappedGeonameId]) {
      if (!geonameId) continue;
      result.set(geonameId, Math.min(result.get(geonameId) ?? 9999, seed.priority));
    }
  }
  return result;
}

function selectDetailedCountries(statsRows: CountryAdminStats[], overrideSeed: CoverageOverrideSeed): Map<string, { detailedCoverage: 'admin1' | 'admin2' }> {
  const selected = new Map<string, { detailedCoverage: 'admin1' | 'admin2' }>();
  const knownCountryCodes = new Set(statsRows.map((stats) => stats.countryCode));
  for (const stats of statsRows) {
    const override = detailedCoverageCountry(overrideSeed, stats.countryCode);
    if (!override || !knownCountryCodes.has(stats.countryCode)) continue;
    selected.set(stats.countryCode, { detailedCoverage: override.detailedCoverage });
  }
  return selected;
}

function toProfile(stats: CountryAdminStats, rules: CoverageRules, detailed: { detailedCoverage: 'admin1' | 'admin2' } | undefined): CountryProfile {
  const tier = classifyTier(stats, rules);
  const countryTier: CountryTier = detailed?.detailedCoverage === 'admin2' ? 'C3' : detailed?.detailedCoverage === 'admin1' ? 'C2' : 'C1';
  return {
    countryCode: stats.countryCode,
    tier,
    countryTier,
    ...(detailed && { detailedCoverage: detailed.detailedCoverage }),
    populationFallback: populationFallback(stats, tier, rules)
  };
}

function buildCountryTierCandidates(
  rules: CoverageRules,
  statsRows: CountryAdminStats[],
  profiles: CountryProfile[],
  seeds: TourismSeed[],
  dataset: Awaited<ReturnType<typeof loadGeoNamesDataset>>,
  supportedAdmin2Keys: Set<string>
): CountryTierCandidate[] {
  const profilesByCountry = new Map(profiles.map((profile) => [profile.countryCode, profile]));
  const citiesByCountry = groupByCountry(dataset.cities);
  const admin1ByCountry = groupByCountry(dataset.admin1Items);
  const admin2ByCountry = groupByCountry(dataset.admin2Items);
  const seedPriorityByGeonameId = buildSeedPriorityByGeonameId(seeds);
  return statsRows
    .flatMap((stats) => {
      const c3Candidate = isC3Candidate(stats, rules);
      const c2Candidate = c3Candidate || isC2Candidate(stats, rules);
      const selectedCountryTier = profilesByCountry.get(stats.countryCode)?.countryTier ?? 'C1';
      if (!c3Candidate && !c2Candidate && selectedCountryTier === 'C1') return [];
      const projected = projectedPointCounts({
        stats,
        rules,
        countryCities: citiesByCountry.get(stats.countryCode) ?? [],
        admin1Items: admin1ByCountry.get(stats.countryCode) ?? [],
        admin2Items: admin2ByCountry.get(stats.countryCode) ?? [],
        supportedAdmin2Keys,
        seedPriorityByGeonameId
      });
      return [{
        countryCode: stats.countryCode,
        countryNameZh: countryDisplayNamesZh.of(stats.countryCode) ?? stats.countryName,
        c3Candidate,
        c2Candidate,
        c3PriorityScore: round(c3SortScore(stats), 2),
        c2PriorityScore: round(c2SortScore(stats), 2),
        ...projected,
        stats: {
          supportedAdmin2Count: stats.supportedAdmin2Count,
          admin2Count: stats.admin2Count,
          admin1Count: stats.admin1Count,
          admin2CityCoverageRatio: stats.admin2CityCoverageRatio,
          areaSqKm: stats.areaSqKm,
          latitudeSpan: stats.latitudeSpan,
          longitudeSpan: stats.longitudeSpan,
          elevationSpanM: stats.elevationSpanM,
          population: stats.population,
          tourismSeedCount: stats.tourismSeedCount,
          tourismSeedScore: stats.tourismSeedScore,
          spatialScore: stats.spatialScore
        }
      }];
    })
    .sort((a, b) =>
      Number(b.c3Candidate) - Number(a.c3Candidate) ||
      b.c3PriorityScore - a.c3PriorityScore ||
      Number(b.c2Candidate) - Number(a.c2Candidate) ||
      b.c2PriorityScore - a.c2PriorityScore ||
      a.countryCode.localeCompare(b.countryCode)
    );
}

function buildCountryTierCandidateReport(
  version: string,
  generatedAt: string,
  rules: CoverageRules,
  statsRows: CountryAdminStats[],
  seeds: TourismSeed[],
  candidates: CountryTierCandidate[]
): CountryTierCandidateReport {
  return {
    version,
    generatedAt,
    rulesVersion: rules.version,
    source: {
      cityCandidateCount: statsRows.reduce((sum, stats) => sum + stats.cityCandidateCount, 0),
      admin1Count: statsRows.reduce((sum, stats) => sum + stats.admin1Count, 0),
      admin2Count: statsRows.reduce((sum, stats) => sum + stats.admin2Count, 0),
      tourismSeedCount: seeds.length
    },
    budget: rules.cityBudget,
    candidateCount: candidates.length,
    candidates
  };
}

function buildReport(
  version: string,
  generatedAt: string,
  rules: CoverageRules,
  statsRows: CountryAdminStats[],
  profiles: CountryProfile[],
  seeds: TourismSeed[],
  candidates: CountryTierCandidate[]
): CountryProfileReport {
  const c2Profiles = profiles.filter((profile) => profile.detailedCoverage === 'admin1');
  const c3Profiles = profiles.filter((profile) => profile.detailedCoverage === 'admin2');
  const statsByCountry = new Map(statsRows.map((stats) => [stats.countryCode, stats]));
  return {
    version,
    generatedAt,
    rulesVersion: rules.version,
    source: {
      cityCandidateCount: statsRows.reduce((sum, stats) => sum + stats.cityCandidateCount, 0),
      admin1Count: statsRows.reduce((sum, stats) => sum + stats.admin1Count, 0),
      admin2Count: statsRows.reduce((sum, stats) => sum + stats.admin2Count, 0),
      tourismSeedCount: seeds.length
    },
    budget: rules.cityBudget,
    profileCount: profiles.length,
    countryTierCounts: {
      C1: profiles.filter((profile) => profile.countryTier === 'C1').length,
      C2: c2Profiles.length,
      C3: c3Profiles.length
    },
    expectedRepresentativeCounts: {
      c2Admin1: c2Profiles.reduce((sum, profile) => sum + (statsByCountry.get(profile.countryCode)?.admin1Count ?? 0), 0),
      c3Admin2: c3Profiles.reduce((sum, profile) => sum + (statsByCountry.get(profile.countryCode)?.supportedAdmin2Count ?? 0), 0)
    },
    c2Countries: c2Profiles.map((profile) => {
      const stats = statsByCountry.get(profile.countryCode);
      return {
        countryCode: profile.countryCode,
        stats: {
          admin1Count: stats?.admin1Count ?? 0,
          admin2Count: stats?.admin2Count ?? 0,
          areaSqKm: stats?.areaSqKm ?? 0,
          tourismSeedScore: stats?.tourismSeedScore ?? 0,
          spatialScore: stats?.spatialScore ?? 0
        }
      };
    }).sort((a, b) => (candidates.find((item) => item.countryCode === b.countryCode)?.c2PriorityScore ?? 0) - (candidates.find((item) => item.countryCode === a.countryCode)?.c2PriorityScore ?? 0) || a.countryCode.localeCompare(b.countryCode)),
    c3Countries: c3Profiles.map((profile) => {
      const stats = statsByCountry.get(profile.countryCode);
      return {
        countryCode: profile.countryCode,
        stats: {
          supportedAdmin2Count: stats?.supportedAdmin2Count ?? 0,
          admin2Count: stats?.admin2Count ?? 0,
          admin2CityCoverageRatio: stats?.admin2CityCoverageRatio ?? 0,
          areaSqKm: stats?.areaSqKm ?? 0,
          tourismSeedScore: stats?.tourismSeedScore ?? 0,
          spatialScore: stats?.spatialScore ?? 0
        }
      };
    }).sort((a, b) => (candidates.find((item) => item.countryCode === b.countryCode)?.c3PriorityScore ?? 0) - (candidates.find((item) => item.countryCode === a.countryCode)?.c3PriorityScore ?? 0) || a.countryCode.localeCompare(b.countryCode))
  };
}

function reportMarkdown(report: CountryProfileReport): string {
  const c3Rows = report.c3Countries.map((item) =>
    `| ${item.countryCode} | ${item.stats.supportedAdmin2Count} | ${item.stats.admin2CityCoverageRatio} | ${item.stats.areaSqKm} | ${item.stats.tourismSeedScore} | ${item.stats.spatialScore} |`
  ).join('\n');
  const c2Rows = report.c2Countries.map((item) =>
    `| ${item.countryCode} | ${item.stats.admin1Count} | ${item.stats.admin2Count} | ${item.stats.areaSqKm} | ${item.stats.tourismSeedScore} | ${item.stats.spatialScore} |`
  ).join('\n');

  return [
    '# 国家分层结果报告',
    '',
    `版本：\`${report.version}\``,
    `生成时间：\`${report.generatedAt}\``,
    `规则版本：\`${report.rulesVersion}\``,
    '',
    '## 摘要',
    '',
    `- 国家分层配置：${report.profileCount}`,
    `- 国家层级：C1 ${report.countryTierCounts.C1}，C2 ${report.countryTierCounts.C2}，C3 ${report.countryTierCounts.C3}`,
    `- C2 预计 admin1 代表点：${report.expectedRepresentativeCounts.c2Admin1}`,
    `- C3 预计 admin2 代表点：${report.expectedRepresentativeCounts.c3Admin2}`,
    `- GeoNames 城市候选：${report.source.cityCandidateCount}`,
    '',
    '## C3 国家',
    '',
    '| 国家 | 支持的 admin2 | admin2 城市覆盖率 | 面积 km2 | 旅行分 | 空间分 |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    c3Rows || '| - | 0 | 0 | 0 | 0 | 0 |',
    '',
    '## C2 国家',
    '',
    '| 国家 | admin1 | admin2 | 面积 km2 | 旅行分 | 空间分 |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    c2Rows || '| - | 0 | 0 | 0 | 0 | 0 |',
    ''
  ].join('\n');
}

function countryTierCandidateReportMarkdown(report: CountryTierCandidateReport): string {
  const rows = report.candidates.map((item, index) =>
    `| ${index + 1} | ${item.countryCode} | ${item.countryNameZh} | ${item.c3Candidate ? '是' : '否'} | ${item.c3PriorityScore} | ${item.c2Candidate ? '是' : '否'} | ${item.c2PriorityScore} | ${item.c1PointCount} | ${item.c2PointCount} | +${item.c2AddedCityCount} | ${item.c2DuplicateCount} | ${item.c3PointCount} | +${item.c3AddedCityCount} | +${item.c3AddedOverC2CityCount} | ${item.c3DuplicateCount} | ${item.stats.areaSqKm} | ${item.stats.latitudeSpan} | ${item.stats.longitudeSpan} | ${item.stats.elevationSpanM} | ${item.stats.tourismSeedScore}/${item.stats.tourismSeedCount} | ${item.stats.spatialScore} | ${item.stats.admin1Count} | ${item.stats.supportedAdmin2Count}/${item.stats.admin2Count} | ${item.stats.admin2CityCoverageRatio} | ${item.missingAdmin1RepresentativeCount} | ${item.missingAdmin2RepresentativeCount} |`
  ).join('\n');

  return [
    '# 国家层级候选报告',
    '',
    `版本：\`${report.version}\``,
    `生成时间：\`${report.generatedAt}\``,
    `规则版本：\`${report.rulesVersion}\``,
    `候选国家：**${report.candidateCount}**`,
    `GeoNames 城市候选：**${report.source.cityCandidateCount}**`,
    '',
    '这张表按 C3 候选优先、C3 分数排序。`C1/C2/C3 点数` 是该国家在不同覆盖深度下的预计城市点数，已经按代表点去重。候选报告只做机械计算，最终国家层级决定写入 `data/input/country-tier-countries.yml`。',
    '',
    '| 排名 | 国家 | 中文名 | C3 候选 | C3 分 | C2 候选 | C2 分 | C1 点数 | C2 点数 | C2 新增 | C2 重合 | C3 点数 | C3 较 C1 新增 | C3 较 C2 新增 | C3 重合 | 面积 km2 | 纬度跨度 | 经度跨度 | 海拔跨度 m | 旅行分/数量 | 空间分 | admin1 | 支持的 admin2/admin2 | admin2 覆盖率 | 缺 admin1 代表点 | 缺 admin2 代表点 |',
    '| ---: | --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    rows || '| 0 | - | - | 否 | 0 | 否 | 0 | 0 | 0 | +0 | 0 | 0 | +0 | +0 | 0 | 0 | 0 | 0 | 0 | 0/0 | 0 | 0 | 0/0 | 0 | 0 | 0 |',
    ''
  ].join('\n');
}

async function loadCountryProfileInputs(rootDir: string, includeFinalCountryTierInput: boolean) {
  const rulesPath = path.join(rootDir, 'data', 'input', 'coverage-rules.yml');
  const tourismSeedsPath = path.join(rootDir, 'data', 'generated', 'tourism-destinations.json');
  const [rules, overrideSeed, seeds, dataset] = await Promise.all([
    readYaml<CoverageRules>(rulesPath),
    includeFinalCountryTierInput ? loadCoverageOverrides(rootDir) : loadAdmin2SupportOverrides(rootDir),
    readJson<TourismSeed[]>(tourismSeedsPath),
    loadGeoNamesDataset(rootDir)
  ]);
  const admin1ByCountry = groupByCountry(dataset.admin1Items);
  const admin2ByCountry = groupByCountry(dataset.admin2Items);
  const supportedAdmin2Keys = buildSupportedAdmin2KeySet(overrideSeed as CoverageOverrideSeed, dataset.admin2Items, dataset.cities, supportedFeatureCodes);
  const statsRows = buildCountryStats(supportedAdmin2Keys, seeds, dataset.cities, admin1ByCountry, admin2ByCountry, dataset.countries);
  return { rules, overrideSeed: overrideSeed as CoverageOverrideSeed, seeds, dataset, supportedAdmin2Keys, statsRows };
}

export async function generateCountryTierCandidateReport(rootDir = process.cwd()): Promise<CountryTierCandidateReport> {
  const generatedDir = path.join(rootDir, 'data', 'generated');
  const { rules, seeds, dataset, supportedAdmin2Keys, statsRows } = await loadCountryProfileInputs(rootDir, false);
  const hash = createHash('sha1').update(JSON.stringify({ rules, statsRows })).digest('hex').slice(0, 12);
  const version = `country-tier-candidates-${hash}`;
  const generatedAt = new Date().toISOString();
  const countryTierCandidates = buildCountryTierCandidates(rules, statsRows, [], seeds, dataset, supportedAdmin2Keys);
  const candidateReport = buildCountryTierCandidateReport(version, generatedAt, rules, statsRows, seeds, countryTierCandidates);

  await mkdir(generatedDir, { recursive: true });
  await writeFile(path.join(generatedDir, 'country-admin-stats.json'), `${JSON.stringify({ version, generatedAt, stats: statsRows }, null, 2)}\n`);
  await writeFile(path.join(generatedDir, 'country-tier-candidate-report.json'), `${JSON.stringify(candidateReport, null, 2)}\n`);
  await writeFile(path.join(generatedDir, 'country-tier-candidate-report.md'), countryTierCandidateReportMarkdown(candidateReport));
  return candidateReport;
}

export async function generateCountryProfiles(rootDir = process.cwd()): Promise<CountryProfileReport> {
  const generatedDir = path.join(rootDir, 'data', 'generated');
  const { rules, overrideSeed, seeds, dataset, supportedAdmin2Keys, statsRows } = await loadCountryProfileInputs(rootDir, true);
  const detailedCountries = selectDetailedCountries(statsRows, overrideSeed);
  const profiles = statsRows
    .map((stats) => toProfile(stats, rules, detailedCountries.get(stats.countryCode)))
    .sort((a, b) => {
      const tierOrder = { C3: 0, C2: 1, C1: 2 } satisfies Record<CountryTier, number>;
      return tierOrder[a.countryTier] - tierOrder[b.countryTier] || a.countryCode.localeCompare(b.countryCode);
    });
  const hash = createHash('sha1').update(JSON.stringify({ rules, statsRows, profiles })).digest('hex').slice(0, 12);
  const version = `country-profiles-${hash}`;
  const generatedAt = new Date().toISOString();
  const countryTierCandidates = buildCountryTierCandidates(rules, statsRows, profiles, seeds, dataset, supportedAdmin2Keys);
  const report = buildReport(version, generatedAt, rules, statsRows, profiles, seeds, countryTierCandidates);

  await mkdir(generatedDir, { recursive: true });
  await writeFile(path.join(generatedDir, 'country-admin-stats.json'), `${JSON.stringify({ version, generatedAt: report.generatedAt, stats: statsRows }, null, 2)}\n`);
  await writeFile(path.join(generatedDir, 'country-profiles.json'), `${JSON.stringify({ version, generatedAt: report.generatedAt, profiles }, null, 2)}\n`);
  await writeFile(path.join(generatedDir, 'country-profile-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(generatedDir, 'country-profile-report.md'), reportMarkdown(report));
  return report;
}
