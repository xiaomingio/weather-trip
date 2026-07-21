/**
 * 文件说明: Worker 长驻入口，启动时检查一次天气数据，并按固定本地时间安排每日刷新。
 * 对应文档: docs/runtime.md
 */
import { createWeatherDatabase } from 'weather-db';
import { refreshWeather } from './actions/refresh-weather.js';
import { getNextDailyRefreshAt, parseDailyRefreshSchedule } from './schedule.js';

const schedule = parseDailyRefreshSchedule();
const db = createWeatherDatabase();

let running = false;
let timer: NodeJS.Timeout | undefined;

async function runRefresh(): Promise<void> {
  if (running) {
    console.log('Weather refresh is already running. Skipping this tick.');
    return;
  }

  running = true;
  try {
    const result = await refreshWeather(db);
    console.log(`Scheduled refresh complete: ${result.citiesFetched}/${result.cities} cities fetched, ${result.forecastsUpserted} forecasts upserted.`);
  } catch (error) {
    console.error('Scheduled refresh failed.', error);
  } finally {
    running = false;
  }
}

function scheduleNextRefresh(): void {
  const nextRunAt = getNextDailyRefreshAt(new Date(), schedule);
  const delayMs = Math.max(1, nextRunAt.getTime() - Date.now());
  console.log(
    `Next weather refresh scheduled at ${nextRunAt.toISOString()} ` +
      `(${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')} ${schedule.timezone}).`
  );

  timer = setTimeout(() => {
    void runRefresh().finally(scheduleNextRefresh);
  }, delayMs);
}

await runRefresh();
scheduleNextRefresh();

async function shutdown(): Promise<void> {
  if (timer) clearTimeout(timer);
  await db.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});
