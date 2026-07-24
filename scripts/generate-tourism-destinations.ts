/**
 * 文件说明: 作为旅游目的地静态数据生成器的 CLI 入口，实际清洗、匹配和报告逻辑归属 scripts/lib/tourism。
 * 对应文档: docs/specs/30-weather-coverage-design.md, docs/specs/31-data-flow.md
 */
import { runGenerateTourismDestinations } from './lib/tourism/tourism-destination-generation.js';

await runGenerateTourismDestinations();
