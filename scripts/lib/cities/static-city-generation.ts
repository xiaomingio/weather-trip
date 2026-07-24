/**
 * 文件说明: 根据生成后的国家分档、GeoNames 全量城市候选和旅游目的地输入生成静态城市 Wire JSON 与筛选报告。
 * 参考资料: https://download.geonames.org/export/dump/readme.txt
 * 对应文档: docs/specs/30-weather-coverage-design.md, docs/specs/31-data-flow.md
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  Admin1RowWire,
  Admin2RowWire,
  CitiesPayloadWire,
  CountryRowWire,
  CountryTierCode,
  WorldRegionCode
} from 'weather-core/static-data';
import type { City, CountryTier } from 'weather-core/types';
import {
  loadGeoNamesDataset,
  readAlternateNamesFromZip,
  type GeoNamesAdmin1,
  type GeoNamesAdmin2,
  type GeoNamesCity
} from '../static-data/geonames.js';
import {
  buildSupportedAdmin2KeySet,
  isSupportedAdmin2ByKey,
  loadCoverageOverrides,
  type CoverageOverrideSeed
} from '../static-data/coverage-overrides.js';

type CountryProfile = {
  countryCode: string;
  tier: 'global_hotspot' | 'major' | 'regional' | 'baseline';
  countryTier: CountryTier;
  detailedCoverage?: 'admin1' | 'admin2';
  populationFallback: number;
};

type CountryProfilesPayload = {
  version: string;
  generatedAt: string;
  profiles: CountryProfile[];
};

type TourismSeed = {
  id: string;
  name: string;
  countryCode: string;
  geonameId?: number;
  mappedGeonameId?: number;
  source: 'curated' | 'wikivoyage' | 'unesco' | 'un-tourism-village' | 'reference-list';
  weatherMode: 'standalone' | 'map_to_nearest_city' | 'boost_existing_city';
  priority: number;
};

type SelectedCity = City & {
  geonameId: number;
  selectionPriority: number;
  selectionReasons: string[];
};

type CitySelectionCountryReport = {
  countryCode: string;
  name: string;
  countryTier: CountryTier;
  detailedCoverage: CountryProfile['detailedCoverage'] | null;
  cityCount: number;
  admin1Count: number;
  admin2Count: number;
};

type RegionGap = {
  regionKey: string;
  reason: string;
};

type WeakRepresentative = {
  cityId: string;
  countryCode: string;
  reason: string;
};

type TourismSeedGap = {
  seedId: string;
  name: string;
  countryCode: string;
  reason: string;
};

type CitySelectionReport = {
  version: string;
  generatedAt: string;
  cityProfilesVersion: string;
  sourceCityCount: number;
  cityCount: number;
  byCountryTier: Record<CountryTier, number>;
  bySelectionReason: Record<string, number>;
  byCountry: CitySelectionCountryReport[];
  missingAdmin1Representatives: RegionGap[];
  missingAdmin2Representatives: RegionGap[];
  weakRepresentatives: WeakRepresentative[];
  unmatchedTourismSeeds: TourismSeedGap[];
  unmatchedGeoBoundaries: RegionGap[];
  checksIncomplete: string[];
};

const rootDir = process.cwd();
const cityProfilesPath = path.join(rootDir, 'data', 'generated', 'country-profiles.json');
const tourismSeedsPath = path.join(rootDir, 'data', 'generated', 'tourism-destinations.json');
const generatedDir = path.join(rootDir, 'data', 'generated');
const publicDataDir = path.join(rootDir, 'apps', 'web', 'public', 'data');
const supportedFeatureCodes = new Set(['PPLC', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPL']);
const populationFeatureCodes = new Set(['PPLC', 'PPLA', 'PPLA2', 'PPLA3', 'PPL']);

const countryDisplayNames = {
  zh: new Intl.DisplayNames(['zh-CN'], { type: 'region' }),
  en: new Intl.DisplayNames(['en'], { type: 'region' })
};

const regionByContinentCode: Record<string, WorldRegionCode> = {
  AF: 'africa',
  AS: 'asia',
  EU: 'europe',
  NA: 'north_america',
  OC: 'oceania',
  SA: 'south_america'
};

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

function normalizeCityName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function countryTierCode(tier: CountryTier): CountryTierCode {
  if (tier === 'C3') return 3;
  if (tier === 'C2') return 2;
  return 1;
}

function localizedCountryName(countryCode: string): [en: string, zh: string] {
  const productCountryNames: Partial<Record<string, [en: string, zh: string]>> = {
    CN: ['China', '中国'],
    HK: ['Hong Kong', '香港'],
    MO: ['Macau', '澳门'],
    TW: ['Taiwan', '台湾']
  };
  const productName = productCountryNames[countryCode];
  if (productName) return productName;
  return [
    countryDisplayNames.en.of(countryCode) ?? countryCode,
    countryDisplayNames.zh.of(countryCode) ?? countryCode
  ];
}

function cityAdmin1Code(city: City): string | null {
  return city.admin1GroupCode ?? city.admin1Code ?? null;
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
  const normalizedRegionName = normalizeCityName(regionName).split(' ')[0] ?? '';
  const leftNames = [left.name, left.asciiName, ...left.alternateNames].map((name) => normalizeCityName(name).split(' ')[0] ?? '');
  const rightNames = [right.name, right.asciiName, ...right.alternateNames].map((name) => normalizeCityName(name).split(' ')[0] ?? '');
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
  const admin2Names = new Set([normalizeCityName(admin2.name), normalizeCityName(admin2.asciiName)].filter(Boolean));
  return [city.name, city.asciiName, ...city.alternateNames].map(normalizeCityName).some((name) => admin2Names.has(name));
}

function cityAsAdmin2Representative(city: GeoNamesCity, admin2: GeoNamesAdmin2): GeoNamesCity {
  return {
    ...city,
    admin1Code: admin2.admin1Code,
    admin2Code: admin2.admin2Code
  };
}

function findTourismSeedMatch(seed: TourismSeed, citiesByCountry: Map<string, GeoNamesCity[]>): GeoNamesCity | null {
  const countryCities = citiesByCountry.get(seed.countryCode) ?? [];
  const targetName = normalizeCityName(seed.name);
  const matches = countryCities.filter((city) => {
    if (seed.geonameId && city.geonameId === seed.geonameId) return true;
    if (seed.mappedGeonameId && city.geonameId === seed.mappedGeonameId) return true;
    if (!seed.geonameId && !seed.mappedGeonameId) {
      if (normalizeCityName(city.asciiName) === targetName) return true;
      return city.alternateNames.some((name) => normalizeCityName(name) === targetName);
    }
    return false;
  });

  return matches.sort(compareByPopulation)[0] ?? null;
}

function addSelection(
  selected: Map<string, { city: GeoNamesCity; reasons: Map<string, number> }>,
  city: GeoNamesCity,
  reason: string,
  priority: number
): void {
  const current = selected.get(city.id) ?? { city, reasons: new Map<string, number>() };
  const existingPriority = current.reasons.get(reason);
  if (existingPriority === undefined || priority < existingPriority) current.reasons.set(reason, priority);
  selected.set(city.id, current);
}

function chooseCities(
  cities: GeoNamesCity[],
  admin1Items: GeoNamesAdmin1[],
  admin2Items: GeoNamesAdmin2[],
  profiles: CountryProfile[],
  seeds: TourismSeed[],
  overrideSeed: CoverageOverrideSeed
): {
  selectedRows: Array<{ city: GeoNamesCity; reasons: string[]; priority: number }>;
  unmatchedSeeds: TourismSeedGap[];
  missingAdmin1Representatives: RegionGap[];
  missingAdmin2Representatives: RegionGap[];
} {
  const profilesByCountry = new Map(profiles.map((profile) => [profile.countryCode, profile]));
  const supportedAdmin2Keys = buildSupportedAdmin2KeySet(overrideSeed, admin2Items, cities, supportedFeatureCodes);
  const citiesByCountry = new Map<string, GeoNamesCity[]>();
  const seedPriorityByGeonameId = new Map<number, number>();
  const selected = new Map<string, { city: GeoNamesCity; reasons: Map<string, number> }>();

  for (const city of cities) {
    const list = citiesByCountry.get(city.countryCode) ?? [];
    list.push(city);
    citiesByCountry.set(city.countryCode, list);
  }

  const unmatchedSeeds: TourismSeedGap[] = [];
  for (const seed of seeds.filter((item) => item.weatherMode !== 'map_to_nearest_city' || item.mappedGeonameId)) {
    const city = findTourismSeedMatch(seed, citiesByCountry);
    if (!city) {
      unmatchedSeeds.push({ seedId: seed.id, name: seed.name, countryCode: seed.countryCode, reason: '未按 geonameId、mappedGeonameId、英文精确名或别名匹配到 GeoNames 城市' });
      continue;
    }
    seedPriorityByGeonameId.set(city.geonameId, Math.min(seedPriorityByGeonameId.get(city.geonameId) ?? 9999, seed.priority));
    addSelection(selected, city, `旅游目的地：${seed.source}`, seed.priority);
  }

  for (const city of cities) {
    if (city.featureCode === 'PPLC') addSelection(selected, city, '国家首都：PPLC', 10);
  }

  for (const [countryCode, countryCities] of citiesByCountry) {
    const fallbackCount = profilesByCountry.get(countryCode)?.populationFallback ?? 1;
    const ranked = countryCities
      .filter((city) => city.population > 0 && populationFeatureCodes.has(city.featureCode))
      .sort(compareByPopulation)
      .slice(0, fallbackCount);
    for (const city of ranked) addSelection(selected, city, '人口代表：国家配置', 80);
  }

  const missingAdmin1Representatives: RegionGap[] = [];
  const admin1CitiesByKey = new Map<string, GeoNamesCity[]>();
  for (const city of cities) {
    if (!city.admin1Code || city.population <= 0 || !supportedFeatureCodes.has(city.featureCode)) continue;
    const key = `${city.countryCode}.${city.admin1Code}`;
    const list = admin1CitiesByKey.get(key) ?? [];
    list.push(city);
    admin1CitiesByKey.set(key, list);
  }
  for (const admin1 of admin1Items) {
    const profile = profilesByCountry.get(admin1.countryCode);
    if (profile?.detailedCoverage !== 'admin1' && profile?.detailedCoverage !== 'admin2') continue;
    const candidates = admin1CitiesByKey.get(`${admin1.countryCode}.${admin1.admin1Code}`) ?? [];
    const representative = candidates.sort((left, right) => compareRepresentative(left, right, admin1.asciiName, seedPriorityByGeonameId))[0];
    if (representative) addSelection(selected, representative, '兜底：国家 admin1 代表点', 72);
    else missingAdmin1Representatives.push({ regionKey: `admin1:${admin1.countryCode}.${admin1.admin1Code}`, reason: 'admin1 没有可用的人口城市候选' });
  }

  const missingAdmin2Representatives: RegionGap[] = [];
  const admin2CitiesByKey = new Map<string, GeoNamesCity[]>();
  for (const city of cities) {
    if (!city.admin1Code || !city.admin2Code || city.population <= 0 || !supportedFeatureCodes.has(city.featureCode)) continue;
    const key = `${city.countryCode}.${city.admin1Code}.${city.admin2Code}`;
    const list = admin2CitiesByKey.get(key) ?? [];
    list.push(city);
    admin2CitiesByKey.set(key, list);
  }
  for (const admin2 of admin2Items) {
    const profile = profilesByCountry.get(admin2.countryCode);
    if (profile?.detailedCoverage !== 'admin2') continue;
    if (!isSupportedAdmin2ByKey(supportedAdmin2Keys, admin2)) continue;

    const directCandidates = admin2CitiesByKey.get(`${admin2.countryCode}.${admin2.admin1Code}.${admin2.admin2Code}`) ?? [];
    const nameMatchedCandidates = (citiesByCountry.get(admin2.countryCode) ?? [])
      .filter((city) => city.admin1Code === admin2.admin1Code && city.population > 0 && supportedFeatureCodes.has(city.featureCode))
      .filter((city) => cityMatchesAdmin2Name(city, admin2))
      .map((city) => cityAsAdmin2Representative(city, admin2));
    const candidates = [...directCandidates, ...nameMatchedCandidates];
    const representative = candidates.sort((left, right) => compareRepresentative(left, right, admin2.asciiName, seedPriorityByGeonameId))[0];
    if (representative) addSelection(selected, representative, '兜底：admin2 代表点', 70);
    else missingAdmin2Representatives.push({ regionKey: `admin2:${admin2.countryCode}.${admin2.admin1Code}.${admin2.admin2Code}`, reason: 'admin2 没有可用的人口城市候选' });
  }

  const selectedRows = [...selected.values()]
    .map(({ city, reasons }) => ({
      city,
      priority: Math.min(...reasons.values()),
      reasons: [...reasons.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([reason]) => reason)
    }))
    .sort((left, right) => left.priority - right.priority || right.city.population - left.city.population || left.city.countryCode.localeCompare(right.city.countryCode) || left.city.id.localeCompare(right.city.id));

  return { selectedRows, unmatchedSeeds, missingAdmin1Representatives, missingAdmin2Representatives };
}

function toCity(
  selected: { city: GeoNamesCity; reasons: string[]; priority: number },
  admin1ByKey: Map<string, GeoNamesAdmin1>,
  admin2ByKey: Map<string, GeoNamesAdmin2>,
  zhNameByGeonameId: Map<number, string>
): SelectedCity {
  const city = selected.city;
  const admin1 = city.admin1Code ? admin1ByKey.get(`${city.countryCode}.${city.admin1Code}`) : undefined;
  const admin2 = city.admin1Code && city.admin2Code ? admin2ByKey.get(`${city.countryCode}.${city.admin1Code}.${city.admin2Code}`) : undefined;

  return {
    id: city.id,
    geonameId: city.geonameId,
    names: {
      en: city.asciiName || city.name,
      zh: zhNameByGeonameId.get(city.geonameId) ?? city.asciiName ?? city.name
    },
    country: localizedCountryName(city.countryCode)[0],
    countryCode: city.countryCode,
    admin1: admin1?.asciiName ?? admin1?.name ?? city.admin1Code,
    admin1Code: city.admin1Code,
    admin1GroupCode: city.admin1Code,
    admin1LocalName: admin1 ? zhNameByGeonameId.get(admin1.geonameId) ?? admin1.asciiName : undefined,
    admin2: admin2?.asciiName ?? admin2?.name,
    admin2Code: city.admin2Code,
    admin2LocalName: admin2 ? zhNameByGeonameId.get(admin2.geonameId) ?? admin2.asciiName : undefined,
    latitude: city.latitude,
    longitude: city.longitude,
    timezone: city.timezone,
    population: city.population,
    elevationMeters: city.elevation ?? city.dem ?? 0,
    region: regionByContinentCode[city.continentCode] ?? 'asia',
    countryTier: undefined,
    selectionPriority: selected.priority,
    selectionReasons: selected.reasons
  };
}

function buildCitiesPayload(cities: SelectedCity[], profilesByCountry: Map<string, CountryProfile>, version: string): CitiesPayloadWire {
  const countries: CountryRowWire[] = [];
  const admin1Rows: Admin1RowWire[] = [];
  const admin2Rows: Admin2RowWire[] = [];
  const countryIndexByCode = new Map<string, number>();
  const admin1IndexByKey = new Map<string, number>();
  const admin2IndexByKey = new Map<string, number>();

  function ensureCountry(city: SelectedCity): number {
    const countryCode = city.countryCode ?? city.country;
    const current = countryIndexByCode.get(countryCode);
    if (current !== undefined) return current;

    const index = countries.length;
    countryIndexByCode.set(countryCode, index);
    countries.push([countryCode, localizedCountryName(countryCode), city.region, countryTierCode(profilesByCountry.get(countryCode)?.countryTier ?? 'C1')]);
    return index;
  }

  function ensureAdmin1(city: SelectedCity, countryIndex: number): number | null {
    const countryCode = city.countryCode ?? city.country;
    const code = cityAdmin1Code(city);
    if (!code) return null;
    const key = `${countryCode}.${code}`;
    const current = admin1IndexByKey.get(key);
    if (current !== undefined) return current;

    const index = admin1Rows.length;
    admin1IndexByKey.set(key, index);
    admin1Rows.push([countryIndex, code, [city.admin1 ?? code, city.admin1LocalName ?? city.admin1 ?? code]]);
    return index;
  }

  function ensureAdmin2(city: SelectedCity, countryIndex: number, admin1Index: number | null): number | null {
    const countryCode = city.countryCode ?? city.country;
    if (!city.admin2Code || admin1Index === null) return null;
    const key = `${countryCode}.${cityAdmin1Code(city)}.${city.admin2Code}`;
    const current = admin2IndexByKey.get(key);
    if (current !== undefined) return current;

    const index = admin2Rows.length;
    admin2IndexByKey.set(key, index);
    admin2Rows.push([countryIndex, admin1Index, city.admin2Code, [city.admin2 ?? city.admin2Code, city.admin2LocalName ?? city.admin2 ?? city.admin2Code]]);
    return index;
  }

  return {
    v: version,
    d: { co: countries, a1: admin1Rows, a2: admin2Rows },
    c: cities.map((city) => {
      const countryIndex = ensureCountry(city);
      const admin1Index = ensureAdmin1(city, countryIndex);
      const admin2Index = ensureAdmin2(city, countryIndex, admin1Index);
      return [
        city.id,
        [city.names.en, city.names.zh || city.names.en],
        countryIndex,
        admin1Index,
        admin2Index,
        Math.round(city.latitude * 100000),
        Math.round(city.longitude * 100000),
        Math.round(city.elevationMeters)
      ] as CitiesPayloadWire['c'][number];
    })
  };
}

function buildReport(
  cities: SelectedCity[],
  sourceCityCount: number,
  profilesPayload: CountryProfilesPayload,
  unmatchedTourismSeeds: TourismSeedGap[],
  missingAdmin1Representatives: RegionGap[],
  missingAdmin2Representatives: RegionGap[],
  version: string
): CitySelectionReport {
  const profilesByCountry = new Map(profilesPayload.profiles.map((profile) => [profile.countryCode, profile]));
  const byCountryTier: Record<CountryTier, number> = { C1: 0, C2: 0, C3: 0 };
  const bySelectionReason: Record<string, number> = {};
  const citiesByCountry = new Map<string, SelectedCity[]>();
  const weakRepresentatives: WeakRepresentative[] = [];

  for (const city of cities) {
    const countryCode = city.countryCode ?? city.country;
    const profile = profilesByCountry.get(countryCode);
    const list = citiesByCountry.get(countryCode) ?? [];
    list.push(city);
    citiesByCountry.set(countryCode, list);
    byCountryTier[profile?.countryTier ?? 'C1'] += 1;

    for (const reason of city.selectionReasons) {
      bySelectionReason[reason] = (bySelectionReason[reason] ?? 0) + 1;
    }
    if (!city.names.zh || city.names.zh === city.names.en) {
      weakRepresentatives.push({ cityId: city.id, countryCode, reason: '缺少中文城市名' });
    }
    if (profile?.detailedCoverage && !cityAdmin1Code(city)) {
      weakRepresentatives.push({ cityId: city.id, countryCode, reason: 'C2/C3 国家城市缺少 admin1 code' });
    }
  }

  const byCountry = [...citiesByCountry.entries()].map(([countryCode, countryCities]) => {
    const profile = profilesByCountry.get(countryCode);
    return {
      countryCode,
      name: countryDisplayNames.zh.of(countryCode) ?? countryCode,
      countryTier: profile?.countryTier ?? 'C1',
      detailedCoverage: profile?.detailedCoverage ?? null,
      cityCount: countryCities.length,
      admin1Count: new Set(countryCities.map(cityAdmin1Code).filter(Boolean)).size,
      admin2Count: new Set(countryCities.map((city) => city.admin2Code).filter(Boolean)).size
    };
  }).sort((a, b) => a.countryCode.localeCompare(b.countryCode));

  return {
    version,
    generatedAt: new Date().toISOString(),
    cityProfilesVersion: profilesPayload.version,
    sourceCityCount,
    cityCount: cities.length,
    byCountryTier,
    bySelectionReason: Object.fromEntries(Object.entries(bySelectionReason).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    byCountry,
    missingAdmin1Representatives,
    missingAdmin2Representatives,
    weakRepresentatives,
    unmatchedTourismSeeds,
    unmatchedGeoBoundaries: [
      {
        regionKey: 'geo-boundaries',
        reason: '边界匹配由 scripts/generate-static-geo.ts 生成，并在 data/generated/geo-boundary-report.* 复核'
      }
    ],
    checksIncomplete: [
      '运行 static:geo 后，在 data/generated/geo-boundary-report.* 复核边界匹配结果。',
      '部分 GeoNames admin2 没有人口城市候选，需要人工复核或补映射。'
    ]
  };
}

function reportMarkdown(report: CitySelectionReport): string {
  const topCountries = [...report.byCountry]
    .sort((a, b) => b.cityCount - a.cityCount || a.countryCode.localeCompare(b.countryCode))
    .slice(0, 40)
    .map((country) => `| ${country.countryCode} | ${country.name} | ${country.countryTier} | ${country.cityCount} | ${country.admin1Count} | ${country.admin2Count} |`)
    .join('\n');
  const reasonRows = Object.entries(report.bySelectionReason)
    .map(([reason, count]) => `| ${reason} | ${count} |`)
    .join('\n');

  return [
    '# 城市选择报告',
    '',
    `版本：\`${report.version}\``,
    `生成时间：\`${report.generatedAt}\``,
    `国家分层版本：\`${report.cityProfilesVersion}\``,
    `来源城市候选：**${report.sourceCityCount}**`,
    `入选城市数：**${report.cityCount}**`,
    `国家层级城市数：C1 ${report.byCountryTier.C1}，C2 ${report.byCountryTier.C2}，C3 ${report.byCountryTier.C3}`,
    '',
    '## 入选理由',
    '',
    '| 理由 | 城市数 |',
    '| --- | ---: |',
    reasonRows || '| - | 0 |',
    '',
    '## 城市数最多的国家',
    '',
    '| 国家 | 名称 | 档位 | 城市数 | admin1 | admin2 |',
    '| --- | --- | --- | ---: | ---: | ---: |',
    topCountries || '| - | - | - | 0 | 0 | 0 |',
    '',
    '## 检查',
    '',
    `- 缺 admin1 代表点：${report.missingAdmin1Representatives.length}`,
    `- 缺 admin2 代表点：${report.missingAdmin2Representatives.length}`,
    `- 弱代表点：${report.weakRepresentatives.length}`,
    `- 未匹配旅游目的地：${report.unmatchedTourismSeeds.length}`,
    `- 未匹配边界：${report.unmatchedGeoBoundaries.length}`,
    '',
    '## 待复核',
    '',
    ...report.checksIncomplete.map((item) => `- ${item}`),
    ''
  ].join('\n');
}

export async function runGenerateStaticCities(): Promise<void> {
const [profilesPayload, seeds, overrideSeed, dataset] = await Promise.all([
  readJson<CountryProfilesPayload>(cityProfilesPath),
  readJson<TourismSeed[]>(tourismSeedsPath),
  loadCoverageOverrides(rootDir),
  loadGeoNamesDataset(rootDir, { includeAlternateNames: true })
]);
const profiles = profilesPayload.profiles;
const profilesByCountry = new Map(profiles.map((profile) => [profile.countryCode, profile]));
const admin1ByKey = new Map(dataset.admin1Items.map((admin1) => [`${admin1.countryCode}.${admin1.admin1Code}`, admin1]));
const admin2ByKey = new Map(dataset.admin2Items.map((admin2) => [`${admin2.countryCode}.${admin2.admin1Code}.${admin2.admin2Code}`, admin2]));
const { selectedRows, unmatchedSeeds, missingAdmin1Representatives, missingAdmin2Representatives } = chooseCities(
  dataset.cities,
  dataset.admin1Items,
  dataset.admin2Items,
  profiles,
  seeds,
  overrideSeed
);
const scopedGeonameIds = new Set<number>([
  ...selectedRows.map((row) => row.city.geonameId),
  ...selectedRows.flatMap((row) => {
    const city = row.city;
    return [
      city.admin1Code ? admin1ByKey.get(`${city.countryCode}.${city.admin1Code}`)?.geonameId : undefined,
      city.admin1Code && city.admin2Code ? admin2ByKey.get(`${city.countryCode}.${city.admin1Code}.${city.admin2Code}`)?.geonameId : undefined
    ].filter((value): value is number => typeof value === 'number');
  })
]);
const zhNameByGeonameId = await readAlternateNamesFromZip(dataset.paths.alternateNamesZip, scopedGeonameIds);
const selectedCities = selectedRows.map((row) => toCity(row, admin1ByKey, admin2ByKey, zhNameByGeonameId));
const hash = createHash('sha1')
  .update(JSON.stringify({ profilesVersion: profilesPayload.version, cities: selectedCities.map((city) => [city.id, city.selectionReasons]) }))
  .digest('hex')
  .slice(0, 12);
const version = `cities-${hash}`;
const payload = buildCitiesPayload(selectedCities, profilesByCountry, version);
const report = buildReport(selectedCities, dataset.cities.length, profilesPayload, unmatchedSeeds, missingAdmin1Representatives, missingAdmin2Representatives, version);

if (payload.c.length > 5000) {
  throw new Error(`Selected ${payload.c.length} cities, exceeding the static city data limit of 5000.`);
}

await mkdir(generatedDir, { recursive: true });
await mkdir(publicDataDir, { recursive: true });
await writeFile(path.join(generatedDir, 'cities.json'), `${JSON.stringify(payload, null, 2)}\n`);
await writeFile(path.join(publicDataDir, 'cities.json'), `${JSON.stringify(payload)}\n`);
await writeFile(path.join(generatedDir, 'city-selection-report.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(generatedDir, 'city-selection-report.md'), reportMarkdown(report));

console.log(`Generated ${payload.c.length} static cities from ${dataset.cities.length} GeoNames candidates (${version}).`);
}
