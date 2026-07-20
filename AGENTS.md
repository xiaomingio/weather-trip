# Global Weather

## 项目入口

这是一个 `apps/web + apps/worker` 多运行单元项目。Web 使用 Astro + React 负责中英文工具页，Worker 使用 Node.js 负责初始化 Postgres 并每日刷新天气数据。

## 目录真源

```text
apps/web/       # Astro SSR 公开工具页，路由 /zh 和 /en
apps/worker/    # Worker 长驻入口，dev 走源码，start 走 dist
packages/       # 只有 Web 和 Worker 真实共享的类型、天气码和 DB 访问
data/           # 一次性导入 Postgres 的旧天气缓存输入
scripts/        # 仓库级编排、GeoNames 城市导入和一次性维护脚本
docs/           # 产品、运行拓扑和数据流文档
```

## 常用命令

```bash
npm install
npm run cities:import-geonames
npm run db:import-existing
npm run dev
npm run check
npm run build
```

## 数据边界

Postgres 是运行时数据真源。GeoNames 全球 cities 导出包只作为手动导入输入；Web 只读数据库里的公开天气快照；Worker 写入城市预报和刷新状态。一次性导入、backfill、手动修复等维护动作放在根 `scripts/`，不要放进 Worker app 的运行入口。

## Env

Env 分成根目录共享变量和 app 专属变量。根目录 `.env.development` 存放维护脚本、Web 和 Worker 通过根目录命令启动时共同使用的本地共享配置；app 目录里的 `.env.development` 存放端口、刷新间隔等 app 专属配置，或本地覆盖根目录同名变量。

```text
/.env.example
apps/web/.env.example
apps/worker/.env.example
```

真实 `.env.development` 和 `.env.production` 不提交。
