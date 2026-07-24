/**
 * 文件说明: 渲染天气工具页局部数据刷新时的半透明加载遮罩。
 * 对应文档: docs/specs/21-tool-responsive-layout.md
 */
'use client';

type RefreshOverlayProps = {
  label: string;
};

export function RefreshOverlay({ label }: RefreshOverlayProps) {
  return (
    <div className="refresh-overlay" role="status" aria-live="polite" aria-label={label}>
      <span className="refresh-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
