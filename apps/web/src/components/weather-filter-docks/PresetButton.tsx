/**
 * 文件说明: 渲染天气筛选浮层和推荐筛选行复用的预设按钮。
 * 对应文档: docs/prototypes/weather-filter-interaction/index.html
 */
'use client';

import type { ReactNode } from 'react';

type PresetButtonProps = {
  children: ReactNode;
  onClick: () => void;
};

export function PresetButton({ children, onClick }: PresetButtonProps) {
  return (
    <button className="filter-preset-button" type="button" onClick={onClick}>
      {children}
    </button>
  );
}
