/**
 * 文件说明: 渲染 City Finder Tab 的城市匹配结果统计、搜索和列表。
 * 对应文档: docs/specs/21-tool-responsive-layout.md
 */
'use client';

import type { TemperatureUnit, DisplayLocale } from '@/domain/format';
import type { DashboardResultItem } from '@/domain/weather-dashboard-shared';
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
  visibleResultItems: DashboardResultItem[];
  selectedCityId: string | null;
  visibleRegionCount: number;
  visibleCount: number;
  highMatchCityCount: number;
  loadError: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  onCityKeywordChange: (keyword: string) => void;
  onSelectCity: (cityId: string) => void;
  onLoadMore: () => void;
};

export function CityFinderResultsPanel({
  locale,
  temperatureUnit,
  copy,
  cityKeyword,
  resultItems,
  visibleResultItems,
  selectedCityId,
  visibleRegionCount,
  visibleCount,
  highMatchCityCount,
  loadError,
  isLoading,
  isRefreshing,
  onCityKeywordChange,
  onSelectCity,
  onLoadMore
}: CityFinderResultsPanelProps) {
  return (
    <aside className="results-panel" aria-label={copy.resultPanel}>
      <div className="summary-grid">
        <div>
          <span>{visibleRegionCount > 0 ? copy.coverageRegions : copy.coverageCities}</span>
          <strong>{visibleRegionCount > 0 ? visibleRegionCount : visibleCount}</strong>
        </div>
        <div>
          <span>{copy.citySamples}</span>
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
          visibleResultItems={visibleResultItems}
          selectedCityId={selectedCityId}
          onSelectCity={onSelectCity}
          onLoadMore={onLoadMore}
        />
      )}
      {isRefreshing ? <RefreshOverlay label={copy.loadingWeatherData} /> : null}
    </aside>
  );
}
