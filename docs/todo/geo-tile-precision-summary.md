# Geo 边界精度优化小结

## 结论

地图放大后看到边界有明显方块感，主要原因是部分 fallback 边界在 GeoJSON 中间产物里只保留 `1` 位小数。`1` 位小数约等于 `0.1°`，纬向大约 `11km`，在地图 `z8` 下会非常明显。

当前 `admin2` 瓦片包实际只切到 `z5`，前端 `z6-z8` 使用 z5 瓦片 overzoom。这个策略控制了瓦片数量，但也意味着放大后不会获得更细一级的边界细节。

已采用的低成本优化是把 fallback 使用的 `country` / `admin1` GeoJSON 中间产物写出精度从 `1` 位小数提高到 `3` 位小数，瓦片切片策略保持不变。

## 生成精度

| 产物 | 优化后坐标精度 | 说明 |
| --- | ---: | --- |
| `data/generated/geo/country.geojson` | 3 位小数 | C1 国家在高 zoom detail 包里也会 fallback 使用它 |
| `data/generated/geo/c2_admin1.geojson` | 3 位小数 | C2 国家 detail fallback 使用 |
| `data/generated/geo/c3_admin1.geojson` | 3 位小数 | C3 国家没有 admin2 子区时 fallback 使用 |
| `data/generated/geo/c3_admin2/*.geojson` | 3 位小数 | C3 admin2 / boundary 细节 |

## 当前瓦片参数

| 包 | 实际切片 zoom | 显示 zoom | tolerance | 内容 |
| --- | --- | --- | ---: | --- |
| `country` | z1-z2 | z1-z2 | 8 | country |
| `admin1` | z3-z4 | z3-z4 | 4 | admin1 + country fallback |
| `admin2` | z5 | z5-z8 | 3 | admin2 / boundary + admin1 / country fallback |

公共参数：`extent=4096`，`buffer=64`，source layer 为 `weather_region`。

## 优化前基线

优化前工作区基线：

| 指标 | 数值 |
| --- | ---: |
| MVT 文件数 | 660 |
| MVT 原始体积 | 7.78 MB |

按包拆分：

| 包 | 文件数 | 原始体积 |
| --- | ---: | ---: |
| `country` | 16 | 1.14 MB |
| `admin1` | 190 | 3.10 MB |
| `admin2` | 454 | 3.54 MB |

## 已验证结果

在当前工作区重新跑 `npm run static:geo` 和 `npm run static:geo:tiles`，已把下面三类 GeoJSON 中间产物从 `1` 位小数刷新为 `3` 位小数：

- `country.geojson`
- `c2_admin1.geojson`
- `c3_admin1.geojson`

`c3_admin2/*.geojson` 原本就是 `3` 位小数，保持不变。

| 指标 | 结果 |
| --- | ---: |
| MVT 文件数 | 659 |
| MVT 原始体积 | 7.59 MB |

按包拆分：

| 包 | 文件数 | 原始体积 |
| --- | ---: | ---: |
| `country` | 16 | 1.14 MB |
| `admin1` | 190 | 2.94 MB |
| `admin2` | 453 | 3.52 MB |

这次生成没有看到体积膨胀，反而略小。原因可能是当前瓦片阶段的 `geojson-vt` 简化参数仍然主导最终几何复杂度，输入坐标从 1 位提高到 3 位并不会线性转化成 MVT 体积增长。

## 已采用改动

`scripts/lib/geo/static-geo-generation.ts` 已把下面三个包的写出精度设为 `3`：

- `country.geojson`
- `c2_admin1.geojson`
- `c3_admin1.geojson`

暂时不把边界提到 `4` 位小数，也不把 admin2 包切到 z6/z7。后者会明显增加瓦片文件数和请求对象数。当前更低成本的修复路径是先提高 fallback GeoJSON 精度，再继续使用现有 z5 overzoom 策略。

## 验证

已完成的验证：

- `npm run static:geo`
- `npm run static:geo:tiles`
- `npm run check`

如果仍有边界硬折线，再评估把 `admin2` 档 `tolerance` 从 `3` 调到 `2`，或把实际切片 zoom 从 z5 提到 z6。
