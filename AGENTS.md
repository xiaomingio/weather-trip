# Weather Trip

## 项目入口

这是一个静态公开数据版项目。Web 使用 Astro static build + React islands 负责中英文工具页；公开城市索引、天气包和地图边界通过静态 JSON 读取，不在用户请求时连接数据库或调用 Worker API。

## 目录真源

```text
apps/web/       # Astro 静态公开工具页，英文默认 /，中文路由 /zh
packages/       # Web 真实共享的类型、天气码和静态 Wire 解码
data/           # 离线输入、生成产物和城市筛选复盘报告
scripts/        # 仓库级编排、静态城市生成和天气包生成脚本
docs/           # 产品、运行拓扑、数据流和方案文档
```

## 常用命令

```bash
npm install
npm run dev
npm run check
npm run build
```

## 数据边界

运行时数据真源是静态 JSON、forecast bin 和 MVT。城市、Geo 和天气数据刷新频率不同，不提供也不使用 `static:data` 这种全量聚合入口；`npm run build` 只构建 core 和 Web，不生成或刷新任何 data 产物。

| 数据域 | 显式入口 | 主要输入 | 主要输出 | 边界 |
| --- | --- | --- | --- | --- |
| 旅游目的地 raw | `npm run tourism:raw` | 外部旅行目的地来源 | `data/raw/tourism-destinations/` | 原始快照，不手工修改 |
| 旅游目的地生成 | `npm run static:tourism` | raw 旅行快照、`data/input/tourism-destination-overrides.yml`、GeoNames | `data/generated/tourism-destinations.json`、`tourism-destination-report.*` | 供国家分档和城市生成消费 |
| 国家分档候选 | `npm run static:country-tier-candidates` | GeoNames、`data/input/coverage-rules.yml`、admin2 input、旅游目的地 | `data/generated/country-admin-stats.json`、`country-tier-candidate-report.*` | 只生成候选和复核报告；人工确认写入 `data/input/country-tier-countries.yml` |
| 国家分档 | `npm run static:profiles` | `data/input/country-tier-countries.yml`、旅游目的地 | `data/generated/country-profiles.json`、`country-profile-report.*` | 城市覆盖等级真源 |
| 城市索引 | `npm run static:cities` | country profiles、旅游目的地、GeoNames、admin2 input | `data/generated/cities.json`、`apps/web/public/data/cities.json`、`city-selection-report.*` | 前端地区选项、城市列表和天气 join 的城市真源 |
| Geo 边界中间产物 | `npm run static:geo` | 边界 raw、城市索引、country profiles、边界补名 input、admin2 input | `data/generated/geo/*`、`geo-boundary-report.*` | 只处理地图边界，不刷新城市或天气 |
| Geo 瓦片 | `npm run static:geo:tiles` | `data/generated/geo/*` | `apps/web/public/data/geo/region-tiles/{country,admin1,admin2}/{z}/{x}/{y}.mvt`、瓦片报告 | Weather Map 运行时读取的 MVT |
| 天气包 | `npm run weather:refresh -- --source=open-meteo` | `apps/web/public/data/cities.json`、Open-Meteo | `apps/web/public/data/weather/current.json`、`apps/web/public/data/weather/forecast-14d/*.bin`；CI 生成 R2 上传目录 | 每日刷新；不生成城市和 Geo |

Weather Map 的地图底图、地区选项和 MVT 边界不能依赖天气包成功加载。`weather/current.json` 或 forecast bin 失效时，只允许天气点位、天气图层、天气列表和单城市预报进入错误 / 空状态；地图边界仍应基于 `cities.json` 和 MVT 正常显示。

前端只依赖 `WeatherDataSource` 返回的应用快照；UI 组件不直接访问 Wire 短字段，也不关心数据来自本地 `/data`、R2 还是未来 Pro API。

## Env

Env 分成根目录共享变量和 Web app 专属变量。根目录 `.env.development` 存放仓库级脚本共享配置；`apps/web/.env.development` 存放端口、公开数据 base URL、站点 URL 和统计配置。

```text
/.env.example
apps/web/.env.example
```

真实 `.env.development` 和 `.env.production` 不提交。
