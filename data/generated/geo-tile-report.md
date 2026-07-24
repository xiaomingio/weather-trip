# 地图瓦片报告

生成时间：`2026-07-24T09:37:57.714Z`
Dry run：`false`
Source layer：`weather_region`

## 缩放范围

| 对象 | minZoom | defaultZoom | maxZoom |
| --- | ---: | ---: | ---: |
| 当前地图 | 1 | 1.35 | 8 |

## 输出

- 瓦片目录：`apps/web/public/data/geo/region-tiles`
- Manifest：`apps/web/public/data/geo/region-tiles/manifest.json`
- NDJSON：`data/generated/geo-regions.ndjson`
- JSON 报告：`data/generated/geo-tile-report.json`
- Markdown 报告：`data/generated/geo-tile-report.md`

## 源包

| 路径 | feature 数 | 原始体积 | Gzip | Brotli |
| --- | ---: | ---: | ---: | ---: |
| data/generated/geo/world.geojson | 1024 | 14.07 MB | 774.8 KB | 529.1 KB |
| data/generated/geo/region-outlines.geojson | 33 | 2.06 MB | 352.7 KB | 133.6 KB |
| data/generated/geo/countries/CN.geojson | 428 | 3.37 MB | 915.1 KB | 525.8 KB |
| data/generated/geo/countries/ES.geojson | 71 | 1.54 MB | 324.9 KB | 187.6 KB |
| data/generated/geo/countries/FR.geojson | 109 | 1.60 MB | 410.2 KB | 241.5 KB |
| data/generated/geo/countries/IT.geojson | 127 | 1.17 MB | 290.3 KB | 176.8 KB |
| data/generated/geo/countries/PE.geojson | 217 | 1.70 MB | 407.0 KB | 236.5 KB |

## Feature

- 归一化 feature：1868
- 层级：country 245, admin1 807, admin2 803, boundary 13
- 天气粒度：country 220, admin1 715, admin2 933
- 可直接匹配天气区域：1854
- 去重 regionKey：111
- 跳过非天气 regionKey：8
- 缺少低 zoom 国家边界：0

## 分包

| 包 | 实际 tile zoom | 显示 zoom | 瓦片文件数 | MVT 原始体积 | 最大单 tile |
| --- | --- | --- | ---: | ---: | ---: |
| admin1 | z3-z4 | 到 z4 | 190 | 3.10 MB | 229.3 KB |
| admin2 | z5-z5 | z5 overzoom 到 z8 | 454 | 3.54 MB | 194.2 KB |
| country | z1-z2 | 到 z2 | 16 | 698.3 KB | 231.2 KB |

## 分档

| 包 | 档位 | feature | feature 数 | 实际 tile zoom | 显示 zoom | tolerance | 瓦片数 | MVT 原始体积 | 最大单 tile |
| --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: |
| country | country | country | 245 | z1-z2 | z1-z2 | 8 | 16 | 698.3 KB | 231.2 KB |
| admin1 | admin1 | admin1+country-fallback | 1024 | z3-z4 | z3-z4 | 4 | 190 | 3.10 MB | 229.3 KB |
| admin2 | admin2 | admin2+boundary+admin1/country-fallback | 1732 | z5-z5 | z5-z8 | 3 | 454 | 3.54 MB | 194.2 KB |

## Zoom 汇总

| Zoom | 瓦片数 | 原始体积 | Gzip | Brotli |
| ---: | ---: | ---: | ---: | ---: |
| z1 | 4 | 40.9 KB | 29.6 KB | 26.9 KB |
| z2 | 12 | 657.4 KB | 185.1 KB | 158.9 KB |
| z3 | 44 | 515.9 KB | 258.1 KB | 227.6 KB |
| z4 | 146 | 2.60 MB | 574.2 KB | 492.4 KB |
| z5 | 454 | 3.54 MB | 1.20 MB | 1.05 MB |

总瓦片文件：660
总 MVT 原始体积：7.32 MB
最大单瓦片：`apps/web/public/data/geo/region-tiles/country/2/2/1.mvt` (231.2 KB)

z6-z8 不生成新高精度文件，由 MapLibre 对 z5 高精度瓦片 overzoom。文件数量下降主要来自高精度档停止继续切到 z6/z7/z8。
