/**
 * 文件说明: 统一读取根目录共享 env 和 app 专属 env，供维护脚本与本地编排入口复用。
 * 对应文档: docs/runtime.md
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

function stripOptionalQuotes(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;

  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.at(-1) === quote) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function readEnvFile(envPath) {
  if (!existsSync(envPath)) return {};

  return Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .flatMap((line) => {
        const normalizedLine = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
        const separatorIndex = normalizedLine.indexOf('=');
        if (separatorIndex === -1) return [];

        return [[
          normalizedLine.slice(0, separatorIndex).trim(),
          stripOptionalQuotes(normalizedLine.slice(separatorIndex + 1))
        ]];
      })
  );
}

export function readEnvFiles(paths) {
  return Object.assign({}, ...paths.map(readEnvFile));
}

export function loadRootEnv() {
  const env = readEnvFiles([path.join(rootDir, '.env.development')]);
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function buildAppEnv(app, appEnvFileName = '.env.development') {
  const fileEnv = readEnvFiles([
    path.join(rootDir, '.env.development'),
    path.join(rootDir, 'apps', app, appEnvFileName)
  ]);

  return {
    ...fileEnv,
    ...process.env
  };
}
