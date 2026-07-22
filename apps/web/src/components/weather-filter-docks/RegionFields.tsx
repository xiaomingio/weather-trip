/**
 * 文件说明: 渲染 City Finder 和 Weather Map 共用的主地区与子地区选择控件。
 * 对应文档: docs/prototypes/weather-filter-interaction/index.html
 */
'use client';

import { MapIcon, SlidersHorizontal } from 'lucide-react';
import type { RegionKey } from 'weather-core/types';
import { filterCopy } from './filterCopy';
import { regionGroups } from './filterFormat';
import type { RegionFieldsProps } from './types';

export function RegionFields({
  locale,
  primaryRegion,
  currentRegion,
  primaryRegionOptions,
  subRegionOptions,
  canSelectSubRegion,
  onPrimaryRegionChange,
  onSubRegionChange
}: RegionFieldsProps) {
  const subRegionValue = canSelectSubRegion && subRegionOptions.some((region) => region.id === currentRegion) ? currentRegion : primaryRegion;

  return (
    <>
      <label className="filter-select-card">
        <span className="filter-summary-label">
          <SlidersHorizontal size={15} />
          {filterCopy[locale].region}
        </span>
        <select value={primaryRegion} onChange={(event) => onPrimaryRegionChange(event.target.value as RegionKey)}>
          {regionGroups(primaryRegionOptions).map((group) => (
            <optgroup key={group} label={group}>
              {primaryRegionOptions
                .filter((option) => option.group === group)
                .map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className={`filter-select-card ${canSelectSubRegion ? '' : 'is-disabled'}`}>
        <span className="filter-summary-label">
          <MapIcon size={15} />
          {filterCopy[locale].subRegion}
        </span>
        <select
          value={subRegionValue}
          disabled={!canSelectSubRegion}
          onChange={(event) => onSubRegionChange(event.target.value as RegionKey)}
        >
          {subRegionOptions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
