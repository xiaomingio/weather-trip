/**
 * 文件说明: 作为静态天气包生成器的 CLI 入口，实际请求、编码和写入逻辑归属 scripts/lib/weather。
 * 对应文档: docs/specs/31-data-flow.md, docs/specs/32-public-data-contract.md, docs/specs/41-weather-matrix-performance.md
 */
import { runGenerateStaticWeather } from './lib/weather/static-weather-generation.js';

await runGenerateStaticWeather(process.argv.slice(2));
