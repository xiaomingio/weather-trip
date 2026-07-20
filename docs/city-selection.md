# City Selection

## 目标

`cities` 表只保存系统主动刷新天气并在公开工具页展示的代表城市。城市筛选的目标不是覆盖所有行政区，而是覆盖用户会拿来比较天气的全球旅行目的地：热门大城市、典型旅游城市、交通门户城市，以及少量能代表小国家或孤立岛屿的地点。

`geo_names_cities` 继续保留 GeoNames 原始城市池，`cities` 从原始池和旅游种子重算得到。Worker 只读取 `cities` 刷新天气，不直接处理 GeoNames 全量城市。

## 旧规则问题

旧规则把 `PPLC`、`PPLA`、`PPLA2`、百万人口 `PPL`、每国人口前三和每个一级行政区人口前三都纳入 `cities`。按当前 GeoNames `cities1000.zip` 粗算，这会从约 17 万个导入城市中选出约 3 万个关注城市，主要放大来源是 `PPLA2` 和一级行政区兜底。

这个规则更像行政覆盖，不像旅行目的地覆盖。它会漏掉人口很小但旅游价值很高的目的地，也会纳入大量用户不会主动比较天气的普通行政中心。

## 分析框架与原因

城市筛选按“产品目标、天气接口、数据来源、国家差异、外部审计”五层分析。这样做是为了避免两个极端：一边是只按人口/行政级别选出 3 万个普通城市，另一边是只靠人工热门榜单漏掉长尾国家首都和区域代表城市。

| 用户约束 | 为什么要这样分析 | 当前落地方式 | 当前审计结果 |
| --- | --- | --- | --- |
| 系统最多处理一批可承受城市，不做上万城市 | 先确认天气 API 承载，再决定城市规模；否则容量判断没有依据 | 用 Open-Meteo 多经纬度批量请求能力估算成本，当前 batch size 是 40 | 1,873 个城市，14 天 26,222 行，完整刷新约 47 次请求 |
| 不要粗暴硬上限，应该精细筛选 | 硬上限会让国家之间互相抢名额，也容易挤掉小而热门的目的地 | 用 `country-profiles.json` 给不同国家/地区不同人口兜底 | 中国 233、美国 187、日本 94，长尾国家默认至少首都/1 个代表城市 |
| 重点关注旅游城市 | 人口大不等于旅游价值高，旅游地也可能是小城市 | 用 `tourism-destinations.json` 保存人工确认旅游种子，并记录 `geonameId` | 108 个种子全部匹配，107 个唯一城市带 `tourism:curated` 理由 |
| 很小但热门的城市不能漏 | GeoNames `cities1000` 和人口排序会漏小岛、古镇、滑雪/山地/国家公园门户 | 种子支持 `standalone`、`boost_existing_city`、`map_to_nearest_city` | Banff、Whistler、Queenstown、Bled、Kotor、Fira 等进入或映射到天气点 |
| 小村/景区不一定需要独立天气 | 天气接口按经纬度可查，但产品上不应把每个景点都变成城市 | 区分“旅游目的地种子”和“天气刷新点” | Walt Disney World 映射 Orlando，Crete 映射 Heraklion / Chania |
| 每个国家首都至少要在 | 长尾国家也应有最低全球覆盖，不因为没有旅游 profile 被完全排除 | `feature_code = 'PPLC'` 全部纳入 | 241 个首都入选 |
| 中国、美国、日本等地貌复杂国家需要更多 | 这些国家面积大、气候差异强、用户旅行目的地密集，少量城市不能支撑天气比较 | 对 CN/US/JP/CA/AU/IN 等提高 `populationFallback` | 中国 233、美国 187、日本 94、加拿大 48、澳大利亚 45、印度 48 |
| 不太有名的国家先只保首都或几个热门城市 | 长尾国家过多铺开会把容量浪费在低使用概率城市上 | baseline 国家默认 `populationFallback = 1`，有 profile 的 regional 多数为 4 | baseline 合计 198 个城市 |
| 天气 API 以后可能会换 | 城市价值判断不能绑定 Open-Meteo；天气源只决定能不能刷、怎么映射 | 文档记录 `WeatherProviderProfile`，导入结果可复算 | 当前 Open-Meteo 按经纬度请求，无 provider city ID 限制 |
| 需要和外部热门来源交叉验证 | 单一来源会有偏差：榜单偏商业，Wikivoyage 标题不全是城市，GeoNames 偏行政/人口 | 用 Wikivoyage Star/Guide/Huge city 和人工热门样本做审计 | 审计后补 Santorini/Crete、Miami Beach、New Taipei、Taichung 等 |

## 当前实现

当前实现由 `scripts/import-geonames-cities.ts` 读取 GeoNames 和 `data/city-selection/*.json`，再调用 `packages/weather-db/src/index.ts` 重算 `cities`。最终规则不设置硬上限，而是通过国家差异化配额、旅游种子、首都兜底和中国省级覆盖自然收敛到 2000 个以内。

入选来源：

| 来源 | 当前数量 | 说明 |
| --- | ---: | --- |
| GeoNames 导入城市池 | 170,471 | 从 `cities1000.zip` 经过 feature class、坐标、时区和国家代码过滤后的基础池 |
| Country profiles | 81 | `data/city-selection/country-profiles.json` 中单独配置的旅游重点国家/地区 |
| Tourism seeds | 108 | `data/city-selection/tourism-destinations.json` 中人工确认的热门旅游目的地 |
| GeoNames capitals | 241 | `feature_code = 'PPLC'` 的国家/地区首都，全部保留 |
| China admin1 coverage | 93 | 中国每个省级区域人口前三的代表城市，用于补省级天气覆盖 |

2026-07-21 本地导入 Postgres 后的实际结果：

| 统计项 | 数量 |
| --- | ---: |
| 最终 `cities` 数量 | 1,873 |
| 14 天天气缓存行数 | 26,222 |
| 完整刷新 Open-Meteo 请求数 | 47 |
| 中国城市 | 233 |
| 美国城市 | 187 |
| 日本城市 | 94 |
| 旅游种子匹配 | 108 / 108 |
| 旅游种子未匹配 | 0 |

按筛选条件计数：

| 筛选条件 | 命中城市数 | 作为首要原因的城市数 |
| --- | ---: | ---: |
| `population:country-profile` | 1,768 | 1,439 |
| `feature:PPLC` | 241 | 240 |
| `tourism:curated` | 107 | 102 |
| `fallback:china-admin1-top` | 93 | 92 |

按国家分层计数：

| 分层 | 最终城市数 |
| --- | ---: |
| `global_hotspot` | 925 |
| `major` | 572 |
| `regional` | 127 |
| `small_high_density` | 51 |
| `baseline` | 198 |

当前前 30 个国家/地区：

| 代码 | 中文名 | 英文名 | 城市数 |
| --- | --- | --- | ---: |
| CN | 中国 | China | 233 |
| US | 美国 | United States | 187 |
| JP | 日本 | Japan | 94 |
| IT | 意大利 | Italy | 61 |
| FR | 法国 | France | 59 |
| MX | 墨西哥 | Mexico | 57 |
| ES | 西班牙 | Spain | 57 |
| TH | 泰国 | Thailand | 57 |
| CA | 加拿大 | Canada | 48 |
| IN | 印度 | India | 48 |
| AU | 澳大利亚 | Australia | 45 |
| DE | 德国 | Germany | 40 |
| GB | 英国 | United Kingdom | 40 |
| TR | 土耳其 | Türkiye | 40 |
| VN | 越南 | Vietnam | 33 |
| ID | 印度尼西亚 | Indonesia | 32 |
| BR | 巴西 | Brazil | 27 |
| AR | 阿根廷 | Argentina | 22 |
| CL | 智利 | Chile | 21 |
| EG | 埃及 | Egypt | 21 |
| MA | 摩洛哥 | Morocco | 21 |
| CO | 哥伦比亚 | Colombia | 20 |
| PE | 秘鲁 | Peru | 20 |
| ZA | 南非 | South Africa | 20 |
| CH | 瑞士 | Switzerland | 18 |
| GR | 希腊 | Greece | 18 |
| MY | 马来西亚 | Malaysia | 18 |
| NZ | 新西兰 | New Zealand | 17 |
| PT | 葡萄牙 | Portugal | 17 |
| AT | 奥地利 | Austria | 16 |

每次运行 `npm run cities:import-geonames` 后，脚本会打印实际 `cities` 总数、`selection_reasons` 计数和前 20 个国家/地区数量。GeoNames 数据更新后数字可能小幅变化，以导入日志为准。

## 交叉审计

当前筛选结果和 Wikivoyage 分类、人工热门样本做过一轮交叉审计。审计目的不是全收这些来源，而是找明显漏掉的高价值目的地。

| 审计来源 | 原始条目 | 名称级命中 | 名称级未命中 | 处理结论 |
| --- | ---: | ---: | ---: | --- |
| Wikivoyage `Category:Star cities` | 27 | 11 | 16 | 多数是很小的目的地或非城市标题，先不全收 |
| Wikivoyage `Category:Guide cities` | 719 | 276 | 443 | 作为后续离线种子来源，不直接全量进入天气点 |
| Wikivoyage `Category:Huge city articles` | 133 | 131 | 2 | 剩余 `Lagos City` / `Walt Disney World` 是标题映射问题 |
| 人工热门样本 | 38 | 36 | 2 | `Crete` / `Santorini` 已映射到 Heraklion / Chania / Fira |

本轮审计后补充了 Greece / Taiwan / United States 相关条目：

| 漏项来源 | 处理 |
| --- | --- |
| `Santorini` | 加入 Fira 作为 Santorini 天气点 |
| `Crete` | 加入 Heraklion 和 Chania 作为 Crete 主要天气点 |
| `Miami Beach` | 加入独立天气点 |
| `Walt Disney World` | 映射到 Orlando，不新增独立天气点 |
| `New Taipei` / `Taichung` | 加入 Taiwan profile 和独立天气点 |
| `Lagos City` | GeoNames 中 Lagos 已入选，记录为 Wikivoyage 标题差异 |

Wikivoyage 审计是名称级近似匹配，不能直接等同于真实缺失。岛屿、景区、主题公园、区域标题经常应该映射到附近城市天气点，而不是一比一新增城市。

## 数据源

| 来源 | 用途 | 更新方式 |
| --- | --- | --- |
| [GeoNames `cities1000.zip`](https://download.geonames.org/export/dump/cities1000.zip) | 基础城市池、坐标、时区、人口、行政字段 | 手动导入时下载 |
| [GeoNames `countryInfo.txt`](https://download.geonames.org/export/dump/countryInfo.txt) | 国家、洲别和国家代码 | 手动导入时下载 |
| [Wikivoyage](https://www.wikivoyage.org/) / [Wikidata](https://www.wikidata.org/wiki/Wikidata:Data_access) | 开放旅行目的地种子，尤其是小城、岛屿、国家公园门户和历史城镇 | 建议用脚本按需刷新，结果落成种子文件 |
| [UN Tourism Best Tourism Villages](https://tourism-villages.unwto.org/) | 人口很小但官方认可的旅游村镇种子 | 低频人工或脚本刷新 |
| [UNESCO World Heritage List](https://whc.unesco.org/en/list/) | 遗产点附近目的地补充 | 低频脚本刷新，映射到附近城市 |
| [Tripadvisor Travelers' Choice Destinations](https://www.tripadvisor.com/TravelersChoice-Destinations) / [Euromonitor Top 100 City Destinations](https://www.euromonitor.com/article/top-100-city-destinations-index-2025-driving-growth-and-innovation) | 人工校准热门目的地和高权重国家 | 不做运行时抓取，不作为唯一自动真源 |

[GeoNames `cities1000`](https://download.geonames.org/export/dump/readme.txt) 不是旅游目的地全集。它收录人口超过 1000 或行政中心的 populated places，因此会缺失一些小岛、景区村镇、国家公园入口、滑雪村、潜水点和徒步目的地。缺失目的地通过旅游种子补齐，但不要求每个小目的地都变成独立天气城市。

## 天气接口边界

当前项目使用 [Open-Meteo Forecast API](https://open-meteo.com/en/docs)，代码入口是 `apps/worker/src/open-meteo.ts`。这个接口按经纬度请求天气，支持一次请求传入多个纬度/经度，并用 `timezone=auto` 自动返回对应时区天气。当前 Worker 每批请求 40 个城市，刷新未来 14 天的每日天气。

Open-Meteo 返回的 `daily.time` 是地点当地自然日，不是 UTC 时间戳。因为请求使用 `timezone=auto`，中国城市按 `Asia/Shanghai` 日期理解，美国、日本、欧洲等城市按各自地点时区日期理解。数据库里的 `daily_forecasts.date` 也按这个 date-only 语义保存；代码读取 Postgres `date` 时不能用 `toISOString()` 转换，否则在中国开发环境会因为 UTC 偏移把 `2026-07-20` 变成 `2026-07-19`，导致缓存判断误以为每个城市还缺一天并重复请求 Open-Meteo。

[Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) 可以按名称搜索地点，并返回坐标、海拔、时区、人口等字段；它的地点数据来自 GeoNames。它适合做种子匹配校验和缺失坐标补全，不适合作为“热门旅游城市列表”的唯一来源，也不应该替代本项目自己的城市筛选真源。

按 [Open-Meteo Terms](https://open-meteo.com/en/terms)，免费 API 的非商业使用限制是少于 10,000 calls/day、5,000 calls/hour、600 calls/minute。按 [Open-Meteo Pricing](https://open-meteo.com/en/pricing)，免费 API 无 SLA，商业用途或更高保障应使用 customer API；Open-Meteo 也支持自托管。

当前刷新成本按 HTTP 请求数估算，不按 city-date 数估算：

| 城市数 | batch size | 空缓存或日常整批刷新请求数 | 占 10,000 calls/day |
| ---: | ---: | ---: | ---: |
| 1,873 | 40 | 47 | 0.47% |
| 2,000 | 40 | 50 | 0.5% |
| 5,000 | 40 | 125 | 1.25% |

当前 Worker 会先检查数据库中未来 14 天的 `city/date` 缓存；如果某个城市缺任意一天，就重新请求该城市的 14 天预报并只写入缺失日期。因此日常刷新通常仍会覆盖所有城市一次，因为每天都会多出一个新的未来日期。即便城市数提高到 2,000，每日 forecast 请求数仍约 50 次，低于 Open-Meteo 免费 API 限额。真正需要关注的是非商业条款、共享出口 IP 的限流风险、失败重试和后续是否接入广告/订阅等商业化场景。

如果后续更换天气接口，城市选择流程要能重复计算。天气源只影响“这个候选能不能被刷新、刷新成本多高、是否需要映射到 provider 自己的城市 ID”，不直接决定“这个目的地是否有旅游价值”。

```ts
type WeatherProviderProfile = {
  provider: 'open-meteo' | 'openweather' | 'weatherapi' | 'custom';
  locationMode: 'coordinates' | 'provider_city_id' | 'station_id';
  supportsArbitraryCoordinates: boolean; // 是否能对任意经纬度请求预报
  hasSearchApi: boolean; // 是否有城市/地点搜索接口
  searchApiSource?: 'geonames' | 'provider-catalog' | 'unknown';
  forecastDays: number; // 当前配置的预报天数
  batchSize: number; // 单次请求地点数量
  quotaPolicy: 'unknown' | 'free-tier' | 'paid-tier' | 'self-hosted';
};
```

当前 Open-Meteo profile：

```ts
const currentWeatherProviderProfile: WeatherProviderProfile = {
  provider: 'open-meteo',
  locationMode: 'coordinates',
  supportsArbitraryCoordinates: true,
  hasSearchApi: true,
  searchApiSource: 'geonames',
  forecastDays: 14,
  batchSize: 40,
  quotaPolicy: 'free-tier'
};
```

城市筛选复算时应按固定步骤执行：

1. 从 GeoNames 和旅游种子生成 `TourismDestinationSeed`
2. 把目的地解析为 `standalone`、`map_to_nearest_city` 或 `boost_existing_city`
3. 按国家 profile、旅游来源、人口、行政特征和去重规则打分
4. 按天气源 profile 校验候选是否能刷新
5. 输出最终天气刷新点和 `selection_reasons`
6. 输出统计报告，包括每个国家、每类来源、每类 `weatherMode` 的数量

如果天气源只能按 provider city ID 请求天气，复算时要先把本地候选映射到 provider catalog；映射不到的候选不能直接进入 `cities`，只能映射到附近可用城市或进入人工 review。当前 Open-Meteo 按经纬度请求，没有这个限制。

## 更新频率

城市筛选不属于每日 Worker 任务，不在运行时频繁访问 SPARQL、榜单页面或外部旅游站。推荐节奏：

- GeoNames 城市池：每月或每季度手动刷新一次，或者上线前刷新
- Wikivoyage / Wikidata 种子：每月或每季度离线刷新一次
- UN Tourism / UNESCO 种子：每季度或有明确数据更新时刷新
- 人工 curated 种子：发现明显漏项时随代码一起提交

日常天气刷新只读取数据库里的 `cities`，不重新研究城市列表。

## 代码化原则

城市筛选已经做成代码和数据文件，不依赖每次让 AI 重新研究。

```text
data/
└── city-selection/
    ├── country-profiles.json          # 每个国家的旅游权重和补充配额
    ├── tourism-destinations.json      # 人工确认的旅游目的地种子
    ├── source-wikivoyage.json         # 后续脚本生成的开放旅行种子
    ├── source-unesco-nearby.json      # 后续脚本生成的遗产点附近城市
    └── source-un-tourism-villages.json # 后续脚本生成或人工整理的小村镇种子
```

AI 可以辅助扩充和审阅 `tourism-destinations.json`，但最终真源应该是可 review、可 diff、可复跑的 JSON 和脚本。

`tourism-destinations.json` 保存旅游目的地种子，`cities` 保存最终天气刷新点。两者不要混成一张表：一个旅游目的地可以映射到一个已有城市，也可以在少数情况下创建独立天气点。

```ts
type TourismDestinationSeed = {
  id: string; // 稳定种子 ID，例如 wikivoyage:kyoto 或 curated:amalfi-coast
  name: string; // 目的地展示名或匹配名
  countryCode: string; // ISO 3166-1 alpha-2
  latitude?: number; // 有明确目的地坐标时填写
  longitude?: number; // 有明确目的地坐标时填写
  geonameId?: number; // 能直接匹配 GeoNames 城市时填写
  source: 'curated' | 'wikivoyage' | 'unesco' | 'un-tourism-village' | 'reference-list';
  sourceUrl?: string; // 来源页面或数据集 URL
  weatherMode: 'standalone' | 'map_to_nearest_city' | 'boost_existing_city';
  mappedGeonameId?: number; // 非独立天气点映射到的 GeoNames 城市
  priority: number; // 越小优先级越高
  notes?: string; // 人工判断依据，例如岛屿、高海拔、国家公园门户
};
```

脚本负责把种子解析成候选理由：`standalone` 种子尝试加入 `cities`；`map_to_nearest_city` 和 `boost_existing_city` 只提高被映射城市的入选分数，不直接新增天气点。当前 108 个种子都提供或匹配到 GeoNames 城市，后续新增容易重名的种子时优先填写 `geonameId`。

最终天气刷新点使用独立结构承载，不直接复用旅游种子结构：

```ts
type WeatherPointCandidate = {
  id: string; // 最终天气点 ID，优先沿用 geonames-{geoname_id}
  name: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  sourceGeonameId?: number;
  providerLocationId?: string; // 仅 provider 要求 city ID / station ID 时填写
  mappedDestinationIds: string[]; // 映射到这个天气点的旅游目的地
  selectionReasons: CitySelectionReason[];
  score: number;
};
```

## SPARQL 使用边界

[Wikidata SPARQL](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual) 有价值，但不适合做运行时依赖，也不适合一次性写很重的全球大查询。

本地计时样本：

| 查询 | 结果 |
| --- | --- |
| Wikivoyage sitelink 简单抽样 `LIMIT 100` | 约 0.7 秒 |
| Wikivoyage + `wdt:P31 wd:Q515` + 国家/人口/坐标 `LIMIT 100` | 约 7.4 秒 |
| Wikivoyage + `P31/P279*` 城市层级推理 | 超过 60 秒未返回 |

推荐做法是离线脚本小步查询或直接用 Wikidata/Wikivoyage dump 处理，生成本地种子文件。导入脚本读取本地种子文件，不在生产 Worker 中调用 SPARQL。

## 小目的地天气策略

不是所有小旅行点都应该成为独立天气城市。天气工具要展示“用户会选择住在哪里、抵达哪里、天气差异是否明显”的代表点。

天气接口不要求城市有专门气象站。当前 Worker 使用 [Open-Meteo Forecast API](https://open-meteo.com/en/docs)，按经纬度请求未来天气；Open-Meteo 会为给定位置自动选择适用的天气模型。因此“小村有没有专门天气预报”不是技术边界，真正的产品边界是：这个小目的地是否值得在页面上作为独立天气比较对象，以及它的天气是否和附近代表城市有明显差异。

| 目的地类型 | 处理方式 |
| --- | --- |
| 小岛、孤立岛屿国家、远离大陆的海岛 | 保留独立天气点，优先用岛上主要城镇或首府坐标 |
| 高海拔小镇、滑雪村、山地门户 | 天气与附近大城市差异明显时保留独立天气点 |
| 国家公园门户村镇 | 如果用户通常住在门户镇且气候不同，保留门户镇；否则映射到最近服务城市 |
| 古镇、遗产村、普通景区村 | 默认作为旅游目的地种子影响附近城市入选，不单独占天气点 |
| 大城市内城区、区县、卫星城 | 默认合并到主城市，避免重复天气点 |
| 小国家或城市国家 | 保留首都或主要城市，不按人口过滤掉 |

独立天气点的默认判断：

| 条件 | 处理 |
| --- | --- |
| 距离映射城市少于 30 公里，海拔差少于 300 米，且不是岛屿/山地/海岸微气候目的地 | 映射到已有城市 |
| 距离映射城市超过 50 公里，或海拔差超过 500 米 | 倾向保留独立天气点 |
| 岛屿、半岛末端、沙漠绿洲、峡谷、高山、滑雪区、国家公园深处 | 即使人口很小，也可以保留独立天气点 |
| 只是大城市内热门街区、景点、公园、博物馆 | 合并到主城市 |
| 小国家只有一个主要住宿/抵达城市 | 保留该主要城市，其他小点映射到它 |

如果目的地不在 GeoNames `cities1000` 中，但满足独立天气点条件，可以后续扩展一张手工天气点表，保存稳定 ID、名称、国家、坐标、时区和来源；不应为了它反向污染 GeoNames 原始表。

## 入选理由

`cities.selection_reasons` 应记录城市为什么入选，方便调试和复盘。

```ts
type CitySelectionReason =
  | 'tourism:curated' // 人工确认的热门旅行目的地
  | 'tourism:wikivoyage-guide' // Wikivoyage 高质量城市/目的地
  | 'tourism:unesco-nearby' // UNESCO 遗产点附近代表城市
  | 'tourism:un-village' // UN Tourism Best Tourism Villages 映射目的地
  | 'feature:PPLC' // 国家首都
  | 'population:country-profile' // 按国家 profile 配额选出的人口代表城市
  | 'fallback:china-admin1-top'; // 中国省级区域代表城市
```

`PPLA2` 不再作为全量入选理由，只能作为排序和候选特征参与评分。

## 国家差异化

国家不应该共用同一个行政兜底规则。推荐按旅游强度给 profile：

```ts
type CountryTourismProfile = {
  countryCode: string; // ISO 3166-1 alpha-2
  tier: 'global_hotspot' | 'major' | 'regional' | 'small_high_density' | 'baseline';
  populationFallback: number; // 人口兜底城市数
};
```

当前国家 profile 配置：

| 分层 | 代码 | 中文名 | 英文名 | 人口兜底 |
| --- | --- | --- | --- | ---: |
| `global_hotspot` | CN | 中国 | China | 220 |
| `global_hotspot` | US | 美国 | United States | 180 |
| `global_hotspot` | JP | 日本 | Japan | 90 |
| `global_hotspot` | FR | 法国 | France | 55 |
| `global_hotspot` | ES | 西班牙 | Spain | 55 |
| `global_hotspot` | IT | 意大利 | Italy | 55 |
| `global_hotspot` | MX | 墨西哥 | Mexico | 55 |
| `global_hotspot` | TH | 泰国 | Thailand | 55 |
| `global_hotspot` | DE | 德国 | Germany | 40 |
| `global_hotspot` | GB | 英国 | United Kingdom | 40 |
| `global_hotspot` | TR | 土耳其 | Türkiye | 40 |
| `major` | CA | 加拿大 | Canada | 45 |
| `major` | AU | 澳大利亚 | Australia | 45 |
| `major` | IN | 印度 | India | 45 |
| `major` | VN | 越南 | Vietnam | 30 |
| `major` | ID | 印度尼西亚 | Indonesia | 30 |
| `major` | BR | 巴西 | Brazil | 25 |
| `major` | EG | 埃及 | Egypt | 20 |
| `major` | MA | 摩洛哥 | Morocco | 20 |
| `major` | ZA | 南非 | South Africa | 20 |
| `major` | AR | 阿根廷 | Argentina | 20 |
| `major` | PE | 秘鲁 | Peru | 20 |
| `major` | CL | 智利 | Chile | 20 |
| `major` | CO | 哥伦比亚 | Colombia | 20 |
| `major` | GR | 希腊 | Greece | 16 |
| `major` | PT | 葡萄牙 | Portugal | 16 |
| `major` | AT | 奥地利 | Austria | 16 |
| `major` | NL | 荷兰 | Netherlands | 16 |
| `major` | KR | 韩国 | South Korea | 16 |
| `major` | MY | 马来西亚 | Malaysia | 16 |
| `major` | SA | 沙特阿拉伯 | Saudi Arabia | 16 |
| `major` | NZ | 新西兰 | New Zealand | 16 |
| `major` | CH | 瑞士 | Switzerland | 16 |
| `major` | HR | 克罗地亚 | Croatia | 16 |
| `major` | CZ | 捷克 | Czechia | 16 |
| `major` | AE | 阿拉伯联合酋长国 | United Arab Emirates | 10 |
| `regional` | TW | 台湾 | Taiwan | 12 |
| `regional` | BE | 比利时 | Belgium | 4 |
| `regional` | DK | 丹麦 | Denmark | 4 |
| `regional` | FI | 芬兰 | Finland | 4 |
| `regional` | IE | 爱尔兰 | Ireland | 4 |
| `regional` | NO | 挪威 | Norway | 4 |
| `regional` | SE | 瑞典 | Sweden | 4 |
| `regional` | PL | 波兰 | Poland | 4 |
| `regional` | HU | 匈牙利 | Hungary | 4 |
| `regional` | RO | 罗马尼亚 | Romania | 4 |
| `regional` | BG | 保加利亚 | Bulgaria | 4 |
| `regional` | RS | 塞尔维亚 | Serbia | 4 |
| `regional` | CY | 塞浦路斯 | Cyprus | 4 |
| `regional` | IL | 以色列 | Israel | 4 |
| `regional` | QA | 卡塔尔 | Qatar | 4 |
| `regional` | OM | 阿曼 | Oman | 4 |
| `regional` | PH | 菲律宾 | Philippines | 4 |
| `regional` | LA | 老挝 | Laos | 4 |
| `regional` | LK | 斯里兰卡 | Sri Lanka | 4 |
| `regional` | CR | 哥斯达黎加 | Costa Rica | 4 |
| `regional` | PA | 巴拿马 | Panama | 4 |
| `regional` | DO | 多米尼加共和国 | Dominican Republic | 4 |
| `regional` | JM | 牙买加 | Jamaica | 4 |
| `regional` | UY | 乌拉圭 | Uruguay | 4 |
| `regional` | EC | 厄瓜多尔 | Ecuador | 4 |
| `regional` | KE | 肯尼亚 | Kenya | 4 |
| `regional` | TZ | 坦桑尼亚 | Tanzania | 4 |
| `regional` | TN | 突尼斯 | Tunisia | 4 |
| `regional` | NG | 尼日利亚 | Nigeria | 4 |
| `small_high_density` | SG | 新加坡 | Singapore | 3 |
| `small_high_density` | HK | 中国香港特别行政区 | Hong Kong SAR China | 3 |
| `small_high_density` | MO | 中国澳门特别行政区 | Macao SAR China | 3 |
| `small_high_density` | MV | 马尔代夫 | Maldives | 3 |
| `small_high_density` | IS | 冰岛 | Iceland | 3 |
| `small_high_density` | MT | 马耳他 | Malta | 3 |
| `small_high_density` | SC | 塞舌尔 | Seychelles | 3 |
| `small_high_density` | MU | 毛里求斯 | Mauritius | 3 |
| `small_high_density` | FJ | 斐济 | Fiji | 3 |
| `small_high_density` | NP | 尼泊尔 | Nepal | 3 |
| `small_high_density` | BT | 不丹 | Bhutan | 3 |
| `small_high_density` | SI | 斯洛文尼亚 | Slovenia | 3 |
| `small_high_density` | ME | 黑山 | Montenegro | 3 |
| `small_high_density` | GE | 格鲁吉亚 | Georgia | 3 |
| `small_high_density` | JO | 约旦 | Jordan | 3 |
| `small_high_density` | KH | 柬埔寨 | Cambodia | 3 |
| `baseline` | 其他国家/地区 | 其他国家/地区 | Other countries and regions | 1 |

## 后续改进

1. 增加维护脚本，离线拉取 Wikivoyage/Wikidata 种子并输出可 review 的 JSON
2. 增加 UNESCO 和 UN Tourism Villages 的离线映射脚本，补充小型高价值目的地
3. 给中国、日本、美国、法国、意大利、西班牙等重点国家继续补 curated 旅游种子，避免只靠人口排序
4. 如果目的地不在 GeoNames `cities1000` 中，再扩展手工天气点表，不反向污染 GeoNames 原始表

## 参考链接

- [Wikivoyage category API](https://en.wikivoyage.org/w/api.php) 可用于读取分类规模和分页拉取页面标题
