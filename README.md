# Weather Trip

Weather Trip 是一个用未来天气筛选旅行目的地的双语工具站。Web 使用 Astro static build + React islands，公开页面读取静态 JSON、forecast package 和地图瓦片；用户请求不连接数据库，也不调用运行时 Worker API。

## 目录结构

```text
apps/web/       # Astro 静态公开工具页，英文默认 /，中文路由 /zh
packages/       # Web 共享类型、天气码和静态 Wire 解码
data/           # 离线来源、人工输入、生成产物和复核报告
scripts/        # 旅行目的地、国家分档、城市列表、地图边界和天气包生成脚本
docs/           # 产品、数据流、运行和发布文档
```

## 快速开始

```bash
npm install
npm run dev
```

本地开发会读取已提交的公开数据。真实 `.env.development` 和 `.env.production` 不提交，配置模板见 `.env.example` 和 `apps/web/.env.example`。

## 常用命令

```bash
npm run check
npm run build
npm run static:tourism
npm run static:country-tier-candidates
npm run static:profiles
npm run static:cities
npm run static:geo
npm run static:geo:tiles
```

低频变化的国家分档、城市索引和地图边界由对应 `static:*` 脚本生成，结果提交到 Git。完整数据目录和脚本流向见 `docs/specs/31-data-flow.md`。

天气是每日刷新数据，使用独立脚本。需要为当前城市列表拉取 Open-Meteo 天气时运行：

```bash
npm run weather:refresh -- --source=open-meteo
```

生产形态是 Cloudflare Pages 托管 `apps/web/dist`，GitHub Actions 每日刷新天气包并上传 Cloudflare R2。发布和回滚说明见 `docs/specs/50-launch.md`。

## License

项目代码采用 [GPL-3.0](./LICENSE) 开源。

`Weather Trip` 的名称、Logo 和域名不随代码授权。如果基于本项目 fork 或二次开发成自己的产品，请使用自己的名称、Logo 和域名，并注明项目来源，避免和本站混淆。
