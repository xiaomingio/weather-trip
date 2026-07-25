/**
 * 文件说明: 渲染 City Finder Tab 的城市匹配结果统计、搜索和列表。
 * 对应文档: docs/specs/21-tool-responsive-layout.md
 */
'use client';

import type { TemperatureUnit, DisplayLocale } from '@/domain/format';
import type { DashboardResultItem } from '@/domain/weather-dashboard-shared';
import type { CityFocusRequest } from '../WorldWeatherMap/types';
import { CitySearchField } from './CitySearchField';
import { RefreshOverlay } from './RefreshOverlay';
import { ResultsList } from './ResultsList';
import type { DashboardPanelCopy } from './types';

type CityFinderResultsPanelProps = {
  locale: DisplayLocale;
  temperatureUnit: TemperatureUnit;
  copy: DashboardPanelCopy;
  cityKeyword: string;
  resultItems: DashboardResultItem[];
  selectedCityId: string | null;
  listFocusRequest: CityFocusRequest | null;
  visibleCount: number;
  highMatchCityCount: number;
  loadError: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  onCityKeywordChange: (keyword: string) => void;
  onSelectCity: (cityId: string) => void;
};

export function CityFinderResultsPanel({
  locale,
  temperatureUnit,
  copy,
  cityKeyword,
  resultItems,
  selectedCityId,
  listFocusRequest,
  visibleCount,
  highMatchCityCount,
  loadError,
  isLoading,
  isRefreshing,
  onCityKeywordChange,
  onSelectCity
}: CityFinderResultsPanelProps) {
  return (
    <aside className="results-panel" aria-label={copy.resultPanel}>
      <div className="summary-grid">
        <div>
          <span>{copy.cities}</span>
          <strong>{visibleCount}</strong>
        </div>
        <div>
          <span>{copy.highMatchCities}</span>
          <strong>{highMatchCityCount}</strong>
        </div>
      </div>

      <CitySearchField copy={copy} cityKeyword={cityKeyword} onCityKeywordChange={onCityKeywordChange} />

      {loadError ? <div className="data-status">{loadError}</div> : null}
      {isLoading ? (
        <div className="panel-loading-state" role="status">{copy.loadingWeatherData}</div>
      ) : (
        <ResultsList
          locale={locale}
          layer="comfort"
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
