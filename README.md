# Weather Trip

Weather Trip 用天气、温度、降雨、湿度和海拔帮助用户寻找旅行目的地。Web 是 Astro static build + React islands：公开页面读取静态 JSON，不在用户请求时连接数据库或调用 Worker API。

## 目录结构

```text
apps/web/       # Astro 静态公开工具页，英文默认 /，中文路由 /zh
packages/       # Web 共享类型、天气码和静态 Wire 解码
data/           # 离线来源、人工输入、生成产物和复核报告
scripts/        # 旅行目的地、国家分档、城市列表、地图边界和天气包生成脚本
docs/           # 产品、数据流、运行和发布文档
```

## 常用命令

```bash
npm install
npm run static:data
npm run dev
npm run check
npm run build
```

`npm run static:data` 构建低频变化的国家分档、城市索引和地图边界，结果提交到 Git。`npm run static:country-tier-candidates` 从 GeoNames、国家分档规则、旅游目的地和 admin2 input 生成 C2/C3 候选报告；人工复核后维护 `data/input/country-tier-countries.yml`；`npm run static:profiles` 再生成最终国家分档报告和 `data/generated/country-profiles.json`。`npm run static:cities` 会先生成 profiles，再生成 `data/generated/cities.json`、`data/report/city-selection-report.md` 和 Web 本地公开的 `apps/web/public/data/cities.json`。`npm run static:geo` 从 profiles、GeoNames 行政区、边界 raw 和边界 input 生成 `data/generated/geo/{country,c2_admin1,c3_admin1}.geojson` 与 `data/generated/geo/c3_admin2/*.geojson`；`npm run static:geo:tiles` 再生成前端读取的 `/data/geo/region-tiles/*` MVT。完整数据目录和脚本流向见 `docs/specs/31-data-flow.md`。

天气是每日刷新数据，使用独立脚本。需要为当前城市列表拉取 Open-Meteo 天气时运行：

```bash
npm run weather:refresh -- --source=open-meteo
```

生产发布和回滚说明见 `docs/specs/50-launch.md`。
