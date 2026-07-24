/**
 * 文件说明: 覆盖静态城市生成脚本输出 rank 的排序契约，确保解码后的 city.rank 优先表达行政级别。
 * 对应文档: docs/specs/30-weather-coverage-design.md
 */
import { describe, expect, it } from 'vitest';
import { compareDefaultRank, inferSelectedCityAdmin2, mergeSelectedCityGeography } from '../../../../scripts/lib/cities/static-city-generation';
import { normalizeChineseAlternateName, type GeoNamesAdmin2, type GeoNamesCity } from '../../../../scripts/lib/static-data/geonames';

type TestCity = {
  id: string;
  countryCode: string;
  featureCode: string;
  population: number;
};

function city(id: string, featureCode: string, population: number, countryCode = 'ZZ'): TestCity {
  return { id, featureCode, population, countryCode };
}

describe('static city generation rank order', () => {
  it('orders generated city rank by administrative level before population', () => {
    const rows = [
      { city: city('ordinary-megacity', 'PPL', 30_000_000), priority: 1 },
      { city: city('largest-admin1-seat', 'PPLA', 8_000_000), priority: 90 },
      { city: city('largest-capital', 'PPLC', 12_000_000), priority: 80 },
      { city: city('smaller-capital', 'PPLC', 3_000_000), priority: 10 },
      { city: city('admin2-seat', 'PPLA2', 9_000_000), priority: 1 }
    ];

    expect([...rows].sort(compareDefaultRank).map((row) => row.city.id)).toEqual([
      'largest-capital',
      'smaller-capital',
      'largest-admin1-seat',
      'admin2-seat',
      'ordinary-megacity'
    ]);
  });

  it('uses selection priority, country code and id only after administrative level and population tie', () => {
    const rows = [
      { city: city('beta', 'PPLA', 1_000_000, 'US'), priority: 20 },
      { city: city('alpha', 'PPLA', 1_000_000, 'US'), priority: 20 },
      { city: city('priority-winner', 'PPLA', 1_000_000, 'US'), priority: 10 },
      { city: city('country-winner', 'PPLA', 1_000_000, 'CN'), priority: 20 }
    ];

    expect([...rows].sort(compareDefaultRank).map((row) => row.city.id)).toEqual([
      'priority-winner',
      'country-winner',
      'alpha',
      'beta'
    ]);
  });
});

describe('static city generation administrative merge', () => {
  it('keeps a previously selected city but fills later admin2 representative geography', () => {
    const baseCity: GeoNamesCity = {
      geonameId: 1790645,
      id: 'geonames-1790645',
      name: 'Xiamen',
      asciiName: 'Xiamen',
      alternateNames: ['厦门市'],
      latitude: 24.47979,
      longitude: 118.08187,
      featureCode: 'PPLA2',
      countryCode: 'CN',
      admin1Code: '07',
      population: 4617251,
      timezone: 'Asia/Shanghai',
      continentCode: 'AS'
    };

    expect(mergeSelectedCityGeography(baseCity, { ...baseCity, admin2Code: '3502' })).toMatchObject({
      id: 'geonames-1790645',
      admin1Code: '07',
      admin2Code: '3502'
    });
  });

  it('infers missing C3 admin2 from a nearby city in the same admin1', () => {
    const baoAn: GeoNamesCity = {
      geonameId: 13308620,
      id: 'geonames-13308620',
      name: "Bao'an",
      asciiName: "Bao'an",
      alternateNames: [],
      latitude: 22.55213,
      longitude: 113.88288,
      featureCode: 'PPLA3',
      countryCode: 'CN',
      admin1Code: '30',
      population: 4476554,
      timezone: 'Asia/Shanghai',
      continentCode: 'AS'
    };
    const shenzhenAdmin2: GeoNamesAdmin2 = {
      code: 'CN.30.4403',
      countryCode: 'CN',
      admin1Code: '30',
      admin2Code: '4403',
      name: 'Shenzhen',
      asciiName: 'Shenzhen',
      geonameId: 1795563
    };
    const nearbyCity: GeoNamesCity = {
      ...baoAn,
      geonameId: 1,
      id: 'nearby-shenzhen-city',
      name: 'Hongfa Centre',
      asciiName: 'Hongfa Centre',
      latitude: 22.5501,
      longitude: 113.889,
      featureCode: 'PPL',
      population: 10326,
      admin2Code: '4403'
    };

    expect(inferSelectedCityAdmin2(baoAn, [shenzhenAdmin2], [baoAn, nearbyCity], new Set(['CN.30.4403']))).toMatchObject({
      id: 'geonames-13308620',
      admin1Code: '30',
      admin2Code: '4403'
    });
  });
});

describe('GeoNames Chinese alternate names', () => {
  it('normalizes traditional Chinese names to simplified Chinese during static data generation', () => {
    expect(normalizeChineseAlternateName('馬德里')).toBe('马德里');
    expect(normalizeChineseAlternateName('河內市')).toBe('河内市');
    expect(normalizeChineseAlternateName('首都區')).toBe('首都区');
  });
});
