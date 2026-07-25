/**
 * 文件说明: 覆盖旅游目的地生成里的国家名称别名对齐契约，避免少数 raw 来源名称补丁回到脚本硬编码。
 * 对应文档: 输入数据维护规则
 */
import { describe, expect, it } from 'vitest';
import { buildCountryCodeByName, type CountryNameAlias } from '../../../../scripts/lib/tourism/tourism-destination-generation';

describe('tourism destination country aliases', () => {
  it('builds country name lookup from GeoNames countries and explicit aliases', () => {
    const countries = new Map([
      ['US', { code: 'US', name: 'United States' }],
      ['VN', { code: 'VN', name: 'Viet Nam' }]
    ]);
    const aliases: CountryNameAlias[] = [
      { name: 'United States of America', countryCode: 'US' },
      { name: 'Vietnam', countryCode: 'VN' },
      { name: 'Türkiye', countryCode: 'TR' }
    ];

    const lookup = buildCountryCodeByName(countries, aliases);

    expect(lookup.get('united states')).toBe('US');
    expect(lookup.get('united states of america')).toBe('US');
    expect(lookup.get('vietnam')).toBe('VN');
    expect(lookup.get('turkiye')).toBe('TR');
  });
});
