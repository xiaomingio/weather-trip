/**
 * 文件说明: 渲染天气筛选 Dock 的外层布局，承载主筛选项和可选推荐筛选行。
 * 对应文档: docs/prototypes/weather-filter-interaction/index.html
 */
'use client';

import { useState } from 'react';
import type { FilterDockProps } from './types';

export function FilterDock({ children, presets, presetToggleLabels, variant = 'city-finder' }: FilterDockProps) {
  const [presetsExpanded, setPresetsExpanded] = useState(false);

  return (
    <section className="filter-dock" data-variant={variant} aria-label="Weather filters">
      <div className="filter-dock-main">{children}</div>
      {presets ? (
        <div className={`filter-dock-presets ${presetsExpanded ? 'is-expanded' : ''}`}>
          {presets}
          {presetToggleLabels ? (
            <button
              className="filter-presets-toggle"
              type="button"
              aria-expanded={presetsExpanded}
              onClick={() => setPresetsExpanded((current) => !current)}
            >
              {presetsExpanded ? presetToggleLabels.collapse : presetToggleLabels.expand}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
