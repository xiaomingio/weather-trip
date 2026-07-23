# Free Static Data Plan

本文档记录 Weather Trip 免费版的数据托管和 JSON 拆分方案。免费版目标是覆盖当前 2,000+ 城市，用 Cloudflare Pages + GitHub Actions + R2 提供公开工具页，不在用户请求时依赖数据库、Worker API 或自建后端。

## 目标

免费版优先保证实现简单、免费额度友好、首屏稳定和后续可迁移。当前城市规模较小，Weather Map 和 City Finder 都使用全量城市数据，由浏览器完成地区筛选、城市搜索、天气筛选、排序和选中城市详情展示。

```text
Cloudflare Pages
  -> 托管前端 HTML / CSS / JS

data/generated/cities.json
  -> 低频生成，提交进 Git，随 Pages 构建发布

GitHub Actions
  -> 每天读取 cities.json
  -> 调 Open-Meteo 刷新未来 14 天天气
  -> 生成 weather-window.json
  -> 上传 Cloudflare R2

浏览器
  -> 读取 cities.json + weather-window.json
  -> 本地完成 Weather Map 和 City Finder 的查询逻辑
```

## 数据真源

城市列表和天气窗口分开管理。

| 数据 | 真源 | 更新频率 | 是否提交 Git | 承载 |
| --- | --- | --- | --- | --- |
| 城市选择输入 | GeoNames 导出包、`data/city-selection/country-profiles.json`、`data/city-selection/tourism-destinations.json` | 手动低频 | 是 | 仓库源码 |
| 最终城市列表 | `data/generated/cities.json` | 手动低频 | 是 | Pages 静态资源 |
| 天气窗口 | Open-Meteo Forecast API | 每天 | 否 | R2 JSON |
| 页面代码 | Astro + React | 按发布节奏 | 是 | Cloudflare Pages |

城市列表是免费版公开数据的一部分，允许提交到仓库。天气窗口每天变化，不提交源码分支，避免 Git 因数据刷新产生每日变更。

## 城市列表生成

当前项目已有城市选择逻辑，但实现依赖 Postgres SQL。免费版迁移时需要把这段逻辑改造成本地生成器，例如：

```text
scripts/generate-static-cities.ts
  -> 下载或读取 GeoNames cities1000.zip、countryInfo.txt、admin1CodesASCII.txt、admin2Codes.txt、alternateNamesV2.zip
  -> 读取 data/city-selection/*.json
  -> 按现有选择规则生成 focused cities
  -> 输出 data/generated/cities.json
```

选择规则继续沿用当前产品逻辑：

| 规则来源 | 用途 |
| --- | --- |
| 旅游目的地种子 | 保留明确有旅行价值的城市或目的地 |
| `feature:PPLC` | 保留首都 |
| 国家人口 fallback | 每个国家保留一定数量的人口代表城市 |
| 中国 admin2 representative | 中国详细覆盖时保留地级代表城市 |
| 详细国家 admin1 representative | 对重点国家保留一级行政区代表城市 |
| `selectionRank` | 控制默认排序和热门城市优先展示 |

`cities.json` 只保存公开前端需要的白名单字段，不保存 GeoNames 原始大字段、全量别名、历史名称、内部导入状态或数据库排查字段。

```ts
type StaticCitiesPayload = {
  version: string; // 城市列表版本，例如 cities-2026-07-23
  generatedAt: string; // ISO 时间
  cityCount: number;
  cities: StaticCity[];
};

type StaticCity = {
  id: string; // 稳定城市 ID，例如 geonames-1853909
  geonameId: number; // GeoNames 原始 ID，便于追溯和重生成
  name: {
    en: string; // 英文或 ASCII 主名称
    zh: string; // 中文主名称，没有时回退英文
  };
  countryCode: string; // ISO 3166-1 alpha-2
  admin1?: {
    code: string; // 一级行政区代码
    en: string; // 一级行政区英文名
    zh: string; // 一级行政区中文名，没有时回退英文
  };
  lat: number;
  lng: number;
  timezone: string;
  population?: number;
  elevationM: number;
  region: 'asia' | 'europe' | 'north_america' | 'south_america' | 'africa' | 'oceania';
  rank: number; // 城市选择排序，数字越小越优先
};
```

`admin1` 保留是为了搜索结果消歧义、国家内二级筛选、地图联动和列表展示；不需要保留 `admin2` / `admin3` / `admin4` 原始字段。

## 天气窗口 JSON

免费版把未来 14 天全量天气放在一个紧凑 JSON 里。City Finder 需要跨 3 / 5 / 7 / 10 / 14 天筛选，如果按日期拆分，前端反而要请求多个文件并处理部分日期失败。

```text
R2:
current/manifest.json
versions/2026-07-23/weather-window.json
```

```ts
type StaticDataManifest = {
  version: string; // 每日天气版本，例如 2026-07-23
  generatedAt: string;
  defaultDate: string; // 默认地图日期
  dates: string[]; // 未来天气窗口日期
  cityCount: number;
  cityIndexVersion: string; // 对应 cities.json 版本
  paths: {
    weatherWindow: string;
  };
};

type WeatherWindowPayload = {
  version: string;
  generatedAt: string;
  dates: string[];
  items: WeatherWindowCity[];
};

type WeatherWindowCity = {
  cityId: string;
  days: WeatherWindowDay[];
};

type WeatherWindowDay = {
  dateIndex: number; // 对应 WeatherWindowPayload.dates 的下标
  weatherCode: number;
  weatherType: 'sunny' | 'partly_cloudy' | 'cloudy' | 'overcast' | 'fog' | 'light_rain' | 'rain' | 'thunderstorm' | 'light_snow' | 'snow';
  temperatureMinC: number;
  temperatureMaxC: number;
  temperatureMeanC: number;
  humidityMeanPercent: number;
  precipitationProbabilityMax?: number;
  precipitationSumMm: number;
  windSpeedMaxKmh?: number;
  comfortScore: number; // 预计算单日舒适度，避免前端重复实现公式
};
```

天气窗口里只引用 `cityId`，不重复返回城市名称、国家、行政区、坐标和人口。

## 前端读取

免费版前端进入 Weather Map 或 City Finder 后加载同一批数据。

```text
打开工具页
  -> 读取 Pages 静态 cities.json
  -> 读取 R2 current/manifest.json
  -> 读取 manifest.paths.weatherWindow
  -> 建立 cityById、weatherByCityId、dateIndex
```

Weather Map：

```text
World = 全部支持城市
切 region = 基于 cities.json 本地过滤
切 date = 从 weather-window.json 取 dateIndex
切 layer = 换展示字段，不请求新数据
选中城市 = 从 weather-window.json 取该城市 14 天 days
```

City Finder：

```text
搜索 = 全量 cities.json 本地搜索
天气筛选 = 基于 weather-window.json 本地计算 matchDays / score / bestStreakDays
地区筛选 = 基于 cities.json 本地过滤
结果列表 = 前端排序后分页展示
```

## JSON 拆分原则

免费版不按 `region`、`layer`、`cityId` 或单日日期拆分天气数据。

| 维度 | 免费版做法 | 原因 |
| --- | --- | --- |
| 城市 | 全部城市放入 `cities.json` | 2,000+ 城市规模小，搜索和地图共用 |
| 城市字段 | 白名单 compact 字段 | 避免提交 GeoNames 原始大字段和内部字段 |
| 天气 | 14 天合并为 `weather-window.json` | City Finder 需要完整窗口，本地筛选最简单 |
| 日期 | 不拆 | 切日期无需请求，减少状态复杂度 |
| 图层 | 不拆 | 图层只是 UI 展示字段，不是存储维度 |
| 地区 | 不拆 | World 展示全部城市，国家/大区由前端过滤 |
| 详情 forecast | 不拆 | 2,000+ 城市时已在 14 天窗口里 |

## 缓存策略

| 文件 | 缓存 |
| --- | --- |
| `cities.json` | 随 Pages 发布，可长缓存；文件名或构建产物 hash 变化时更新 |
| `current/manifest.json` | 短缓存，5-15 分钟，或使用 ETag |
| `versions/<date>/weather-window.json` | 长缓存，`public, max-age=31536000, immutable` |

每天 GitHub Actions 只上传新的 version 文件，并更新 `current/manifest.json` 指向新版本。

## 升级触发条件

当出现以下情况时，免费版静态方案需要升级：

| 条件 | 动作 |
| --- | --- |
| 城市数接近 10,000 | 评估 `weather-window.json` 下载、解析和筛选耗时 |
| City Finder 在移动端筛选卡顿 | 引入 Web Worker 或按地区懒加载 |
| 城市数达到 40,000+ | 按 Pro 版方案改为数据库查询 |
| 需要用户收藏、个性化、权限或保存筛选 | 引入后端 API 和数据库 |
| 需要商业化或更高天气 API SLA | 评估 Open-Meteo paid/customer API 或替代天气源 |
