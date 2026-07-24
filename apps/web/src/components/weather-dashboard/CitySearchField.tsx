/**
 * 文件说明: 渲染天气工具页结果面板里的城市搜索输入框。
 * 对应文档: docs/specs/21-tool-responsive-layout.md
 */
'use client';

import { Search } from 'lucide-react';
import type { DashboardPanelCopy } from './types';

type CitySearchFieldProps = {
  copy: DashboardPanelCopy;
  cityKeyword: string;
  onCityKeywordChange: (keyword: string) => void;
};

export function CitySearchField({ copy, cityKeyword, onCityKeywordChange }: CitySearchFieldProps) {
  return (
    <label className="city-search-field">
      <span className="sr-only">{copy.citySearch}</span>
      <Search size={16} aria-hidden="true" />
      <input
        value={cityKeyword}
        onChange={(event) => onCityKeywordChange(event.target.value)}
        type="search"
        placeholder={copy.citySearchPlaceholder}
        aria-label={copy.citySearch}
      />
    </label>
  );
}
