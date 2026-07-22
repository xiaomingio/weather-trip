/**
 * 文件说明: 覆盖天气工具页共享 URL 参数解析的默认值和容错规则。
 * 对应文档: docs/product-design.md
 */
import { describe, expect, it } from 'vitest';
import { readLayerFromSearch } from '@/domain/weather-dashboard-shared';

describe('weather dashboard shared URL parameters', () => {
  it('defaults the map layer to weather when layer is omitted', () => {
    expect(readLayerFromSearch('')).toBe('weather');
    expect(readLayerFromSearch(new URLSearchParams())).toBe('weather');
  });

  it('falls back to weather when layer is unsupported', () => {
    expect(readLayerFromSearch('layer=unsupported')).toBe('weather');
  });

  it('accepts supported map layers from the URL', () => {
    expect(readLayerFromSearch('layer=temperature')).toBe('temperature');
    expect(readLayerFromSearch(new URLSearchParams('layer=comfort'))).toBe('comfort');
  });
});
