/**
 * 文件说明: 计算 Worker 每日固定本地时间的下一次触发时间，避免按进程启动时间漂移。
 * 对应文档: docs/runtime.md
 */

const defaultRefreshTime = '09:00';
const defaultRefreshTimezone = 'UTC';

export type DailyRefreshSchedule = {
  hour: number;
  minute: number;
  timezone: string;
};

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseTime(value: string): { hour: number; minute: number } {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) {
    throw new Error(`WEATHER_REFRESH_TIME must use HH:mm 24-hour format. Received: ${value}`);
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  };
}

export function parseDailyRefreshSchedule(env = process.env): DailyRefreshSchedule {
  const { hour, minute } = parseTime(env.WEATHER_REFRESH_TIME ?? defaultRefreshTime);
  return {
    hour,
    minute,
    timezone: env.WEATHER_REFRESH_TIMEZONE ?? defaultRefreshTimezone
  };
}

function getZonedParts(date: Date, timezone: string): ZonedDateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

function getTimezoneOffsetMs(date: Date, timezone: string): number {
  const parts = getZonedParts(date, timezone);
  const zonedAsUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return zonedAsUtcMs - date.getTime();
}

function zonedDateTimeToUtc(parts: ZonedDateParts, timezone: string): Date {
  let utcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offsetMs = getTimezoneOffsetMs(new Date(utcMs), timezone);
    const nextUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - offsetMs;
    if (nextUtcMs === utcMs) break;
    utcMs = nextUtcMs;
  }

  return new Date(utcMs);
}

function addDays(parts: ZonedDateParts, days: number): ZonedDateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, parts.hour, parts.minute, parts.second));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

export function getNextDailyRefreshAt(now: Date, schedule: DailyRefreshSchedule): Date {
  const today = getZonedParts(now, schedule.timezone);
  const targetToday = {
    ...today,
    hour: schedule.hour,
    minute: schedule.minute,
    second: 0
  };
  const todayRunAt = zonedDateTimeToUtc(targetToday, schedule.timezone);

  if (todayRunAt.getTime() > now.getTime()) {
    return todayRunAt;
  }

  return zonedDateTimeToUtc(addDays(targetToday, 1), schedule.timezone);
}
