/**
 * 文件说明: Worker 长驻入口，启动时刷新一次天气数据，并按配置间隔继续执行每日刷新。
 * 对应文档: docs/runtime.md
 */
import { createWeatherDatabase } from 'weather-db';
import { refreshWeather } from './actions/refresh-weather.js';

const intervalHours = Number(process.env.WEATHER_REFRESH_INTERVAL_HOURS ?? 24);
const intervalMs = Math.max(1, intervalHours) * 60 * 60 * 1000;
const db = createWeatherDatabase();

let running = false;

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

await runRefresh();
const timer = setInterval(runRefresh, intervalMs);

async function shutdown(): Promise<void> {
  clearInterval(timer);
  await db.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});
