# 发布

## 生产环境

Weather Trip 已发布到 `https://weather-trip.aicake.io`。

生产流量先经过 Cloudflare DNS 和代理，再到默认美国 4G 主机上的 Caddy。Caddy 反向代理到 Astro SSR Web 进程 `127.0.0.1:3020`；Worker 是独立 PM2 进程，不对外提供 HTTP 服务。

## 运行真源

| 对象 | 真源 |
| --- | --- |
| 发布文件和目标主机 | `tinyship.config.yml` |
| PM2 进程拓扑 | `ecosystem.config.cjs` |
| 运行时 env 模板 | `.env.example`、`apps/web/.env.example`、`apps/worker/.env.example` |
| 生产运行时 env | 发布源机器上被 Git 忽略的 `.env.production` 文件 |
| 天气刷新策略 | `docs/runtime.md` |

## 生产集成

| 集成 | 当前配置 |
| --- | --- |
| Cloudflare DNS | `weather-trip.aicake.io` 的 A 记录指向源站主机，并开启 Cloudflare 代理 |
| Cloudflare SSL/TLS | Zone SSL 模式为 `strict`，源站也有 Caddy 管理的有效证书 |
| Umami | 公开页面在设置 `UMAMI_WEBSITE_ID` 后加载 `https://stats.aicake.io/script.js` |
| Search Console | 已验证 `sc-domain:weather-trip.aicake.io`，并提交 `https://weather-trip.aicake.io/sitemap.xml` |

## 回滚

代码版本以 Git 为真源，发布动作使用 TinyShip。

1. 从 `git log` 里选择上一个确认可用的 commit。
2. 在本地 checkout 或 revert 到该 commit。
3. 运行 `npm run check`、`npm run build`、`npm run deploy:validate` 和 `npm run deploy:dry-run`。
4. 使用 `npm run deploy -- all` 发布。
5. 复验 `https://weather-trip.aicake.io/`、两个工具页、dashboard API、`robots.txt`、`sitemap.xml` 和 Worker 的 PM2 日志。

数据回滚和代码回滚分开处理。Weather Trip 生产数据位于 Postgres 数据库 `weather_trip`；除非失败发布改变了数据结构或污染了数据，否则不要在代码回滚时恢复或修改生产数据。
