/**
 * 文件说明: 渲染 Weather Map Tab 的覆盖统计、排序控件、城市搜索和地图结果列表。
 * 对应文档: docs/specs/21-tool-responsive-layout.md
 */
'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import type { MapLayer } from 'weather-core/types';
import type { DisplayLocale, TemperatureUnit } from '@/domain/format';
import type { DashboardResultItem } from '@/domain/weather-dashboard-shared';
import type { CityFocusRequest } from '../WorldWeatherMap/types';
import { CitySearchField } from './CitySearchField';
import { RefreshOverlay } from './RefreshOverlay';
import { ResultsList } from './ResultsList';
import type { DashboardPanelCopy, SortDirection, WeatherMapSortKey, WeatherMapSortOption } from './types';

type WeatherMapResultsPanelProps = {
  locale: DisplayLocale;
  layer: MapLayer;
  temperatureUnit: TemperatureUnit;
  copy: DashboardPanelCopy;
  cityKeyword: string;
  resultItems: DashboardResultItem[];
  selectedCityId: string | null;
  listFocusRequest: CityFocusRequest | null;
  visibleCount: number;
  loadError: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  weatherMapSortKey: WeatherMapSortKey;
  weatherMapSortDirection: SortDirection;
  weatherMapSortOptions: WeatherMapSortOption[];
  weatherMapSortDirections: Record<WeatherMapSortKey, SortDirection>;
  selectedWeatherMapSortLabel: string;
  onCityKeywordChange: (keyword: string) => void;
  onSelectCity: (cityId: string) => void;
  onWeatherMapSortKeyChange: (sortKey: WeatherMapSortKey) => void;
  onWeatherMapSortDirectionChange: (direction: SortDirection) => void;
};

export function WeatherMapResultsPanel({
  locale,
  layer,
  temperatureUnit,
  copy,
  cityKeyword,
  resultItems,
  selectedCityId,
  listFocusRequest,
  visibleCount,
  loadError,
  isLoading,
  isRefreshing,
  weatherMapSortKey,
  weatherMapSortDirection,
  weatherMapSortOptions,
  weatherMapSortDirections,
  selectedWeatherMapSortLabel,
  onCityKeywordChange,
  onSelectCity,
  onWeatherMapSortKeyChange,
  onWeatherMapSortDirectionChange
}: WeatherMapResultsPanelProps) {
  return (
    <aside className="results-panel" aria-label={copy.resultPanel}>
      <div className="summary-grid summary-grid-weather-map">
        <div>
          <span>{copy.cities}</span>
          <strong>{visibleCount}</strong>
        </div>
        <div className="summary-sort-field">
          <div className="summary-sort-copy">
            <button
              type="button"
              className="summary-sort-direction"
              onClick={() => onWeatherMapSortDirectionChange(weatherMapSortDirection === 'asc' ? 'desc' : 'asc')}
              aria-label={weatherMapSortDirection === 'asc' ? copy.sortAscending : copy.sortDescending}
              title={weatherMapSortDirection === 'asc' ? copy.sortAscending : copy.sortDescending}
            >
              <span>{copy.sort}</span>
              {weatherMapSortDirection === 'asc' ? <ArrowUp size={15} aria-hidden="true" /> : <ArrowDown size={15} aria-hidden="true" />}
            </button>
            <span className="summary-sort-select-shell">
              <span className="summary-sort-value">{selectedWeatherMapSortLabel}</span>
              <select
                value={weatherMapSortKey}
                onChange={(event) => {
                  const sortKey = event.target.value as WeatherMapSortKey;
                  onWeatherMapSortKeyChange(sortKey);
                  onWeatherMapSortDirectionChange(weatherMapSortDirections[sortKey]);
                }}
                aria-label={copy.sort}
              >
                {weatherMapSortOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.labels[locale]}
                  </option>
                ))}
              </select>
            </span>
          </div>
        </div>
      </div>

      <CitySearchField copy={copy} cityKeyword={cityKeyword} onCityKeywordChange={onCityKeywordChange} />

      {loadError ? <div className="data-status">{loadError}</div> : null}
      {isLoading ? (
        <div className="panel-loading-state" role="status">{copy.loadingWeatherData}</div>
      ) : (
        <ResultsList
          locale={locale}
          layer={layer}
          temperatureUnit={temperatureUnit}
          copy={copy}
          resultItems={resultItems}
          selectedCityId={selectedCityId}
          cityFocusRequest={listFocusRequest}
          onSelectCity={onSelectCity}
        />
      )}
      {isRefreshing ? <RefreshOverlay label={copy.loadingWeatherData} /> : null}
    </aside>
  );
}
