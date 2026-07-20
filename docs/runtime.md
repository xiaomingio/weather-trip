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

Worker 只有 `dev` 和 `start` 两个运行入口。两个入口都会进入同一个调度启动模块，启动时初始化 Postgres Schema，然后执行一次天气刷新，并按 `WEATHER_REFRESH_INTERVAL_HOURS` 间隔继续刷新。

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

Env 分成仓库共享变量和 app 专属变量。根目录 `.env.development` 是本地共享开发 env，维护脚本、Web 和 Worker 通过根目录命令启动时都会读取它；app 目录里的 `.env.development` 用于端口、刷新间隔等 app 专属配置，或在本地覆盖根目录同名变量。

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

Worker 不对外提供 HTTP 服务，目前只需要 `DATABASE_URL` 和刷新间隔。
