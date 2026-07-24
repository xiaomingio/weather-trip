/**
 * 文件说明: 作为静态城市 Wire 数据生成器的 CLI 入口，实际城市筛选和报告逻辑归属 scripts/lib/cities。
 * 对应文档: docs/specs/30-weather-coverage-design.md, docs/specs/31-data-flow.md
 */
import { runGenerateStaticCities } from './lib/cities/static-city-generation.js';

await runGenerateStaticCities();
