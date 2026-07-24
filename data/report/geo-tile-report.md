# 地图瓦片报告

生成时间：`2026-07-24T14:28:14.278Z`
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
| data/generated/geo/c2_admin1.geojson | 695 |
| data/generated/geo/c3_admin1.geojson | 112 |
| data/generated/geo/c3_admin2/CN.geojson | 397 |
| data/generated/geo/c3_admin2/ES.geojson | 52 |
| data/generated/geo/c3_admin2/FR.geojson | 96 |
| data/generated/geo/c3_admin2/IT.geojson | 107 |
| data/generated/geo/c3_admin2/PE.geojson | 196 |

## Feature

- 归一化 feature：1874
- 层级：country 246, admin1 807, admin2 791, boundary 30
- 天气粒度：country 221, admin1 715, admin2 938
- 去重 regionKey：5
- 跳过非天气 regionKey：0
- 缺少低 zoom 国家边界：0

## 分包

| 包 | 实际 tile zoom | 显示 zoom | 瓦片文件数 | MVT 原始体积 | 最大单 tile |
| --- | --- | --- | ---: | ---: | ---: |
| admin1 | z3-z4 | 到 z4 | 189 | 3.25 MB | 226.3 KB |
| admin2 | z5-z5 | z5 overzoom 到 z8 | 452 | 3.83 MB | 193.0 KB |
| country | z1-z2 | 到 z2 | 16 | 1.14 MB | 272.4 KB |

## 分档

| 包 | 档位 | feature | feature 数 | 实际 tile zoom | 显示 zoom | tolerance | 瓦片数 | MVT 原始体积 | 最大单 tile |
| --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: |
| country | country | country | 246 | z1-z2 | z1-z2 | 8 | 16 | 1.14 MB | 272.4 KB |
| admin1 | admin1 | admin1+country-fallback | 1028 | z3-z4 | z3-z4 | 4 | 189 | 3.25 MB | 226.3 KB |
| admin2 | admin2 | admin2+boundary+admin1/country-fallback | 1738 | z5-z5 | z5-z8 | 3 | 452 | 3.83 MB | 193.0 KB |

## Zoom 汇总

| Zoom | 瓦片数 | 原始体积 |
| ---: | ---: | ---: |
| z1 | 4 | 40.7 KB |
| z2 | 12 | 1.10 MB |
| z3 | 44 | 374.3 KB |
| z4 | 145 | 2.89 MB |
| z5 | 452 | 3.83 MB |

总瓦片文件：657
总 MVT 原始体积：8.22 MB
最大单瓦片：`apps/web/public/data/geo/region-tiles/country/2/2/1.mvt` (272.4 KB)

z6-z8 不生成新高精度文件，由 MapLibre 对 z5 高精度瓦片 overzoom。文件数量下降主要来自高精度档停止继续切到 z6/z7/z8。
