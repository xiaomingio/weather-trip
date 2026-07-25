# Weather Trip

[English](README.md) | 简体中文

[Weather Trip](https://weather-trip.aicake.io) 是一个用未来天气筛选旅行目的地的双语工具站。它帮助旅行者在决定目的地之前，按温度、降雨、湿度、天气类型、风速、海拔和舒适度信号比较全球城市。

## 产品介绍

Weather Trip 面向已经知道想要什么天气、但还没决定去哪座城市的用户。用户不需要逐个打开城市天气页，可以直接查看全球天气地图，按未来几天的天气条件筛选目的地，并在同一个界面里比较城市预报。

公开产品包含两个核心工具：

- [全球天气地图](https://weather-trip.aicake.io/zh/weather-map/)：按地区、国家和城市查看未来天气，并支持天气、气温、湿度、降水、风速、海拔和舒适度图层
- [城市查找](https://weather-trip.aicake.io/zh/city-finder/)：先设置想要的天气条件，再查找未来预报匹配的城市

Weather Trip 是公开数据产品。免费版刻意采用静态架构：公开页面读取城市索引、地图瓦片和天气包等静态文件；用户请求不连接运行时数据库，也不调用 Worker API。

## 线上地址

- 产品首页：[https://weather-trip.aicake.io](https://weather-trip.aicake.io)
- 英文天气地图：[https://weather-trip.aicake.io/weather-map/](https://weather-trip.aicake.io/weather-map/)
- 中文天气地图：[https://weather-trip.aicake.io/zh/weather-map/](https://weather-trip.aicake.io/zh/weather-map/)
- 城市查找：[https://weather-trip.aicake.io/zh/city-finder/](https://weather-trip.aicake.io/zh/city-finder/)

## 架构

```text
Astro static build -> Cloudflare Pages
城市索引 + 地图瓦片 -> 已提交的公开数据
weather/current.json + forecast package -> Cloudflare R2
每日刷新 -> GitHub Actions
```

仓库围绕静态生成和公开运行时资源组织：

```text
apps/web/       # Astro 静态公开工具页，英文默认 /，中文路由 /zh
packages/       # Web 共享类型、天气码和静态 Wire 解码
data/           # 离线来源、人工输入、生成产物和复核报告
scripts/        # 旅行目的地、国家分档、城市列表、地图边界和天气包生成脚本
docs/           # 产品、数据流、运行和发布文档
infra/          # 生产资源使用的 Cloudflare 配置
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

生产形态是 Cloudflare Pages 托管 `apps/web/dist`，Cloudflare R2 保存天气包，GitHub Actions 每日刷新。发布和回滚说明见 `docs/specs/50-launch.md`。

## License

项目代码采用 [GPL-3.0](./LICENSE) 开源。

`Weather Trip` 的名称、Logo 和域名不随代码授权。如果基于本项目 fork 或二次开发成自己的产品，请使用自己的名称、Logo 和域名，并注明项目来源，避免和本站混淆。
