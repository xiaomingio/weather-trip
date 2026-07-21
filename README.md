# Weather Trip

Weather Trip 用天气、温度、降雨、湿度和海拔帮助用户寻找旅行目的地。公开工具页使用 Astro + React，独立 Node.js Worker 负责把天气预报刷新到 Postgres。

## 目录结构

```text
apps/web       # Astro SSR 公开应用，英文默认 /，中文路由 /zh
apps/worker    # Node.js Worker，数据库初始化和定时天气刷新
packages/weather-core
packages/weather-db
data/          # 一次性导入的旧天气缓存输入
docs/
scripts/
```

生产发布和回滚说明见 `docs/launch.md`。

## 常用命令

```bash
npm install
npm run cities:import-geonames
npm run db:import-existing
npm run dev
npm run build
npm run start
npm run check
```

通过根目录命令运行维护脚本或本地应用前，复制 `.env.example` 为 `.env.development`，并在其中设置 `DATABASE_URL`。app 级 `.env.development` 只用于端口、Worker 每日刷新时间等 app 专属覆盖项。
