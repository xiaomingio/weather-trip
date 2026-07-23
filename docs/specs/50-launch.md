# 发布

## 生产形态

Weather Trip 按静态站点和静态公开数据发布。数据来源和生成链路见 `docs/specs/31-data-flow.md`；公开数据分块、请求路径和缓存策略见 `docs/specs/32-public-data-contract.md`。

```text
Astro static build -> Cloudflare Pages
weather/current.json + forecast package -> Cloudflare R2
daily refresh -> GitHub Actions
```

公开用户请求不经过 Pages Functions、Workers API 或运行时数据库。

## 运行真源

| 对象 | 真源 |
| --- | --- |
| Web 静态构建 | `apps/web/astro.config.mjs`、`npm run build` |
| 城市静态数据 | `scripts/generate-static-cities.ts`、`data/generated/city-selection-report.*` |
| 天气刷新 | `.github/workflows/refresh-weather.yml`、`scripts/generate-static-weather.ts` |
| Web env 模板 | `apps/web/.env.example` |
| 数据流 | `docs/specs/31-data-flow.md` |
| 公开数据契约 | `docs/specs/32-public-data-contract.md` |

## 生产集成

| 集成 | 配置 |
| --- | --- |
| Cloudflare Pages | 托管 `apps/web/dist` 静态产物 |
| Cloudflare R2 | 保存 `weather/current.json` 和 `weather/forecast-14d/<date>.json` |
| GitHub Actions | 每日刷新 Open-Meteo 天气包并上传 R2 |
| Umami | 公开页面在设置 `UMAMI_WEBSITE_ID` 后加载统计脚本 |
| Search Console | 通过 `sitemap.xml` 验证公开页面 |

R2 上传凭据由 GitHub Actions repo secrets 提供：

```text
CLOUDFLARE_ACCOUNT_ID
R2_BUCKET_NAME
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
```

## 回滚

代码版本以 Git 为真源；Pages 回滚使用 Cloudflare Pages 的 deployment rollback。

天气数据回滚和代码回滚分开处理。R2 中 `weather/current.json` 指向活跃 forecast；如果新 forecast 失败，workflow 不应覆盖 current。需要回滚天气时，把 `weather/current.json` 改回上一版可用 forecast 路径。

上线后复验：

1. 首页、中文首页、两个工具页能打开。
2. CSS、JS、`/data/cities.json` 和 GeoJSON MIME type 正确。
3. R2 `weather/current.json` 可读，并且 `current.f` 指向的 forecast 可读。
4. City Finder 和 Weather Map 能完成地区切换、筛选、城市搜索、日期切换和城市详情展示。
5. `robots.txt`、`sitemap.xml` 和 `llms.txt` 输出正确。
