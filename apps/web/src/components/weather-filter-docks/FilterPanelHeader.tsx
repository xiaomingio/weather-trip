/**
 * 文件说明: 渲染筛选浮层顶部标题、当前值、启用开关和完成按钮。
 * 对应文档: docs/prototypes/weather-filter-interaction/index.html
 */
'use client';

type FilterPanelHeaderProps = {
  title: string;
  value: string;
  doneLabel: string;
  enabledLabel?: string;
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  onClose: () => void;
};

export function FilterPanelHeader({
  title,
  value,
  doneLabel,
  enabledLabel,
  enabled,
  onEnabledChange,
  onClose
}: FilterPanelHeaderProps) {
  return (
    <>
      <div className="filter-panel-title-row">
        <strong>{title}</strong>
        {typeof enabled === 'boolean' && onEnabledChange ? (
          <label className="filter-switch filter-heading-switch">
            <input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
            <span>{enabledLabel}</span>
          </label>
        ) : null}
        <button className="filter-panel-done" type="button" onClick={() => onClose()}>
          {doneLabel}
        </button>
      </div>
      <div className="filter-panel-value-row">{value}</div>
    </>
  );
}
