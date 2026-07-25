/**
 * 文件说明: 检查 app 代码不能直接读取仓库根 data 目录，只能依赖 public/data 或运行时 /data URL。
 */
import path from 'node:path';
import { assertPublicDataBoundary } from './lib/public-data-boundary.js';

const rootDir = process.cwd();
await assertPublicDataBoundary({
  rootDir,
  sourceRoots: [path.join(rootDir, 'apps')]
});
console.log('✔ app code only references public data boundaries');
