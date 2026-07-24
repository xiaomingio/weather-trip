/**
 * 文件说明: 作为静态地图矢量瓦片生成器的 CLI 入口，实际生成逻辑归属 scripts/lib/geo。
 * 对应文档: docs/specs/42-map-vector-tiles-performance.md
 */
import { runGenerateStaticGeoTiles } from './lib/geo/region-tile-generation.js';

await runGenerateStaticGeoTiles(process.argv.slice(2));
