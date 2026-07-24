# 地图瓦片报告

生成时间：`2026-07-24T15:31:32.410Z`
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
- Markdown 报告：`data/report/geo-tile-report.md`

## 源包

| 路径 | feature 数 |
| --- | ---: |
| data/generated/geo/country.geojson | 246 |
| data/generated/geo/c2_admin1.geojson | 725 |
| data/generated/geo/c3_admin1.geojson | 97 |
| data/generated/geo/c3_admin2/CN.geojson | 476 |
| data/generated/geo/c3_admin2/ES.geojson | 52 |
| data/generated/geo/c3_admin2/FR.geojson | 96 |
| data/generated/geo/c3_admin2/IT.geojson | 107 |
| data/generated/geo/c3_admin2/PE.geojson | 196 |

## Feature

- 归一化 feature：1960
- 层级：country 246, admin1 787, admin2 927, boundary 0
- 天气粒度：country 221, admin1 728, admin2 1011
- 去重 regionKey：0
- 跳过非天气 regionKey：35
- 缺少低 zoom 国家边界：0

## 分包

| 包 | 实际 tile zoom | 显示 zoom | 瓦片文件数 | MVT 原始体积 | 最大单 tile |
| --- | --- | --- | ---: | ---: | ---: |
| admin1 | z3-z4 | 到 z4 | 186 | 5.22 MB | 235.1 KB |
| admin2 | z5-z5 | z5 overzoom 到 z8 | 445 | 5.84 MB | 196.8 KB |
| country | z1-z2 | 到 z2 | 16 | 600.0 KB | 222.8 KB |

## 分档

| 包 | 档位 | feature | feature 数 | 实际 tile zoom | 显示 zoom | tolerance | 瓦片数 | MVT 原始体积 | 最大单 tile |
| --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: |
| country | country | country | 246 | z1-z2 | z1-z2 | 8 | 16 | 600.0 KB | 222.8 KB |
| admin1 | admin1 | admin1+country-fallback | 1008 | z3-z4 | z3-z4 | 4 | 186 | 5.22 MB | 235.1 KB |
| admin2 | admin2 | admin2+boundary+admin1/country-fallback | 1856 | z5-z5 | z5-z8 | 3 | 445 | 5.84 MB | 196.8 KB |

## Zoom 汇总

| Zoom | 瓦片数 | 原始体积 |
| ---: | ---: | ---: |
| z1 | 4 | 33.2 KB |
| z2 | 12 | 566.8 KB |
| z3 | 43 | 416.7 KB |
| z4 | 143 | 4.82 MB |
| z5 | 445 | 5.84 MB |

总瓦片文件：647
总 MVT 原始体积：11.65 MB
最大单瓦片：`apps/web/public/data/geo/region-tiles/admin1/4/4/4.mvt` (235.1 KB)

z6-z8 不生成新高精度文件，由 MapLibre 对 z5 高精度瓦片 overzoom。文件数量下降主要来自高精度档停止继续切到 z6/z7/z8。
