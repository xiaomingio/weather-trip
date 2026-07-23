# Pro Data Platform Plan

本文档记录 Weather Trip Pro 版的数据平台升级计划。Pro 版目标是支持至少 40,000 城市，并让 City Finder 的搜索、筛选、排序和分页由数据库完成，避免把大量数据和计算全部压到浏览器。

## 升级目标

Pro 版不再把所有城市和 14 天天气窗口一次性加载到前端。前端只提交筛选条件，后端 API 查询数据库并返回 Top N 结果、分页游标和选中城市详情。

```text
Cloudflare Pages
  -> 托管前端

R2
  -> 托管 Weather Map 静态 JSON、GeoJSON、forecast chunk 或导出文件

数据库
  -> 保存 40,000+ 城市、天气窗口、预计算聚合指标和 City Finder 查询索引

Worker / API
  -> 接收 City Finder 查询
  -> 查询数据库
  -> 返回分页结果和选中城市详情

GitHub Actions 或定时任务
  -> 每天刷新天气
  -> 写入数据库
  -> 生成或更新 R2 静态数据
```

## 为什么升级

免费版适合 2,000+ 城市，但 40,000+ 城市会让浏览器承担过多工作：

| 问题 | 免费版风险 | Pro 版处理 |
| --- | --- | --- |
| 全量下载 | `cities.json + weather-window.json` 体积增长 | 前端只请求查询结果 |
| JSON parse | 移动端解析和对象膨胀明显 | 后端数据库保存和查询 |
| 多维筛选 | 主线程 filter / sort 40,000 行可能卡顿 | SQL 索引和 Top N 查询 |
| 搜索 | 每次输入全量搜索城市 | 数据库搜索索引或服务端搜索 |
| 分页 | 前端持有全量结果 | 后端分页 |
| 后续功能 | 收藏、保存筛选、个性化需要状态 | 数据库天然承载用户和查询状态 |

## 数据存储

Pro 版至少需要三类数据。

```text
cities
  稳定城市主数据

daily_forecasts
  城市每日天气窗口

city_weather_scores
  面向 City Finder 的预计算聚合表
```

建议先把查询压力收敛到 `city_weather_scores`，让用户请求不在 14 天明细上现场做复杂聚合。

```ts
type CityRecord = {
  id: string;
  geonameId: number;
  nameEn: string;
  nameZh: string;
  countryCode: string;
  admin1Code: string | null;
  admin1NameEn: string | null;
  admin1NameZh: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  population: number | null;
  elevationM: number;
  region: string;
  rank: number;
  searchableText: string; // 归一化搜索文本
  updatedAt: string;
};

type DailyForecastRecord = {
  cityId: string;
  date: string;
  weatherCode: number;
  weatherType: string;
  temperatureMinC: number;
  temperatureMaxC: number;
  temperatureMeanC: number;
  humidityMeanPercent: number;
  precipitationProbabilityMax: number | null;
  precipitationSumMm: number;
  windSpeedMaxKmh: number | null;
  comfortScore: number;
  updatedAt: string;
};

type CityWeatherScoreRecord = {
  cityId: string;
  windowStartDate: string;
  windowDays: number; // 3 / 5 / 7 / 10 / 14 可以预计算多行，或保存 14 天派生数组
  countryCode: string;
  admin1Code: string | null;
  region: string;
  elevationM: number;
  population: number | null;
  avgTemperatureC: number;
  minTemperatureC: number;
  maxTemperatureC: number;
  avgHumidityPercent: number;
  avgPrecipitationMm: number;
  rainDays: number;
  sunnyDays: number;
  snowDays: number;
  avgWindSpeedKmh: number;
  maxWindSpeedKmh: number;
  avgComfortScore: number;
  bestDryStreakDays: number;
  bestComfortStreakDays: number;
  updatedAt: string;
};
```

## City Finder 查询

前端提交筛选条件，后端返回排序后的轻量结果。

```ts
type CityFinderQuery = {
  locale: 'en' | 'zh';
  region?: string;
  countryCode?: string;
  admin1Code?: string;
  keyword?: string;
  days: 3 | 5 | 7 | 10 | 14;
  temperatureMinC?: number;
  temperatureMaxC?: number;
  humidityMinPercent?: number;
  humidityMaxPercent?: number;
  precipitationMaxMm?: number;
  windSpeedMaxKmh?: number;
  elevationMinM?: number;
  elevationMaxM?: number;
  weatherTypes?: string[];
  limit: number;
  cursor?: string;
};

type CityFinderQueryResult = {
  items: CityFinderResultItem[];
  totalEstimate: number;
  nextCursor: string | null;
  queryVersion: string;
};

type CityFinderResultItem = {
  cityId: string;
  name: string;
  countryCode: string;
  admin1Name?: string;
  latitude: number;
  longitude: number;
  score: number;
  matchDays: number;
  totalDays: number;
  averageTemperatureC: number;
  rainDays: number;
  bestStreakDays: number;
  weatherType: string;
};
```

查询示例：

```sql
select
  city_weather_scores.city_id,
  city_weather_scores.avg_temperature_c,
  city_weather_scores.rain_days,
  city_weather_scores.avg_comfort_score
from city_weather_scores
inner join cities on cities.id = city_weather_scores.city_id
where city_weather_scores.window_days = $1
  and ($2::text is null or city_weather_scores.country_code = $2)
  and city_weather_scores.avg_temperature_c between $3 and $4
  and city_weather_scores.rain_days <= $5
order by city_weather_scores.avg_comfort_score desc, cities.population desc nulls last
limit $6;
```

## 索引方向

Pro 版查询对象是 40,000 城市，不是百万级数据。第一版索引保持直接，不提前设计复杂搜索系统。

| 查询维度 | 索引方向 |
| --- | --- |
| `windowDays` | 放在组合索引前缀 |
| `countryCode` / `admin1Code` / `region` | 用于地区收窄 |
| 温度、降雨、湿度、风速、海拔 | 用于范围过滤 |
| `avgComfortScore` / `population` / `rank` | 用于排序 |
| `searchableText` | Postgres 可用 trigram / full-text；D1 可先用规范化 LIKE 或 FTS 表 |

如果使用 Cloudflare D1，需要按 SQLite / FTS 能力设计；如果使用 Supabase / Neon Postgres，可以使用 Postgres full text、trigram、表达式索引和更成熟的查询分析工具。

## 平台选择

Pro 版可以有两个方向。

| 方案 | 适合情况 | 风险 |
| --- | --- | --- |
| Cloudflare Pages + Workers API + D1 + R2 | 希望保持 Cloudflare-native、低成本、数据量 40,000 级、查询简单 | D1 不是 Postgres；复杂 SQL、全文搜索和后台管理能力较弱 |
| Cloudflare Pages + R2 + Supabase Postgres | 需要标准 Postgres、Dashboard、手动修数据、后续用户系统或更复杂查询 | 免费额度和 egress 更紧；公开高流量要控制查询和缓存 |

Pro 版的默认优先级：

```text
如果只是 40,000 城市公开查询：优先 Cloudflare Workers API + D1 + R2
如果需要标准 Postgres、后台编辑、Auth 或复杂分析：评估 Supabase / Neon Postgres
```

## Weather Map 策略

Weather Map 可以继续使用静态 JSON。4 万城市时 World 不应强制展示全部城市，而是区分概览和详细视图。

```text
world-featured/<date>.json
  全球概览点位，只包含主要城市

countries/<countryCode>/<date>.json
  国家详细点位

regions/<region>/<date>.json
  大区视图，可选
```

用户在 World 搜索具体城市时，搜索结果由后端覆盖全量城市。如果城市不在 World 概览点位里，结果直接提供“打开国家地图”，点击后前端切换 region、加载对应国家 JSON、缩放并选中城市。

## 刷新流程

Pro 版每日刷新分成写数据库和生成 R2 视图两个阶段。

```text
refresh-weather
  -> 读取 cities
  -> 批量请求天气源
  -> upsert daily_forecasts

aggregate-city-weather
  -> 按 3 / 5 / 7 / 10 / 14 天窗口计算 city_weather_scores
  -> 更新查询索引字段

build-map-json
  -> 生成 world-featured 和国家视图 JSON
  -> 上传 R2

publish-manifest
  -> 更新当前数据版本
```

每个阶段要能独立重跑。刷新失败时保留上一版可用查询数据和 R2 manifest，不发布半成品版本。

## 迁移路径

从免费版升级到 Pro 版时，按下面顺序推进：

1. 保留 `cities.json` 生成器，把输出同时写入数据库 `cities`
2. 保留 R2 `weather-window.json`，新增数据库 `daily_forecasts`
3. 增加 `city_weather_scores` 聚合表
4. 新增 City Finder 查询 API，让前端可通过 feature flag 切换数据库结果
5. Weather Map 继续使用静态 JSON，先只调整 World / Country 数据分片
6. 稳定后移除前端全量 City Finder 计算路径

## 验收标准

| 能力 | 标准 |
| --- | --- |
| 城市规模 | 至少 40,000 城市可刷新、查询和分页 |
| City Finder | 多维筛选由数据库完成，前端不下载全量天气窗口 |
| 搜索 | 全量城市可搜；World 概览未展示的城市能跳转国家地图 |
| Weather Map | World 首屏只加载概览点位，国家视图按需加载 |
| 刷新 | 每日刷新失败不会污染当前可用版本 |
| 成本 | 平台读写、存储、请求和 egress 在目标免费或低成本额度内可解释 |
