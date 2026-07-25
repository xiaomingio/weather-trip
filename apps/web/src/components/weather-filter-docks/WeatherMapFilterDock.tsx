/**
 * 文件说明: 渲染 Weather Map 页面专属的地区、日期滑块和图层选择筛选 Dock。
 * 对应文档: docs/prototypes/weather-filter-interaction/index.html
 */
'use client';

import * as Slider from '@radix-ui/react-slider';
import { CalendarDays, Info, MapIcon } from 'lucide-react';
import { formatDateLabel } from '@/domain/format';
import { getMessages } from '@/i18n';
import { FilterDock } from './FilterDock';
import { RegionFields } from './RegionFields';
import type { WeatherMapFilterDockProps } from './types';

export function WeatherMapFilterDock({
  locale,
  primaryRegion,
  currentRegion,
  primaryRegionOptions,
  subRegionOptions,
  canSelectSubRegion,
  selectedDate,
  selectedDateIndex,
  regionAvailableDates,
  layer,
  layers,
  onPrimaryRegionChange,
  onSubRegionChange,
  onDateChange,
  onLayerChange
}: WeatherMapFilterDockProps) {
  const copy = getMessages(locale).filter;
  const selectedDateLabel = selectedDate ? formatDateLabel(selectedDate, locale) : copy.off;

  return (
    <FilterDock variant="weather-map">
      <RegionFields
        locale={locale}
        primaryRegion={primaryRegion}
        currentRegion={currentRegion}
        primaryRegionOptions={primaryRegionOptions}
        subRegionOptions={subRegionOptions}
        canSelectSubRegion={canSelectSubRegion}
        onPrimaryRegionChange={onPrimaryRegionChange}
        onSubRegionChange={onSubRegionChange}
      />

      <div className="filter-select-card filter-inline-card filter-date-card">
        <span className="filter-summary-label">
          <CalendarDays size={15} />
          <span>{copy.date}</span>
        </span>
        <span className="filter-summary-value">
          <span>{selectedDateLabel}</span>
        </span>
        <Slider.Root
          className="date-slider"
          value={[selectedDateIndex]}
          min={0}
          max={Math.max(regionAvailableDates.length - 1, 0)}
          step={1}
          disabled={regionAvailableDates.length <= 1}
          onValueChange={([dateIndex]) => onDateChange(regionAvailableDates[dateIndex] ?? selectedDate)}
        >
          <Slider.Track className="date-slider-track">
            <Slider.Range className="date-slider-range" />
          </Slider.Track>
          <Slider.Thumb className="date-slider-thumb" aria-label={copy.date} />
        </Slider.Root>
      </div>

      <div className="filter-select-card filter-inline-card filter-layer-card">
        <span className="filter-summary-label">
          <MapIcon size={15} />
          <span>{copy.layer}</span>
        </span>
        <div className="layer-button-row compact" aria-label={copy.layer}>
          {layers.map((item) => (
            <button
              key={item.id}
              className={`${layer === item.id ? 'is-active' : ''} ${item.id === 'comfort' ? 'has-info' : ''}`}
              type="button"
              aria-describedby={item.id === 'comfort' ? 'comfort-layer-help' : undefined}
              onClick={() => onLayerChange(item.id)}
            >
              <span>{item.labels[locale]}</span>
              {item.id === 'comfort' ? (
                <span className="layer-info" aria-hidden="true">
                  <Info size={13} />
                  <span id="comfort-layer-help" className="layer-info-tooltip" role="tooltip">
                    {copy.comfortHelp}
                  </span>
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </FilterDock>
  );
}
