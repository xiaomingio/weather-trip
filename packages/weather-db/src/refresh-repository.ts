/**
 * 文件说明: 读取和更新 Worker 刷新任务的成功、失败和完成状态。
 * 对应文档: docs/data-flow.md
 */

import type { RefreshStatus, WeatherDatabase } from './types.js';

function mapRefreshStatus(row: Record<string, unknown>): RefreshStatus {
  return {
    key: String(row.key),
    lastSuccessAt: row.last_success_at instanceof Date ? row.last_success_at : undefined,
    lastCompleteAt: row.last_complete_at instanceof Date ? row.last_complete_at : undefined,
    lastErrorType: row.last_error_type === null ? undefined : String(row.last_error_type),
    lastErrorMessage: row.last_error_message === null ? undefined : String(row.last_error_message)
  };
}

export async function readRefreshStatus(db: WeatherDatabase, key: string): Promise<RefreshStatus | undefined> {
  const result = await db.pool.query('select * from refresh_status where key = $1', [key]);
  return result.rows[0] ? mapRefreshStatus(result.rows[0]) : undefined;
}

export async function updateRefreshSuccess(db: WeatherDatabase, key: string): Promise<void> {
  await db.pool.query(
    `
      insert into refresh_status (key, last_success_at, last_complete_at, last_error_type, last_error_message, updated_at)
      values ($1, now(), now(), null, null, now())
      on conflict (key) do update set
        last_success_at = now(),
        last_complete_at = now(),
        last_error_type = null,
        last_error_message = null,
        updated_at = now()
    `,
    [key]
  );
}

export async function updateRefreshFailure(db: WeatherDatabase, key: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.pool.query(
    `
      insert into refresh_status (key, last_complete_at, last_error_type, last_error_message, updated_at)
      values ($1, now(), $2, $3, now())
      on conflict (key) do update set
        last_complete_at = now(),
        last_error_type = excluded.last_error_type,
        last_error_message = excluded.last_error_message,
        updated_at = now()
    `,
    [key, error instanceof Error ? error.name : 'Error', message.slice(0, 500)]
  );
}
