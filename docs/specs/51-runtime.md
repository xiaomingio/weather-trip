# Runtime

## 运行单元

```text
apps/web
  Astro static build + React islands
  dev   -> Astro 源码开发入口，读取 apps/web/public/data/*
  build -> 静态 HTML / CSS / JS / public data
  start -> astro preview 预览 dist
```

运行时没有长期 Worker 进程、请求时 API 或数据库。城市和地图边界由 `npm run static:data` 构建并提交到 Git；天气刷新由独立脚本生成 R2 对象，本地需要天气数据时单独运行 `npm run weather:refresh -- --source=open-meteo`。

## 页面运行边界

顶部导航由 Astro 在构建期输出静态入口；React island 只管理当前工具页自己的筛选 URL 和工作区状态。固定 Tab URL、语言切换、温度单位、本地偏好和工具状态恢复规则见 `docs/specs/20-interaction-logic.md`。

## 仓库脚本

| 命令 | 说明 |
| --- | --- |
| `npm run static:data` | 构建国家分档、城市 Wire、GeoJSON 边界中间产物、三档 MVT 地图瓦片和筛选报告 |
| `npm run static:profiles` | 从 GeoNames、覆盖规则和旅游种子生成 `country-admin-stats.json`、`country-profiles.json` 和分档报告 |
| `npm run static:cities` | 先生成 profiles，再从 GeoNames 和旅游种子生成 `data/generated/cities.json`、公开 `cities.json` 和筛选报告 |
| `npm run static:geo` | 从 Natural Earth、geoBoundaries、DataV/高德（Amap）raw 生成标准化边界中间产物和边界报告，供 `static:geo:tiles` 切成前端运行时 MVT |
| `npm run static:geo:tiles` | 从现有 GeoJSON 边界中间产物生成 `geo/region-tiles/{country,admin1,admin2}/{z}/{x}/{y}.mvt` 和瓦片报告 |
| `npm run weather:refresh` | 刷新每日天气 current 和 forecast 包，CI 使用 `--source=open-meteo` 上传 R2 |
| `npm run dev` | 启动 Web dev server，读取已提交或手动生成的 `apps/web/public/data/*` |
| `npm run build` | 构建 core、生成静态数据，再执行 Astro 静态构建 |
| `npm run start` | 预览 `apps/web/dist` |
| `npm run check` | 类型检查、架构检查和测试 |

CI 刷新天气时使用：

```bash
npx tsx scripts/generate-static-weather.ts \
  --source=open-meteo \
  --output-dir=.r2/weather \
  --forecast-name="$(date -u +%F).json" \
  --version-prefix=open-meteo
```

## Env

Env 分成仓库共享变量和 Web app 专属变量。根目录 `.env.development` 是仓库级脚本共享 env；`apps/web/.env.development` 是 Web dev/build/start 的 app env。

```text
/.env.example
/.env.development

apps/web/.env.example
apps/web/.env.development
apps/web/.env.production
```

真实 `.env.development` 和 `.env.production` 不提交。环境变量优先级为：命令行已经注入的 `process.env` 最高，app `.env.development` 次之，根目录 `.env.development` 作为本地共享默认值。

Web 默认读取：

```dotenv
WEB_HOST=127.0.0.1
WEB_PORT=3000
PUBLIC_STATIC_DATA_BASE_URL=/data
PUBLIC_R2_DATA_BASE_URL=
PUBLIC_GEO_VECTOR_BASE_URL=/data/geo/region-tiles
SITE_URL=https://weather-trip.aicake.io
```

本地开发不需要设置 `PUBLIC_R2_DATA_BASE_URL`。没有本地天气包时页面会显示数据加载状态；需要完整天气体验时先运行 `npm run weather:refresh -- --source=open-meteo`。生产 Pages 构建可设置 `PUBLIC_R2_DATA_BASE_URL` 指向 R2 custom domain。

GitHub Actions R2 上传需要 repo secrets：

```text
CLOUDFLARE_ACCOUNT_ID
R2_BUCKET_NAME
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```
