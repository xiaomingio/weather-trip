/**
 * 文件说明: 渲染带悬停/点击浮层定位逻辑的单个天气筛选摘要卡。
 * 对应文档: docs/prototypes/weather-filter-interaction/index.html
 */
'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { FilterPopoverCardProps } from './types';

export function FilterPopoverCard({ filterKey, activeKey, label, value, icon, children, onOpen, onClose }: FilterPopoverCardProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const popoverGapPx = 8;
  const popoverMinWidthPx = 330;
  const [popoverPosition, setPopoverPosition] = useState({ arrowLeft: 28, left: 0, top: 0, width: popoverMinWidthPx });
  const active = activeKey === filterKey;

  useEffect(() => {
    if (!active) return;

    const updatePopoverPosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const width = Math.min(Math.max(rect.width, popoverMinWidthPx), window.innerWidth - 24);
      const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12));
      const triggerCenter = rect.left + rect.width / 2;
      const arrowLeft = Math.min(Math.max(18, triggerCenter - left - 5.5), width - 29);
      setPopoverPosition({ arrowLeft, left, top: rect.bottom + popoverGapPx, width });
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    updatePopoverPosition();
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePopoverPosition);
    window.addEventListener('scroll', updatePopoverPosition, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePopoverPosition);
      window.removeEventListener('scroll', updatePopoverPosition, true);
    };
  }, [active, onClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const clearCloseTimer = () => {
    if (!closeTimerRef.current) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      if (!wrapperRef.current?.matches(':hover')) onClose(filterKey);
    }, 240);
  };

  const popoverStyle = {
    '--filter-popover-arrow-left': `${popoverPosition.arrowLeft}px`,
    '--filter-popover-left': `${popoverPosition.left}px`,
    '--filter-popover-top': `${popoverPosition.top}px`,
    '--filter-popover-width': `${popoverPosition.width}px`
  } as CSSProperties;

  return (
    <div
      ref={wrapperRef}
      className="filter-popover-card"
      data-active={active ? 'true' : undefined}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') {
          clearCloseTimer();
          onOpen(filterKey);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch') scheduleClose();
      }}
      onFocusCapture={() => onOpen(filterKey)}
    >
      <button
        ref={buttonRef}
        className="filter-summary-card"
        type="button"
        aria-expanded={active}
        onClick={() => {
          clearCloseTimer();
          if (!active) onOpen(filterKey);
        }}
      >
        <span className="filter-summary-label">
          {icon}
          <span>{label}</span>
        </span>
        <span className="filter-summary-value">
          <span>{value}</span>
          {active ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
        </span>
      </button>
      {active ? (
        <>
          <div className="filter-popover-bridge" style={popoverStyle} aria-hidden="true" />
          <div className="filter-popover" style={popoverStyle} role="dialog" aria-label={label}>
            {children}
          </div>
        </>
      ) : null}
    </div>
  );
}
