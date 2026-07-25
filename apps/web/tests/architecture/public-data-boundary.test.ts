/**
 * 文件说明: 覆盖 Web app 运行时代码和测试不能依赖仓库根 data 目录的架构边界。
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findPublicDataBoundaryFailures } from '../../../../scripts/lib/public-data-boundary';

async function withTempWorkspace<T>(run: (rootDir: string) => Promise<T>): Promise<T> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'weather-trip-boundary-'));
  try {
    return await run(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

describe('public data boundary', () => {
  it('allows Web app code to reference runtime public data URLs', async () => {
    await withTempWorkspace(async (rootDir) => {
      const srcDir = path.join(rootDir, 'apps/web/src');
      await mkdir(srcDir, { recursive: true });
      await writeFile(path.join(srcDir, 'runtime-data.ts'), "export const citiesUrl = '/data/cities.json';\n");

      await expect(findPublicDataBoundaryFailures({ rootDir })).resolves.toEqual([]);
    });
  });

  it('rejects Web app source and test references to root data artifacts', async () => {
    await withTempWorkspace(async (rootDir) => {
      const srcDir = path.join(rootDir, 'apps/web/src');
      const testDir = path.join(rootDir, 'apps/web/tests');
      await Promise.all([mkdir(srcDir, { recursive: true }), mkdir(testDir, { recursive: true })]);
      const generatedPath = 'data/' + 'generated/cities/cities.jsonl';
      const relativeRootDataPath = '../' + '../' + '..' + '/data';
      await writeFile(path.join(srcDir, 'bad-source.ts'), `export const bad = '${generatedPath}';\n`);
      await writeFile(path.join(testDir, 'bad-test.ts'), `export const bad = '${relativeRootDataPath}';\n`);

      const failures = await findPublicDataBoundaryFailures({ rootDir });

      expect(failures).toHaveLength(2);
      expect(failures.some((failure) => failure.startsWith('apps/web/src/bad-source.ts:1'))).toBe(true);
      expect(failures.some((failure) => failure.startsWith('apps/web/tests/bad-test.ts:1'))).toBe(true);
    });
  });
});
