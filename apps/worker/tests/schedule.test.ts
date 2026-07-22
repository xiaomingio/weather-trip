/**
 * 文件说明: 验证 Worker 每日固定时间调度的纯时间计算，防止改回按启动间隔漂移。
 * 对应文档: docs/runtime.md
 */
import { describe, expect, it } from 'vitest';
import { getNextDailyRefreshAt, parseDailyRefreshSchedule } from '../src/schedule.js';

describe('daily refresh schedule', () => {
  it('uses 09:00 UTC by default', () => {
    expect(parseDailyRefreshSchedule({})).toEqual({
      hour: 9,
      minute: 0,
      timezone: 'UTC'
    });
  });

  it('schedules today when the configured time has not passed in the target timezone', () => {
    const nextRunAt = getNextDailyRefreshAt(new Date('2026-07-20T19:00:00.000Z'), {
      hour: 4,
      minute: 0,
      timezone: 'Asia/Shanghai'
    });

    expect(nextRunAt.toISOString()).toBe('2026-07-20T20:00:00.000Z');
  });

  it('schedules tomorrow when the configured time has already passed in the target timezone', () => {
    const nextRunAt = getNextDailyRefreshAt(new Date('2026-07-20T21:00:00.000Z'), {
      hour: 4,
      minute: 0,
      timezone: 'Asia/Shanghai'
    });

    expect(nextRunAt.toISOString()).toBe('2026-07-21T20:00:00.000Z');
  });
});
