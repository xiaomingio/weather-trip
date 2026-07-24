/**
 * 文件说明: 覆盖静态城市生成脚本输出 rank 的排序契约，确保解码后的 city.rank 优先表达行政级别。
 * 对应文档: docs/specs/30-weather-coverage-design.md
 */
import { describe, expect, it } from 'vitest';
import { compareDefaultRank } from '../../../../scripts/lib/cities/static-city-generation';

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
