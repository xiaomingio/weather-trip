/**
 * 文件说明: 生成城市搜索索引，并按中文、英文和罗马化名称过滤城市。
 * 对应文档: docs/product-design.md
 */
import type { City } from 'weather-core/types';

const countryDisplayNames = {
  zh: new Intl.DisplayNames(['zh-CN'], { type: 'region' }),
  en: new Intl.DisplayNames(['en-US'], { type: 'region' })
};

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}\p{Script=Han}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function countryNames(city: City): string[] {
  if (!city.countryCode) return [];

  return [
    countryDisplayNames.zh.of(city.countryCode),
    countryDisplayNames.en.of(city.countryCode)
  ].filter((value): value is string => Boolean(value));
}

function citySearchParts(city: City): string[] {
  return [
    city.names.zh,
    city.names.en,
    city.country,
    city.admin1,
    city.admin1LocalName,
    ...countryNames(city)
  ].filter((value): value is string => Boolean(value));
}

export function cityMatchesKeyword(city: City, keyword: string): boolean {
  const query = normalizeSearchText(keyword);
  if (!query) return true;

  const queryTokens = query.split(' ');
  const queryCompact = query.replace(/\s+/g, '');
  const normalizedParts = citySearchParts(city).map(normalizeSearchText).filter(Boolean);
  const compactParts = normalizedParts.map((part) => part.replace(/\s+/g, ''));

  return queryTokens.every((token) =>
    normalizedParts.some((part) => part.includes(token)) ||
    compactParts.some((part) => part.includes(token)) ||
    compactParts.some((part) => part.includes(queryCompact))
  );
}
