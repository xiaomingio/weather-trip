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

## URL 与偏好状态

顶部导航由 Astro 在构建期输出静态 URL。工具 tab 指向对应语言下的工具入口，不携带当前 query；语言切换链接指向另一种语言的同一页面入口，也不携带当前 query。React island 只管理当前工具页自己的筛选 URL，不在运行时改写顶部 tab 或语言入口。

地区筛选的真源顺序为 URL、用户偏好、默认值。工具页初始化或浏览器历史切换时，如果当前 URL 里有合法 `region`，页面使用该地区并写入 `localStorage.weather-trip-region`；如果 URL 没有合法地区，页面读取 `localStorage.weather-trip-region`；两者都没有时使用 `world`。用户在地区下拉里选择地区时，也写入 `localStorage.weather-trip-region`。两个工具页共用这份最近地区，切换工具页后由目标页面自己从 `localStorage` 恢复。

每个工具页只把自己的筛选状态同步到当前 URL。Weather Map 的 URL 包含地区、日期和图层；City Finder 的 URL 包含地区、天数和筛选条件。工具页之间不保存完整 query 历史，工具 tab 也不把某个工具页的 query 带到另一个工具页。

语言的当前真源是静态路由和静态 HTML。英文页面使用 `/weather-map`、`/city-finder` 等入口，中文页面使用 `/zh/weather-map`、`/zh/city-finder` 等入口；页面自身的 `lang` 决定当前界面语言。`localStorage.weather-trip-locale` 只记录最近语言偏好，不决定当前页面语言。点击语言切换链接时，先保存目标语言，再按静态链接跳转到另一语言的同一页面入口。语言链接不携带当前筛选 query，地区由上面的地区偏好规则恢复。

温度单位只保存在 `localStorage.weather-trip-temp-unit`，取值为 `c` 或 `f`，默认 `c`；温度单位不进入 URL query。点击温度按钮时切换本地偏好、更新顶部按钮显示和 `aria-pressed`，并通过 `weather-trip-temp-unit-change` 事件通知 React 地图、列表和预报面板重新按当前单位格式化。跨浏览器标签页修改温度单位时，通过 `storage` 事件同步当前页面。

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
