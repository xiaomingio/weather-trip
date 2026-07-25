/**
 * 文件说明: 提供 data/generated 中间产物使用的 JSONL 读写和内容版本工具。
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function readJsonLines<T>(filePath: string): Promise<T[]> {
  const content = await readFile(filePath, 'utf8');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

export function jsonLineContent(rows: unknown[]): string {
  return `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
}

export function generatedDataVersion(prefix: string, payload: unknown): string {
  const hash = createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 12);
  return `${prefix}-${hash}`;
}
