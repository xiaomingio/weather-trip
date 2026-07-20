/**
 * 文件说明: 覆盖 Open-Meteo weather code 到内部天气类型的共享映射契约。
 * 对应文档: docs/data-flow.md
 */
import { describe, expect, it } from 'vitest';
import { weatherCodeToType } from './weather-code.js';

describe('weatherCodeToType', () => {
  it('maps common WMO codes into product weather buckets', () => {
    expect(weatherCodeToType(0)).toBe('sunny');
    expect(weatherCodeToType(2)).toBe('partly_cloudy');
    expect(weatherCodeToType(45)).toBe('fog');
    expect(weatherCodeToType(61)).toBe('light_rain');
    expect(weatherCodeToType(82)).toBe('rain');
    expect(weatherCodeToType(95)).toBe('thunderstorm');
    expect(weatherCodeToType(86)).toBe('snow');
  });
});
