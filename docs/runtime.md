# Runtime

## 运行单元

```text
apps/web
  Astro SSR + React islands
  dev   -> Astro 源码开发入口
  start -> dist/server/entry.mjs

apps/worker
  Node.js TypeScript Worker
  dev   -> tsx watch src/scheduler.ts
  start -> node dist/scheduler.js
```

Worker 只有 `dev` 和 `start` 两个运行入口。两个入口都会进入同一个调度启动模块，启动时初始化 Postgres Schema，然后检查一次天气刷新状态；如果最近一次成功刷新距今不到 12 小时且未来天气窗口完整，本次会跳过。之后 Worker 按 `WEATHER_REFRESH_TIME` 和 `WEATHER_REFRESH_TIMEZONE` 指定的每日本地时间继续检查，默认是每天 `09:00 UTC`。

## 仓库脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 并发启动 Web 和 Worker 源码入口 |
| `npm run build` | 先构建 packages，再构建 Worker 和 Web |
| `npm run start` | 并发启动 Web 和 Worker 的 dist 入口 |
| `npm run check` | 构建共享包、类型检查、架构检查和测试 |
| `npm run cities:import-geonames` | 手动同步 GeoNames 全球城市到 Postgres |
| `npm run db:import-existing` | 一次性把 `data/*.json` 导入 Postgres，减少初次天气 API 调用 |

`cities:import-geonames` 和 `db:import-existing` 都是维护脚本，不是 Worker app 的运行入口。

## Env

Env 分成仓库共享变量和 app 专属变量。根目录 `.env.development` 是本地共享开发 env，维护脚本、Web 和 Worker 通过根目录命令启动时都会读取它；app 目录里的 `.env.development` 用于端口、每日刷新时间等 app 专属配置，或在本地覆盖根目录同名变量。

```text
/.env.example
/.env.development

apps/web/.env.example
apps/web/.env.development
apps/web/.env.production

apps/worker/.env.example
apps/worker/.env.development
apps/worker/.env.production
```

真实 `.env.development` 和 `.env.production` 不提交。环境变量优先级为：命令行已经注入的 `process.env` 最高，app `.env.development` 次之，根目录 `.env.development` 作为本地共享默认值。`cities:import-geonames` 和 `db:import-existing` 读取根目录 `.env.development`，因此本地数据库连接应该优先写在根目录 `.env.development`；如果直接进入 app 目录运行 workspace 子命令，则由调用进程或部署平台注入 `DATABASE_URL`。

## 端口

Web 默认读取：

```dotenv
WEB_HOST=127.0.0.1
WEB_PORT=3000
```

Web 和 Worker 在生产环境会作为独立 PM2 进程启动，因此各自的 `apps/<app>/.env.production` 都需要包含运行时数据库连接；Web 另外需要公开正式 URL 生成 canonical、sitemap、robots 和 `llms.txt`；Worker 另外需要每日刷新时间配置。Worker 不对外提供 HTTP 服务。

```dotenv
DATABASE_URL=
SITE_URL=https://weather-trip.aicake.io
WEATHER_REFRESH_TIME=09:00
WEATHER_REFRESH_TIMEZONE=UTC
```

生产 PM2 拓扑由根目录 `ecosystem.config.cjs` 维护。Web 进程内存重启阈值为 `384M`；Worker 启动时会扫描城市和未来天气窗口来判断是否需要刷新，当前部署在默认美国 4G 主机上使用 `768M` 作为内存重启阈值，避免缓存检查期间被 PM2 误重启，同时仍保留异常内存增长的自动恢复边界。

### 刷新时间取舍

当前主要用户假设覆盖中国和美国，但这两个区域的夜间没有单一重叠时间：北京时间凌晨通常对应美国前一天下午或中午，美国凌晨通常对应中国下午到傍晚。因此默认刷新时间选为 `09:00 UTC`，让美国大陆多数时区处于凌晨到清晨，同时让中国侧落在傍晚的固定窗口。这个时间不是写死的业务规则，生产环境可通过 `WEATHER_REFRESH_TIME` 和 `WEATHER_REFRESH_TIMEZONE` 调整。
