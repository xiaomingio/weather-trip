/**
 * 文件说明: 覆盖天气预设和筛选状态合并规则，避免快速筛选继承旧开关状态。
 * 对应文档: docs/product-design.md
 */
import { describe, expect, it } from 'vitest';
import type { TravelFilter } from 'weather-core/types';
import { applyWeatherPreset, weatherPresets } from './weather';

const activeFilter: TravelFilter = {
  dateWindowDays: 10,
  useTemperature: true,
  temperatureMinC: -5,
  temperatureMaxC: 45,
  useHumidity: true,
  humidityMinPercent: 20,
  humidityMaxPercent: 90,
  useElevation: true,
  elevationMinMeters: 1000,
  elevationMaxMeters: 3000,
  useWeather: true,
  weatherTypes: ['rain'],
  region: 'country:CN'
};

describe('weather presets', () => {
  it('applies every filter switch from the preset instead of inheriting previous optional filters', () => {
    const preset = weatherPresets.find((item) => item.id === 'dry-weather');

    expect(preset).toBeDefined();

    const filter = applyWeatherPreset(activeFilter, preset!);

    expect(filter.dateWindowDays).toBe(activeFilter.dateWindowDays);
    expect(filter.region).toBe(activeFilter.region);
    expect(filter).toMatchObject({
      useTemperature: true,
      temperatureMinC: 15,
      temperatureMaxC: 30,
      useHumidity: false,
      humidityMinPercent: 40,
      humidityMaxPercent: 70,
      useElevation: false,
      elevationMinMeters: -500,
      elevationMaxMeters: 9000,
      useWeather: true
    });
  });

  it('includes high and low elevation presets that enable elevation without enabling humidity', () => {
    const highland = weatherPresets.find((item) => item.id === 'highland-cool-dry');
    const lowland = weatherPresets.find((item) => item.id === 'lowland-comfort-dry');

    expect(highland).toMatchObject({
      useElevation: true,
      elevationMinMeters: 1500,
      elevationMaxMeters: 9000,
      useHumidity: false
    });
    expect(lowland).toMatchObject({
      useElevation: true,
      elevationMinMeters: -500,
      elevationMaxMeters: 500,
      useHumidity: false
    });
  });
});
