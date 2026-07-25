/**
 * 文件说明: 覆盖静态城市生成脚本输出 rank 的排序契约，确保解码后的 city.rank 优先表达行政级别。
 * 对应文档: docs/specs/30-weather-coverage-design.md
 */
import { describe, expect, it } from 'vitest';
import { compareDefaultRank, encodeCitiesPayload, inferSelectedCityAdmin2, mergeSelectedCityGeography } from '../../../../scripts/lib/cities/static-city-generation';
import { buildSupportedAdmin2KeySet, isCodeLevelSupportedAdmin2 } from '../../../../scripts/lib/static-data/coverage-overrides';
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

function admin2(countryCode: string, admin1Code: string, admin2Code: string, name: string): GeoNamesAdmin2 {
  return {
    code: `${countryCode}.${admin1Code}.${admin2Code}`,
    countryCode,
    admin1Code,
    admin2Code,
    name,
    asciiName: name,
    geonameId: Number(`${admin1Code}${admin2Code}`.replace(/\D/g, '').slice(0, 8)) || 1
  };
}

function geoCity(params: Partial<GeoNamesCity> & Pick<GeoNamesCity, 'id' | 'countryCode' | 'admin1Code' | 'featureCode'>): GeoNamesCity {
  return {
    geonameId: 1,
    name: params.id,
    asciiName: params.id,
    alternateNames: [],
    latitude: 0,
    longitude: 0,
    population: 1,
    timezone: 'UTC',
    continentCode: 'EU',
    ...params
  };
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

describe('static city generated tables', () => {
  it('encodes readable generated city rows into compact public wire rows', () => {
    const payload = encodeCitiesPayload({
      version: 'cities-test',
      cityProfilesVersion: 'profiles-test',
      countries: [
        {
          countryCode: 'US',
          names: { en: 'United States', zh: '美国' },
          worldRegion: 'north_america',
          countryTier: 'C2'
        }
      ],
      admin1: [
        {
          countryCode: 'US',
          admin1Code: 'CA',
          names: { en: 'California', zh: '加利福尼亚州' }
        }
      ],
      admin2: [
        {
          countryCode: 'US',
          admin1Code: 'CA',
          admin2Code: '037',
          names: { en: 'Los Angeles County', zh: '洛杉矶县' }
        }
      ],
      cities: [
        {
          id: 'city-la',
          geonameId: 5368361,
          names: { en: 'Los Angeles', zh: '洛杉矶' },
          countryCode: 'US',
          admin1Code: 'CA',
          admin2Code: '037',
          latitude: 34.05223,
          longitude: -118.24368,
          timezone: 'America/Los_Angeles',
          population: 3971883,
          elevationMeters: 89,
          worldRegion: 'north_america',
          countryTier: 'C2',
          rank: 1,
          selectionPriority: 1,
          selectionReasons: ['fixture']
        }
      ]
    });

    expect(payload).toEqual({
      v: 'cities-test',
      d: {
        co: [['US', ['United States', '美国'], 'north_america', 2]],
        a1: [[0, 'CA', ['California', '加利福尼亚州']]],
        a2: [[0, 0, '037', ['Los Angeles County', '洛杉矶县']]]
      },
      c: [['city-la', ['Los Angeles', '洛杉矶'], 0, 0, 0, 3405223, -11824368, 89]]
    });
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

describe('GeoNames admin2 support rules', () => {
  it('keeps China supported admin2 rules in code instead of data input files', () => {
    expect(isCodeLevelSupportedAdmin2(admin2('CN', '30', '4403', 'Shenzhen'))).toBe(true);
    expect(isCodeLevelSupportedAdmin2(admin2('CN', '23', '3101', 'Shanghai district'))).toBe(true);
    expect(isCodeLevelSupportedAdmin2(admin2('CN', '13', '6590', 'Unsupported county-level code'))).toBe(false);
    expect(isCodeLevelSupportedAdmin2(admin2('ES', '56', '001', 'Barcelona'))).toBe(false);
  });

  it('allows non-China admin2 only when a supported city can represent it', () => {
    const supportedAdmin2Keys = buildSupportedAdmin2KeySet(
      [
        admin2('ES', '56', '001', 'Barcelona'),
        admin2('ZZ', '01', '002', 'No City Region')
      ],
      [
        geoCity({
          id: 'barcelona',
          countryCode: 'ES',
          admin1Code: '56',
          admin2Code: '001',
          featureCode: 'PPLA2',
          population: 1_600_000
        })
      ],
      new Set(['PPLA2'])
    );

    expect(supportedAdmin2Keys.has('ES.56.001')).toBe(true);
    expect(supportedAdmin2Keys.has('ZZ.01.002')).toBe(false);
  });
});
