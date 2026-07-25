/**
 * 文件说明: 检查 app 源码和测试不能直接引用仓库根 data 目录。
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const sourceFileExtensions = new Set(['.astro', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const forbiddenPatterns: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\bdata\/(?:generated|raw|input)\b/,
    reason: 'app code must not reference root data generated/raw/input paths'
  },
  {
    pattern: /['"`](?:\.\.\/)+data(?:\/|['"`])/,
    reason: 'app code must not reference the root data directory through relative paths'
  },
  {
    pattern: /\bdata\/report\b/,
    reason: 'app code must not reference root data report paths'
  },
  {
    pattern: /path\.(?:resolve|join)\([^)]*['"`]data['"`][^)]*\)/s,
    reason: 'app code must not build filesystem paths into the root data directory'
  },
  {
    pattern: /new URL\([^)]*['"`](?:\.\.\/)*data\/(?:generated|raw|input)\b/s,
    reason: 'app code must not build file URLs into the root data directory'
  },
  {
    pattern: /new URL\([^)]*['"`](?:\.\.\/)*data\/report\b/s,
    reason: 'app code must not build file URLs into the root data report directory'
  }
];

export type PublicDataBoundaryOptions = {
  rootDir: string;
  sourceRoots?: string[];
};

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

export async function findPublicDataBoundaryFailures(options: PublicDataBoundaryOptions): Promise<string[]> {
  const sourceRoots = options.sourceRoots ?? [path.join(options.rootDir, 'apps')];
  const failures: string[] = [];
  for (const sourceRoot of sourceRoots) {
    for await (const filePath of walkFiles(sourceRoot)) {
      if (!filePath.includes(`${path.sep}src${path.sep}`) && !filePath.includes(`${path.sep}tests${path.sep}`)) continue;
      const content = await readFile(filePath, 'utf8');
      for (const { pattern, reason } of forbiddenPatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(content);
        if (!match || match.index === undefined) continue;
        failures.push(`${path.relative(options.rootDir, filePath)}:${lineNumberForIndex(content, match.index)} ${reason}`);
      }
    }
  }
  return failures;
}

export async function assertPublicDataBoundary(options: PublicDataBoundaryOptions): Promise<void> {
  const failures = await findPublicDataBoundaryFailures(options);
  if (failures.length > 0) {
    throw new Error(`Public data boundary check failed:\n${failures.join('\n')}`);
  }
}
