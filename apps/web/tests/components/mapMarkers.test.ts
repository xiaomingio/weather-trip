/**
 * 文件说明: 覆盖 WorldWeatherMap 点位避让密度随 zoom 和点数变化的交互规则。
 * 对应文档: docs/specs/41-weather-map-interactions.md
 */
import { describe, expect, it } from 'vitest';
import { markerCellSize } from '@/components/WorldWeatherMap/mapMarkers';

describe('map marker density', () => {
  it('keeps sparse global views readable', () => {
    expect(markerCellSize(1.4, 3000)).toBe(64);
    expect(markerCellSize(2.4, 3000)).toBe(56);
  });

  it('continues decluttering dense country views when zoomed out', () => {
    expect(markerCellSize(5.2, 337)).toBe(34);
    expect(markerCellSize(5.2, 80)).toBe(0);
  });

  it('shows all markers after the user zooms in enough', () => {
    expect(markerCellSize(6, 337)).toBe(0);
  });
});
