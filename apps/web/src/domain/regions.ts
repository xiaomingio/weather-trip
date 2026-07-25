/**
 * 文件说明: 定义通用地区筛选匹配规则，具体国家选项由已加载城市数据派生。
 * 对应文档: docs/specs/30-weather-coverage-design.md
 */
import type { City, RegionKey } from 'weather-core/types';
import { countryLabel } from './country-labels';
import type { DisplayLocale } from './format';

export type RegionOption = {
  id: RegionKey;
  labels: Record<DisplayLocale, string>;
  groups: Record<DisplayLocale, string>;
  matches: (city: City) => boolean;
};

export type MapRegionLayer = 'world' | 'country';

const fixedRegionRank = new Map<RegionKey, number>([
  ['world', 0],
  ['asia', 1],
  ['east_asia', 2],
  ['southeast_asia', 3],
  ['europe', 4],
  ['north_america', 5],
  ['south_america', 6],
  ['africa', 7],
  ['oceania', 8]
]);

const chinaRegionCountryCodes = new Set(['CN', 'HK', 'MO', 'TW']);
const chinaDirectMunicipalityAdmin1Codes = new Set(['22', '23', '28', '33']);

export const chinaCompanionRegionAdmin2Codes: Record<string, string> = {
  HK: '810000',
  MO: '820000',
  TW: '710000'
};

export function isChinaRegionCountryCode(countryCode: string | undefined): boolean {
  return Boolean(countryCode && chinaRegionCountryCodes.has(countryCode));
}

export function isChinaDirectMunicipalityAdmin1Code(admin1Code: string | undefined): boolean {
  return Boolean(admin1Code && chinaDirectMunicipalityAdmin1Codes.has(admin1Code));
}

export function countryMatchesRegionCountry(cityCountryCode: string | undefined, regionCountryCode: string): boolean {
  if (regionCountryCode === 'CN') return isChinaRegionCountryCode(cityCountryCode);
  return cityCountryCode === regionCountryCode;
}

export function chinaCompanionAdmin1RegionForCountry(countryCode: string | undefined): RegionKey | null {
  return countryCode && countryCode in chinaCompanionRegionAdmin2Codes ? `admin1:CN.${countryCode}` : null;
}

export function chinaCompanionAdmin2RegionForCountry(countryCode: string | undefined): RegionKey | null {
  const admin2Code = countryCode ? chinaCompanionRegionAdmin2Codes[countryCode] : undefined;
  return countryCode && admin2Code ? `admin2:CN.${countryCode}.${admin2Code}` : null;
}

export function parseAdmin1Region(region: RegionKey): { countryCode: string; admin1Code: string } | null {
  const admin1Match = /^admin1:([A-Z]{2})\.(.+)$/.exec(region);
  return admin1Match ? { countryCode: admin1Match[1], admin1Code: admin1Match[2] } : null;
}

export function parseAdmin2Region(region: RegionKey): { countryCode: string; admin1Code: string; admin2Code: string } | null {
  const match = /^admin2:([A-Z]{2})\.([^.]+)\.(.+)$/.exec(region);
  if (!match) return null;
  return { countryCode: match[1], admin1Code: match[2], admin2Code: match[3] };
}

export function primaryCountryCodeForRegion(region: RegionKey): string | null {
  const admin2Region = parseAdmin2Region(region);
  if (admin2Region) return admin2Region.countryCode;
  const admin1Region = parseAdmin1Region(region);
  if (admin1Region) return admin1Region.countryCode;
  const countryMatch = /^country:([A-Z]{2})$/.exec(region);
  return countryMatch?.[1] ?? null;
}

export const regionOptions: RegionOption[] = [
  {
    id: 'world',
    labels: { zh: '全球', en: 'World' },
    groups: { zh: '大区', en: 'Regions' },
    matches: () => true
  },
  {
    id: 'asia',
    labels: { zh: '亚洲', en: 'Asia' },
    groups: { zh: '大区', en: 'Regions' },
    matches: (city) => city.region === 'asia'
  },
  {
    id: 'east_asia',
    labels: { zh: '东亚', en: 'East Asia' },
    groups: { zh: '大区', en: 'Regions' },
    matches: (city) => ['CN', 'HK', 'MO', 'TW', 'JP', 'KR'].includes(city.countryCode ?? '')
  },
  {
    id: 'southeast_asia',
    labels: { zh: '东南亚', en: 'Southeast Asia' },
    groups: { zh: '大区', en: 'Regions' },
    matches: (city) => ['SG', 'TH', 'VN', 'MY', 'ID', 'PH', 'KH', 'LA', 'MM', 'BN'].includes(city.countryCode ?? '')
  },
  {
    id: 'europe',
    labels: { zh: '欧洲', en: 'Europe' },
    groups: { zh: '大区', en: 'Regions' },
    matches: (city) => city.region === 'europe'
  },
  {
    id: 'north_america',
    labels: { zh: '北美', en: 'North America' },
    groups: { zh: '大区', en: 'Regions' },
    matches: (city) => city.region === 'north_america'
  },
  {
    id: 'south_america',
    labels: { zh: '南美', en: 'South America' },
    groups: { zh: '大区', en: 'Regions' },
    matches: (city) => city.region === 'south_america'
  },
  {
    id: 'africa',
    labels: { zh: '非洲', en: 'Africa' },
    groups: { zh: '大区', en: 'Regions' },
    matches: (city) => city.region === 'africa'
  },
  {
    id: 'oceania',
    labels: { zh: '大洋洲', en: 'Oceania' },
    groups: { zh: '大区', en: 'Regions' },
    matches: (city) => city.region === 'oceania'
  }
];

export function getRegionLabel(option: RegionOption, locale: DisplayLocale): string {
  return option.labels[locale];
}

export function getRegionGroup(option: RegionOption, locale: DisplayLocale): string {
  return option.groups[locale];
}

export function getSortedRegionOptions(locale: DisplayLocale): RegionOption[] {
  const groupRank = new Map(
    locale === 'zh'
      ? [
          ['大区', 0],
          ['地区/国家', 1]
        ]
      : [
          ['Regions', 0],
          ['Countries', 1]
        ]
  );
  const collator = new Intl.Collator(locale === 'zh' ? 'zh-CN-u-co-pinyin' : 'en', { sensitivity: 'base' });

  return [...regionOptions].sort((a, b) => {
    const groupDiff = (groupRank.get(a.groups[locale]) ?? 99) - (groupRank.get(b.groups[locale]) ?? 99);
    if (groupDiff !== 0) return groupDiff;
    if (fixedRegionRank.has(a.id) || fixedRegionRank.has(b.id)) {
      return (fixedRegionRank.get(a.id) ?? 99) - (fixedRegionRank.get(b.id) ?? 99);
    }
    return collator.compare(a.labels[locale], b.labels[locale]) || a.id.localeCompare(b.id);
  });
}

export function getPrimaryRegionOptions(locale: DisplayLocale): RegionOption[] {
  return getSortedRegionOptions(locale);
}

export function getRegionOption(region: RegionKey): RegionOption {
  const countryMatch = /^country:([A-Z]{2})$/.exec(region);
  if (countryMatch) {
    const countryCode = countryMatch[1];
    return {
      id: region,
      labels: {
        zh: countryLabel(countryCode, 'zh'),
        en: countryLabel(countryCode, 'en')
      },
      groups: { zh: '地区/国家', en: 'Countries' },
      matches: (city) => countryMatchesRegionCountry(city.countryCode, countryCode)
    };
  }

  return regionOptions.find((option) => option.id === region) ?? regionOptions[0];
}

export function cityMatchesRegion(city: City, region: RegionKey): boolean {
  const admin2Region = parseAdmin2Region(region);
  if (admin2Region) {
    const companionAdmin2Region = chinaCompanionAdmin2RegionForCountry(city.countryCode);
    if (admin2Region.countryCode === 'CN' && companionAdmin2Region) return region === companionAdmin2Region;
    return city.countryCode === admin2Region.countryCode && city.admin1GroupCode === admin2Region.admin1Code && city.admin2Code === admin2Region.admin2Code;
  }
  const admin1Region = parseAdmin1Region(region);
  if (admin1Region) {
    const companionAdmin1Region = chinaCompanionAdmin1RegionForCountry(city.countryCode);
    if (admin1Region.countryCode === 'CN' && companionAdmin1Region) return region === companionAdmin1Region;
    return city.countryCode === admin1Region.countryCode && city.admin1GroupCode === admin1Region.admin1Code;
  }
  return getRegionOption(region).matches(city);
}

export function getMapRegionLayer(region: RegionKey): MapRegionLayer {
  if (primaryCountryCodeForRegion(region)) return 'country';
  return 'world';
}
