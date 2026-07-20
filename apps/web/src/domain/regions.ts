/**
 * 文件说明: 定义地区筛选项和地区匹配规则，支持大区、国家和中国省级行政区。
 * 对应文档: docs/product-design.md
 */
import type { City, RegionKey } from 'weather-core/types';
import { chinaAdmin1AdcodeByGeoNamesCode } from './china-admin1';
import type { DisplayLocale } from './format';

export type RegionOption = {
  id: RegionKey;
  labels: Record<DisplayLocale, string>;
  groups: Record<DisplayLocale, string>;
  matches: (city: City) => boolean;
};

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
    matches: (city) => ['CN', 'JP', 'KR'].includes(city.countryCode ?? '')
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
  },
  {
    id: 'country:CN',
    labels: { zh: '中国', en: 'China' },
    groups: { zh: '国家/地区', en: 'Countries' },
    matches: (city) => city.countryCode === 'CN' || city.country === 'China'
  },
  {
    id: 'country:US',
    labels: { zh: '美国', en: 'United States' },
    groups: { zh: '国家/地区', en: 'Countries' },
    matches: (city) => city.countryCode === 'US' || city.country === 'United States'
  },
  {
    id: 'country:JP',
    labels: { zh: '日本', en: 'Japan' },
    groups: { zh: '国家/地区', en: 'Countries' },
    matches: (city) => city.countryCode === 'JP' || city.country === 'Japan'
  },
  {
    id: 'country:RU',
    labels: { zh: '俄罗斯', en: 'Russia' },
    groups: { zh: '国家/地区', en: 'Countries' },
    matches: (city) => city.countryCode === 'RU' || city.country === 'Russia'
  },
  ...chinaProvinceOptions
];

export function getRegionLabel(option: RegionOption, locale: DisplayLocale): string {
  return option.labels[locale];
}

export function getRegionGroup(option: RegionOption, locale: DisplayLocale): string {
  return option.groups[locale];
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
