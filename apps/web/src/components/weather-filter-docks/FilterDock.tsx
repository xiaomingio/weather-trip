/**
 * 文件说明: 渲染天气筛选 Dock 的外层布局，承载主筛选项和可选推荐筛选行。
 * 对应文档: docs/prototypes/weather-filter-interaction/index.html
 */
'use client';

import type { FilterDockProps } from './types';

export function FilterDock({ children, presets, variant = 'city-finder' }: FilterDockProps) {
  return (
    <section className="filter-dock" data-variant={variant} aria-label="Weather filters">
      <div className="filter-dock-main">{children}</div>
      {presets ? <div className="filter-dock-presets">{presets}</div> : null}
    </section>
  );
}
