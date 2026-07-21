/**
 * 文件说明: 覆盖城市结果列表关键词过滤所依赖的中英文和罗马化名称匹配。
 * 对应文档: docs/product-design.md
 */
import { describe, expect, it } from 'vitest';
import type { City } from 'weather-core/types';
import { cityMatchesKeyword } from './city-search';

const beijing: City = {
  id: 'beijing',
  names: {
    zh: '北京',
    en: 'Beijing'
  },
  country: 'China',
  countryCode: 'CN',
  admin1: 'Beijing',
  admin1LocalName: '北京市',
  latitude: 39.9,
  longitude: 116.4,
  timezone: 'Asia/Shanghai',
  elevationMeters: 44,
  region: 'asia'
};

const newYork: City = {
  id: 'new-york',
  names: {
    zh: '纽约',
    en: 'New York'
  },
  country: 'United States',
  countryCode: 'US',
  admin1: 'New York',
  admin1LocalName: 'New York',
  latitude: 40.7,
  longitude: -74,
  timezone: 'America/New_York',
  elevationMeters: 10,
  region: 'north_america'
};

describe('city keyword search', () => {
  it('matches Chinese city names directly', () => {
    expect(cityMatchesKeyword(beijing, '北京')).toBe(true);
  });

  it('matches romanized Chinese city names through the English city name', () => {
    expect(cityMatchesKeyword(beijing, 'bei jing')).toBe(true);
    expect(cityMatchesKeyword(beijing, 'beijing')).toBe(true);
  });

  it('matches English city names while ignoring spaces and case', () => {
    expect(cityMatchesKeyword(newYork, 'newyork')).toBe(true);
    expect(cityMatchesKeyword(newYork, 'NEW york')).toBe(true);
  });

  it('matches localized country names', () => {
    expect(cityMatchesKeyword(beijing, '中国')).toBe(true);
    expect(cityMatchesKeyword(newYork, 'United States')).toBe(true);
  });

  it('rejects unrelated keywords', () => {
    expect(cityMatchesKeyword(beijing, 'new york')).toBe(false);
  });
});
