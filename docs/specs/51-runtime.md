# Runtime

## 运行单元

```text
apps/web
  Astro static build + React islands
  dev   -> Astro 源码开发入口，读取 apps/web/public/data/*
  build -> 静态 HTML / CSS / JS / public data
  start -> astro preview 预览 dist
```

运行时没有长期 Worker 进程、请求时 API 或数据库。城市、地图边界和天气数据刷新频率不同，分别由显式脚本生成；本地需要天气数据时单独运行 `npm run weather:refresh -- --source=open-meteo`。

## 页面运行边界

顶部导航由 Astro 在构建期输出静态入口；React island 只管理当前工具页自己的筛选 URL 和工作区状态。固定 Tab URL、语言切换、温度单位、本地偏好和工具状态恢复规则见 `docs/specs/20-interaction-logic.md`。

Weather Map 的底图、地区选项和 MVT 边界读取 `cities.json` 与 `/data/geo/region-tiles/*`，不以 `weather/current.json` 或 forecast bin 成功解码为前置条件。跨源对齐规则见 `docs/specs/31-data-flow.md`：行政区划、城市点位和天气包可能来自不同版本，运行时只在关联层降级。天气入口或 forecast bin 失效时，页面只把天气点位、天气图层、天气列表和单城市预报置为空或错误状态；地图边界仍继续显示，地区选择仍基于城市索引工作。City Finder 是天气筛选工具，天气快照不可用时可以进入错误 / 空状态。

## 仓库脚本

| 命令 | 说明 |
| --- | --- |
| `npm run static:profiles` | 从 GeoNames、覆盖规则和旅游种子生成 `country-admin-stats.jsonl`、`country-profiles.jsonl` 和分档报告 |
| `npm run static:cities` | 先生成 profiles，再从 GeoNames 和旅游种子生成 `data/generated/cities/*.jsonl` 中间表、公开 `cities.json` 和筛选报告 |
| `npm run static:geo` | 从 Natural Earth、geoBoundaries、DataV/高德（Amap）raw 生成标准化边界中间产物和边界报告，供 `static:geo:tiles` 切成前端运行时 MVT |
| `npm run static:geo:tiles` | 从现有 GeoJSON 边界中间产物生成 `geo/region-tiles/{country,admin1,admin2}/{z}/{x}/{y}.mvt` 和瓦片报告 |
| `npm run weather:refresh` | 刷新每日天气 current 和 forecast 包，CI 使用 `--source=open-meteo` 上传 R2 |
| `npm run dev` | 启动 Web dev server，读取已提交或手动生成的 `apps/web/public/data/*` |
| `npm run build` | 构建 core，再执行 Astro 静态构建；不生成城市、Geo 或天气 data |
| `npm run start` | 预览 `apps/web/dist` |
| `npm run check` | 类型检查、架构检查和测试 |

CI 刷新天气时使用：

```bash
npx tsx scripts/generate-static-weather.ts \
  --source=open-meteo \
  --output-dir=.r2/weather \
  --forecast-name="$(date -u +%F).bin" \
  --version-prefix=open-meteo
```

## Env 与公开配置

| 真源 | 用途 |
| --- | --- |
| `apps/web/src/domain/site-config.ts` | 正式域名、Umami、静态数据路径、生产天气 R2 公开读域名；随 Git 进入构建产物 |
| `apps/web/.env.development` | 本机 Web 端口等可选覆盖；`scripts/dev.mjs` / `start.mjs` 加载 |
| 根目录 `.env.development` | 仓库级脚本共享默认值 |
| GitHub Actions secrets | 天气刷新上传 R2 的写密钥 |

```text
/.env.example
/.env.development

apps/web/.env.example
apps/web/.env.development
apps/web/src/domain/site-config.ts
```

真实 `.env.development` 不提交。当前静态公开站不使用 `apps/web/.env.production`：生产构建由 Cloudflare Pages 读仓库代码，公开配置不靠本机 production env。

本地编排只合并根与 app 的 `.env.development`；命令行已注入的 `process.env` 优先。本机开发时天气默认读 `/data`；没有本地天气包时可先 `npm run weather:refresh -- --source=open-meteo`。生产构建时 `site-config` 指向 R2 公开域名。

GitHub Actions R2 上传需要 repo secrets：

```text
CLOUDFLARE_ACCOUNT_ID
R2_BUCKET_NAME
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```
