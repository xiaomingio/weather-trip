/**
 * 文件说明: 提供前端国家和地区名称展示，补充运行时 Intl.DisplayNames 无法表达的产品口径。
 */

import type { DisplayLocale } from './format';

const countryDisplayNames: Record<DisplayLocale, Intl.DisplayNames> = {
  zh: new Intl.DisplayNames(['zh-CN'], { type: 'region' }),
  en: new Intl.DisplayNames(['en-US'], { type: 'region' })
};

const productCountryLabels: Partial<Record<string, Record<DisplayLocale, string>>> = {
  CN: { zh: '中国', en: 'China' },
  HK: { zh: '香港', en: 'Hong Kong' },
  MO: { zh: '澳门', en: 'Macau' },
  TW: { zh: '台湾', en: 'Taiwan' }
};

export function countryLabel(countryCode: string, locale: DisplayLocale): string {
  const productLabel = productCountryLabels[countryCode]?.[locale];
  if (productLabel) return productLabel;
  return countryDisplayNames[locale].of(countryCode) ?? countryCode;
}

export function countrySearchLabels(countryCode: string): string[] {
  return [countryLabel(countryCode, 'zh'), countryLabel(countryCode, 'en')];
}
