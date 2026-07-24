/**
 * 文件说明: 读取按数据类型拆分的输入 seed，并提供生成脚本通用的国家分层和区域支持判断。
 * 对应文档: docs/specs/30-weather-coverage-design.md, data/input/README.md
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import type { CountryTier } from 'weather-core/types';
import type { GeoNamesAdmin2, GeoNamesCity } from './geonames.js';

export type CoverageOverrideSeed = {
  countryTierCountries: Array<{
    countryCode: string;
    countryTier: CountryTier;
  }>;
  admin2SupportOverrides: Array<{
    countryCode: string;
    reason: string;
    includeAdmin1Codes?: string[];
    includeAdmin2CodeRules?: Array<{
      pattern: string;
      lastTwoMin?: number;
      lastTwoMax?: number;
    }>;
  }>;
  boundaryLabelOverrides?: Array<{
    countryCode: string;
    admin1Code: string;
    sourceAdcode: number;
    name: {
      zh: string;
      en: string;
    };
    reason: string;
  }>;
};

async function readSeedArray<T>(rootDir: string, fileName: string): Promise<T[]> {
  const filePath = path.join(rootDir, 'data', 'input', fileName);
  return YAML.parse(await readFile(filePath, 'utf8')) as T[];
}

async function readCountryTierCountries(rootDir: string): Promise<CoverageOverrideSeed['countryTierCountries']> {
  const rows = await readSeedArray<CoverageOverrideSeed['countryTierCountries'][number]>(rootDir, 'country-tier-countries.yml');
  return rows.map((item) => ({
    countryCode: item.countryCode,
    countryTier: item.countryTier
  }));
}

export async function loadCoverageOverrides(rootDir: string): Promise<CoverageOverrideSeed> {
  const [
    countryTierCountries,
    admin2SupportOverrides,
    boundaryLabelOverrides
  ] = await Promise.all([
    readCountryTierCountries(rootDir),
    readSeedArray<CoverageOverrideSeed['admin2SupportOverrides'][number]>(rootDir, 'admin2-support-overrides.yml'),
    readSeedArray<NonNullable<CoverageOverrideSeed['boundaryLabelOverrides']>[number]>(rootDir, 'boundary-label-overrides.yml')
  ]);
  return {
    countryTierCountries,
    admin2SupportOverrides,
    boundaryLabelOverrides
  };
}

export async function loadAdmin2SupportOverrides(rootDir: string): Promise<Pick<CoverageOverrideSeed, 'admin2SupportOverrides'>> {
  return {
    admin2SupportOverrides: await readSeedArray<CoverageOverrideSeed['admin2SupportOverrides'][number]>(rootDir, 'admin2-support-overrides.yml')
  };
}

export function detailedCoverageCountry(
  seed: CoverageOverrideSeed,
  countryCode: string
): { detailedCoverage: 'admin1' | 'admin2' } | undefined {
  const item = seed.countryTierCountries.find((candidate) => candidate.countryCode === countryCode);
  if (!item || item.countryTier === 'C1') return undefined;
  return {
    detailedCoverage: item.countryTier === 'C3' ? 'admin2' : 'admin1'
  };
}

export function isSupportedAdmin2(seed: CoverageOverrideSeed, admin2: GeoNamesAdmin2): boolean {
  const override = seed.admin2SupportOverrides.find((item) => item.countryCode === admin2.countryCode);
  if (!override) return true;
  if (override.includeAdmin1Codes?.includes(admin2.admin1Code)) return true;

  return (override.includeAdmin2CodeRules ?? []).some((rule) => {
    if (!new RegExp(rule.pattern).test(admin2.admin2Code)) return false;
    const lastTwo = Number(admin2.admin2Code.slice(-2));
    if (rule.lastTwoMin !== undefined && lastTwo < rule.lastTwoMin) return false;
    if (rule.lastTwoMax !== undefined && lastTwo > rule.lastTwoMax) return false;
    return true;
  });
}

function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function admin2Key(admin2: GeoNamesAdmin2): string {
  return `${admin2.countryCode}.${admin2.admin1Code}.${admin2.admin2Code}`;
}

function cityCanRepresentAdmin2(admin2: GeoNamesAdmin2, cities: GeoNamesCity[], supportedFeatureCodes: Set<string>): boolean {
  const normalizedAdmin2Names = new Set([normalizeName(admin2.name), normalizeName(admin2.asciiName)].filter(Boolean));
  return cities.some((city) => {
    if (city.countryCode !== admin2.countryCode || city.admin1Code !== admin2.admin1Code) return false;
    if (city.population <= 0 || !supportedFeatureCodes.has(city.featureCode)) return false;
    if (city.admin2Code === admin2.admin2Code) return true;

    const cityNames = [city.name, city.asciiName, ...city.alternateNames].map(normalizeName);
    return cityNames.some((name) => normalizedAdmin2Names.has(name));
  });
}

export function buildSupportedAdmin2KeySet(
  seed: CoverageOverrideSeed,
  admin2Items: GeoNamesAdmin2[],
  cities: GeoNamesCity[],
  supportedFeatureCodes: Set<string>
): Set<string> {
  return new Set(
    admin2Items.flatMap((admin2) => {
      const override = seed.admin2SupportOverrides.find((item) => item.countryCode === admin2.countryCode);
      const isIncluded = override
        ? isSupportedAdmin2(seed, admin2) || cityCanRepresentAdmin2(admin2, cities, supportedFeatureCodes)
        : cityCanRepresentAdmin2(admin2, cities, supportedFeatureCodes);
      if (isIncluded) {
        return [admin2Key(admin2)];
      }
      return [];
    })
  );
}

export function isSupportedAdmin2ByKey(supportedAdmin2Keys: Set<string>, admin2: GeoNamesAdmin2): boolean {
  return supportedAdmin2Keys.has(admin2Key(admin2));
}
