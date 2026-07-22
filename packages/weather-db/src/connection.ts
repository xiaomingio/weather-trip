/**
 * 文件说明: 创建 weather-db Postgres 连接，并初始化当前天气数据库 Schema。
 * 对应文档: docs/data-flow.md
 */

import { Pool } from 'pg';
import { ensureWeatherSchema } from './schema.js';
import type { WeatherDatabase } from './types.js';

export function createWeatherDatabase(connectionString = process.env.DATABASE_URL): WeatherDatabase {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  const pool = new Pool({ connectionString });
  return {
    pool,
    close: () => pool.end()
  };
}

export async function setupWeatherDatabase(db: WeatherDatabase): Promise<void> {
  await ensureWeatherSchema(db.pool);
}
