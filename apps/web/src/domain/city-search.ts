/**
 * 文件说明: 生成城市搜索索引，并按中文、英文和罗马化名称过滤城市。
 * 对应文档: docs/specs/10-product-design.md
 */
import type { City } from 'weather-core/types';
import { countrySearchLabels } from './country-labels';

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
  return countrySearchLabels(city.countryCode);
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
