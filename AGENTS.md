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
npm run static:data
npm run dev
npm run check
npm run build
```

## 数据边界

运行时数据真源是静态 JSON。`scripts/extract-tourism-destinations.ts` 抽取 `data/raw/tourism-destinations/` 原始旅行目的地数据；`scripts/generate-tourism-destinations.ts` 从 raw 旅行目的地、`data/input/tourism-destination-overrides.yml` 和 GeoNames 生成 `data/generated/tourism-destinations.json` 与 `tourism-destination-report.*`；`scripts/generate-country-tier-candidates.ts` 从 GeoNames、`data/input/coverage-rules.yml`、admin2 input 和生成后的旅游目的地输入生成 `data/generated/country-admin-stats.json` 与 `country-tier-candidate-report.*`；人工复核后维护 `data/input/country-tier-countries.yml`；`scripts/generate-country-profiles.ts` 生成最终 `data/generated/country-profiles.json` 和 `country-profile-report.*`；`scripts/generate-static-cities.ts` 消费生成后的 profiles 和旅游目的地输入，输出 `data/generated/cities.json`、`apps/web/public/data/cities.json` 和 `city-selection-report.*`；`scripts/generate-static-geo.ts` 输出 `apps/web/public/data/geo/world.geojson`、选中地区轮廓包 `apps/web/public/data/geo/region-outlines.geojson` 和 C3 国家详情包 `apps/web/public/data/geo/countries/<country>.geojson`，GeoJSON 只保存 `regionKey` 与 geometry，展示名留在城市/地区数据包。`scripts/generate-static-weather.ts` 是独立天气刷新脚本，CI 用 `--source=open-meteo` 生成 R2 上传目录。

前端只依赖 `WeatherDataSource` 返回的应用快照；UI 组件不直接访问 Wire 短字段，也不关心数据来自本地 `/data`、R2 还是未来 Pro API。

## Env

Env 分成根目录共享变量和 Web app 专属变量。根目录 `.env.development` 存放仓库级脚本共享配置；`apps/web/.env.development` 存放端口、公开数据 base URL、站点 URL 和统计配置。

```text
/.env.example
apps/web/.env.example
```

真实 `.env.development` 和 `.env.production` 不提交。
