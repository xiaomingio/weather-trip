/**
 * 文件说明: 定义地区筛选项和地区匹配规则，支持大区、国家和中国省级行政区。
 * 对应文档: docs/product-design.md
 */
import type { City, RegionKey } from 'weather-core/types';
import countryProfiles from '../../../../data/city-selection/country-profiles.json';
import { chinaAdmin1AdcodeByGeoNamesCode } from './china-admin1';
import type { DisplayLocale } from './format';

export type RegionOption = {
  id: RegionKey;
  labels: Record<DisplayLocale, string>;
  groups: Record<DisplayLocale, string>;
  matches: (city: City) => boolean;
};

type CountryProfile = {
  countryCode: string;
  detailedCoverage?: 'admin1' | 'admin2';
};

const countryNames = {
  zh: new Intl.DisplayNames(['zh-CN'], { type: 'region' }),
  en: new Intl.DisplayNames(['en'], { type: 'region' })
};
const detailedCountryCodes = new Set(
  (countryProfiles as CountryProfile[])
    .filter((profile) => profile.detailedCoverage)
    .map((profile) => profile.countryCode)
);
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

function isGlobalScopeCity(city: City): boolean {
  const reasons = city.selectionReasons ?? [];
  return (
    reasons.length === 0 ||
    reasons.some((reason) => reason.startsWith('tourism:')) ||
    reasons.includes('feature:PPLC') ||
    reasons.includes('population:country-profile')
  );
}

function isDetailedCountryRegion(region: RegionKey): boolean {
  if (!region.startsWith('country:')) return false;
  return detailedCountryCodes.has(region.slice('country:'.length));
}

function matchesGlobalOrDetailedRegion(city: City, region: RegionKey, matchesRegion: boolean): boolean {
  if (!matchesRegion) return false;
  if (isDetailedCountryRegion(region) || region.startsWith('province:')) return true;
  return isGlobalScopeCity(city);
}

const detailedCountryOptions: RegionOption[] = (countryProfiles as CountryProfile[])
  .filter((profile) => profile.detailedCoverage)
  .map((profile) => ({
    id: `country:${profile.countryCode}`,
    labels: {
      zh: countryNames.zh.of(profile.countryCode) ?? profile.countryCode,
      en: countryNames.en.of(profile.countryCode) ?? profile.countryCode
    },
    groups: { zh: '国家/地区', en: 'Countries' },
    matches: (city: City) => city.countryCode === profile.countryCode
  }));

export const chinaProvinceOptions: RegionOption[] = [
  ['22', '北京', 'Beijing'],
  ['28', '天津', 'Tianjin'],
  ['10', '河北', 'Hebei'],
  ['24', '山西', 'Shanxi'],
  ['20', '内蒙古', 'Inner Mongolia'],
  ['19', '辽宁', 'Liaoning'],
  ['05', '吉林', 'Jilin'],
  ['08', '黑龙江', 'Heilongjiang'],
  ['23', '上海', 'Shanghai'],
  ['04', '江苏', 'Jiangsu'],
  ['02', '浙江', 'Zhejiang'],
  ['01', '安徽', 'Anhui'],
  ['07', '福建', 'Fujian'],
  ['03', '江西', 'Jiangxi'],
  ['25', '山东', 'Shandong'],
  ['09', '河南', 'Henan'],
  ['12', '湖北', 'Hubei'],
  ['11', '湖南', 'Hunan'],
  ['30', '广东', 'Guangdong'],
  ['16', '广西', 'Guangxi'],
  ['31', '海南', 'Hainan'],
  ['33', '重庆', 'Chongqing'],
  ['32', '四川', 'Sichuan'],
  ['18', '贵州', 'Guizhou'],
  ['29', '云南', 'Yunnan'],
  ['14', '西藏', 'Tibet'],
  ['26', '陕西', 'Shaanxi'],
  ['15', '甘肃', 'Gansu'],
  ['06', '青海', 'Qinghai'],
  ['21', '宁夏', 'Ningxia'],
  ['13', '新疆', 'Xinjiang']
].map(([geoNamesAdmin1Code, labelZh, labelEn]) => ({
  id: `province:${chinaAdmin1AdcodeByGeoNamesCode[geoNamesAdmin1Code]}`,
  labels: { zh: labelZh, en: labelEn },
  groups: { zh: '中国省级', en: 'China provinces' },
  matches: (city: City) => city.countryCode === 'CN' && city.admin1GroupCode === geoNamesAdmin1Code
}));

export const regionOptions: RegionOption[] = [
  {
    id: 'world',
    labels: { zh: '全球', en: 'World' },
    groups: { zh: '大区', en: 'Regions' },
    matches: (city) => matchesGlobalOrDetailedRegion(city, 'world', true)
  },
  {
    id: 'asia',
    labels: { zh: '亚洲', en: 'Asia' },
    groups: { zh: '大区', en: 'Regions' },
    matches: (city) => matchesGlobalOrDetailedRegion(city, 'asia', city.region === 'asia')
  },
  {
    id: 'east_asia',
    labels: { zh: '东亚', en: 'East Asia' },
    groups: { zh: '大区', en: 'Regions' },
    matches: (city) => matchesGlobalOrDetailedRegion(city, 'east_asia', ['CN', 'JP', 'KR'].includes(city.countryCode ?? ''))
  },
  {
    id: 'southeast_asia',
    labels: { zh: '东南亚', en: 'Southeast Asia' },
    groups: { zh: '大区', en: 'Regions' },
    matches: (city) =>
      matchesGlobalOrDetailedRegion(
        city,
        'southeast_asia',
        ['SG', 'TH', 'VN', 'MY', 'ID', 'PH', 'KH', 'LA', 'MM', 'BN'].includes(city.countryCode ?? '')
      )
  },
  {
    id: 'europe',
    labels: { zh: '欧洲', en: 'Europe' },
    groups: { zh: '大区', en: 'Regions' },
    matches: (city) => matchesGlobalOrDetailedRegion(city, 'europe', city.region === 'europe')
  },
  {
    id: 'north_america',
    labels: { zh: '北美', en: 'North America' },
    groups: { zh: '大区', en: 'Regions' },
    matches: (city) => matchesGlobalOrDetailedRegion(city, 'north_america', city.region === 'north_america')
  },
  {
    id: 'south_america',
    labels: { zh: '南美', en: 'South America' },
    groups: { zh: '大区', en: 'Regions' },
    matches: (city) => matchesGlobalOrDetailedRegion(city, 'south_america', city.region === 'south_america')
  },
  {
    id: 'africa',
    labels: { zh: '非洲', en: 'Africa' },
    groups: { zh: '大区', en: 'Regions' },
    matches: (city) => matchesGlobalOrDetailedRegion(city, 'africa', city.region === 'africa')
  },
  {
    id: 'oceania',
    labels: { zh: '大洋洲', en: 'Oceania' },
    groups: { zh: '大区', en: 'Regions' },
    matches: (city) => matchesGlobalOrDetailedRegion(city, 'oceania', city.region === 'oceania')
  },
  ...detailedCountryOptions,
  ...chinaProvinceOptions
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
          ['国家/地区', 1],
          ['中国省级', 2]
        ]
      : [
          ['Regions', 0],
          ['Countries', 1],
          ['China provinces', 2]
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

export function getRegionOption(region: RegionKey): RegionOption {
  return regionOptions.find((option) => option.id === region) ?? regionOptions[0];
}

export function cityMatchesRegion(city: City, region: RegionKey): boolean {
  return getRegionOption(region).matches(city);
}

export function shouldShowChinaProvinceLayer(region: RegionKey): boolean {
  return ['world', 'asia', 'east_asia', 'country:CN'].includes(region) || region.startsWith('province:');
}

export function shouldFocusChinaProvinceLayer(region: RegionKey): boolean {
  return region === 'country:CN' || region.startsWith('province:');
}
