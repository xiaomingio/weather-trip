/**
 * 文件说明: 提供 weather-db 内部批量写入等仓储实现共用的小型工具函数。
 * 对应文档: docs/data-flow.md
 */

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
