/**
 * 文件说明: 作为静态地图 GeoJSON 边界生成器的 CLI 入口，实际生成逻辑归属 scripts/lib/geo。
 * 对应文档: docs/specs/30-weather-coverage-design.md, docs/specs/31-data-flow.md
 */
import { runGenerateStaticGeo } from './lib/geo/static-geo-generation.js';

await runGenerateStaticGeo();
