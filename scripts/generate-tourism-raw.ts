/**
 * 文件说明: 作为旅游目的地 raw 快照生成器的 CLI 入口，实际抓取和写入逻辑归属 scripts/lib/tourism。
 * 对应文档: docs/specs/31-data-flow.md
 */
import { runGenerateTourismRaw } from './lib/tourism/tourism-raw-generation.js';

await runGenerateTourismRaw();
