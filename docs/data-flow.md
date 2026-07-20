# Data Flow

## 数据真源

Postgres 是运行时数据真源。城市主数据由 GeoNames 全球 cities 导出包同步到数据库；仓库里的 `data/cities.json` 和 `data/forecasts.json` 只作为一次性导入旧缓存的输入，用于把已有天气缓存写入数据库，避免重新调用 Open-Meteo。

```text
GeoNames cities1000.zip
  -> npm run cities:import-geonames
  -> Postgres geo_names_cities
  -> Postgres cities

data/*.json
  -> npm run db:import-existing
  -> Postgres daily_forecasts
```

导入完成后，Web 和 Worker 都通过数据库协作。

## 表结构

当前 Schema 由 `packages/weather-db/src/schema.ts` 定义：

```text
geo_names_cities   # GeoNames cities dump 原始城市行，字段尽量按官方列映射
geo_names_admin1   # GeoNames admin1CodesASCII 原始一阶行政区
geo_names_admin2   # GeoNames admin2Codes 原始二阶行政区
geo_names_alternate_names # GeoNames alternateNamesV2 中当前系统需要的中文名称
cities             # 系统关注的代表城市集合，id 指向 geo_names_cities.id
daily_forecasts    # 城市每日天气缓存，主键 city_id + date，city_id 指向 cities.id
refresh_status     # 全局刷新动作的最近成功/完成/错误状态
```

项目仍在初期开发阶段，Schema 文件表达当前最终结构，不维护历史迁移链。

`geo_names_cities` 保留内部 `id = geonames-{geoname_id}` 供天气缓存引用，同时单独保存 GeoNames 原始 `geoname_id`。城市和行政区英文使用 GeoNames `ascii_name`；中文从 `geo_names_alternate_names` 按 `zh` / `zh-CN` / `zh-Hans` / `zh-Hant` 语言码读取，没有中文名时回退到英文。

`cities` 从 `geo_names_cities` 和旅游目的地种子聚合生成，只保存当前系统关注的城市及选择原因。城市筛选规则以 `docs/city-selection.md` 为真源；目标是覆盖全球旅行目的地，而不是覆盖所有行政中心。

## 刷新链路

```text
apps/worker
  -> 读取 cities 和 daily_forecasts
  -> 计算未来 14 天缺失的 city/date
  -> 只请求缺失城市批次
  -> upsert daily_forecasts
  -> 更新 refresh_status
```

Worker 不重复请求数据库里已有的城市日期，减少 Open-Meteo API 调用。刷新失败时保留已有可用预报，只更新刷新状态里的错误摘要。

## 城市维护

GeoNames 官方导出包是城市维护输入，不是运行时依赖。需要刷新全球城市列表时，手动运行根脚本：

```bash
npm run cities:import-geonames
```

脚本会读取 GeoNames `cities1000.zip`、`countryInfo.txt`、`admin1CodesASCII.txt`、`admin2Codes.txt` 和 `alternateNamesV2.zip`，初始化数据库 Schema，把全球城市、行政区和中文名称同步到 GeoNames 原始表，并重算 `cities` 代表城市集合。GeoNames 的 `modifications-YYYY-MM-DD.txt` 和 `deletes-YYYY-MM-DD.txt` 可用于后续扩展增量同步；当前项目先保留手动全量同步脚本。

## 公开读取

```text
apps/web Astro page
  -> readWeatherSnapshot()
  -> React WeatherDashboard
```

Web 只读已落库数据。`readWeatherSnapshot()` 只返回 `cities` 中已有天气缓存的城市，避免全球原始城市池被整表序列化到页面。公开页面不直接调用 Open-Meteo，不暴露数据库连接、刷新错误堆栈或内部调度状态。
