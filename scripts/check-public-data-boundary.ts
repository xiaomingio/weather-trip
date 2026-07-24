/**
 * 文件说明: 检查 app 源码不能直接读取仓库根 data 目录，只能依赖 public/data 或运行时 /data URL。
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const sourceRoots = [path.join(rootDir, 'apps')];
const sourceFileExtensions = new Set(['.astro', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const forbiddenPatterns: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\bdata\/(?:generated|raw|input)\b/,
    reason: 'app source must not reference root data generated/raw/input paths'
  },
  {
    pattern: /path\.(?:resolve|join)\([^)]*['"`]data['"`][^)]*\)/s,
    reason: 'app source must not build filesystem paths into the root data directory'
  },
  {
    pattern: /new URL\([^)]*['"`](?:\.\.\/)*data\/(?:generated|raw|input)\b/s,
    reason: 'app source must not build file URLs into the root data directory'
  }
];

async function* walkFiles(dirPath: string): AsyncGenerator<string> {
  const entries = await readdir(dirPath, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'public') continue;
    const filePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(filePath);
      continue;
    }
    if (entry.isFile() && sourceFileExtensions.has(path.extname(entry.name))) yield filePath;
  }
}

function lineNumberForIndex(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

const failures: string[] = [];
for (const sourceRoot of sourceRoots) {
  for await (const filePath of walkFiles(sourceRoot)) {
    if (!filePath.includes(`${path.sep}src${path.sep}`)) continue;
    const content = await readFile(filePath, 'utf8');
    for (const { pattern, reason } of forbiddenPatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(content);
      if (!match || match.index === undefined) continue;
      failures.push(`${path.relative(rootDir, filePath)}:${lineNumberForIndex(content, match.index)} ${reason}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Public data boundary check failed:\n${failures.join('\n')}`);
}

console.log('✔ app source only references public data boundaries');
