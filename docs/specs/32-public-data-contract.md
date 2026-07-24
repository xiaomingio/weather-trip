# 公开数据契约

## 文档边界

数据来源和生成链路见 `docs/specs/31-data-flow.md`。本文定义浏览器会请求哪些公开数据文件、这些文件如何分块、城市 Wire JSON 和天气二进制包如何组织、缓存怎么设置，以及何时需要调整分片策略。

公开数据按 5,000 个以内 `city` 设计。用户请求读取静态 JSON / MVT / `.bin`，本地完成地图、筛选、排序和城市详情展示。

## 请求路径

```text
打开工具页
  -> 读取 /data/cities.json
  -> 读取 weather/current.json
  -> 读取 current.f 指向的 forecast bin
  -> 按 cityId 匹配天气
  -> 建立 cityById、forecast matrix indexes、region indexes

打开 Weather Map
  -> MapLibre 按当前 viewport / zoom 请求 /data/geo/region-tiles/{country,admin1,admin2}/{z}/{x}/{y}.mvt
  -> z1-z2 显示 country，z3-z4 显示 admin1/fallback，z5-z8 显示 admin2/fallback
  -> 按 regionKey 匹配天气 summary 并更新可见瓦片样式

打开 City Finder
  -> 不加载 GeoJSON
  -> 基于 cities.json 和 forecast 包做搜索、筛选、排序和分页
```

Weather Map：

```text
World = 全部支持城市
切 region = 基于 cities.json 的 country/admin1/admin2 key 本地过滤
切 date = 从 weather/forecast-14d/<date>.bin 取 dateIndex
切 layer = 换展示字段，不请求新天气数据
选中城市 = 用 cityId 从 weather/forecast-14d/<date>.bin 取 14 天数组
切地图缩放 = 只按 zoom 档切换边界瓦片，不按选中地区切换边界包
切地区 = 自动相机只使用当前结果城市点范围；不为 bounds 读取完整行政区 outline
```

City Finder：

```text
搜索 = 基于 cities.json 本地搜索
天气筛选 = 基于 weather/forecast-14d/<date>.bin 本地计算 matchDays / score / bestStreakDays
地区筛选 = 基于 cities.json 的 region key 本地过滤
结果列表 = 前端排序后分页展示
```

## 公开文件

| 文件 | 位置 | 作用 |
| --- | --- | --- |
| `/data/cities.json` | Cloudflare Pages | 城市主索引；保存城市 ID、中英文名、坐标、海拔、国家/一级/二级区域字典和默认排序 |
| `/data/geo/region-tiles/manifest.json` | Cloudflare Pages | 地图边界瓦片 manifest；记录 source-layer、分包和 zoom 范围 |
| `/data/geo/region-tiles/country/{z}/{x}/{y}.mvt` | Cloudflare Pages | `z1-z2` 国家级边界瓦片 |
| `/data/geo/region-tiles/admin1/{z}/{x}/{y}.mvt` | Cloudflare Pages | `z3-z4` 一级行政区边界瓦片 |
| `/data/geo/region-tiles/admin2/{z}/{x}/{y}.mvt` | Cloudflare Pages | `z5` 高精度边界瓦片，`z6-z8` overzoom，缺少二级行政区时回退到上一层 |
| `weather/current.json` | Cloudflare R2 | 活跃天气入口；保存天气版本、生成时间、日期窗口、默认日期、forecast bin 路径、字节数和 sha256 |
| `weather/forecast-14d/<date>.bin` | Cloudflare R2 | 14 天预报二进制包；保存 `cityId[]`、`date[]`、天气源海拔和每日数值矩阵 |

本地开发使用同一套路径语义：

```text
apps/web/public/data/
├── cities.json
├── geo/
│   └── region-tiles/
│       ├── manifest.json
│       ├── country/{z}/{x}/{y}.mvt
│       ├── admin1/{z}/{x}/{y}.mvt
│       └── admin2/{z}/{x}/{y}.mvt
└── weather/
    ├── current.json
    └── forecast-14d/
        └── local.bin
```

前端数据 base URL 由环境变量或构建配置决定。`PUBLIC_STATIC_DATA_BASE_URL` 用于 `cities.json`，天气入口优先使用 `PUBLIC_R2_DATA_BASE_URL`，地图瓦片默认随 Pages 发布在 `/data/geo/region-tiles`：

```text
PUBLIC_STATIC_DATA_BASE_URL=/data
PUBLIC_R2_DATA_BASE_URL=https://static.weather-trip.example.com
PUBLIC_GEO_VECTOR_BASE_URL=/data/geo/region-tiles
```

`PUBLIC_R2_DATA_BASE_URL` 为空时，天气 current 和 forecast 从 `PUBLIC_STATIC_DATA_BASE_URL/weather/*` 读取；本地默认就是 `/data/weather/*`。

## Wire 和 Bin 规则

传输 JSON 类型统一使用 `Wire` 后缀，例如 `CitiesPayloadWire`、`WeatherCurrentWire`。`Wire` 指 on the wire，也就是跨网络边界传输和存储在 Pages / R2 上的紧凑 JSON 格式。天气 forecast 包使用 `.bin + ArrayBuffer`，解码后得到 `WeatherForecastMatrix`。没有 `Wire` 后缀的类型就是 fetch 后解码得到的应用模型，筛选、地图聚合、评分和 UI 只使用完整字段名或矩阵查询函数。

`v` 是数据批次版本，用来做缓存识别、问题排查和新鲜度判断，不参与城市和天气的关联。城市与天气只通过 `cityId` 关联。`cv` 表示天气包生成时读取的城市列表版本；如果 `cv` 和浏览器已加载的 `cities.json` 版本不一致，前端仍按 `cityId` 展示能匹配到的天气，新增城市显示暂无天气，过期天气行被忽略。

短字段和数组行只属于 `Wire` 格式；天气包里的整数化单位和字段 offset 只属于 forecast bin 格式。只有浏览器会直接请求的 public JSON 使用紧凑格式；`data/generated/*.json` 和报告保留缩进，便于 review、diff 和复跑排查。前端 fetch 后立即 decode 成完整应用类型或 `WeatherForecastMatrix`；界面层、地图聚合、City Finder 筛选和评分逻辑都使用完整字段名和矩阵查询函数，不直接访问 `c[7]`、`d.a1` 或裸 offset。

## 城市数据

`cities.json` 只保存公开前端需要的字段，不保存 GeoNames 原始大字段、全量别名、历史名称、内部导入状态或数据库排查字段。C3 国家页和二级区域着色需要稳定的 `admin2`，但 JSON 里不同时保存 `regionKey` 和它的组成字段；`country:${code}`、`admin1:${country}.${admin1}`、`admin2:${country}.${admin1}.${admin2}` 在前端由字典行生成。

```ts
interface CitiesPayloadWire {
  v: string; // 城市列表版本，例如 cities-2026-07-23
  d: CitiesDictWire; // 字典，给城市行复用
  c: CityRowWire[]; // 城市行，顺序就是默认排序
}

interface CitiesDictWire {
  co: CountryRowWire[]; // 国家字典
  a1: Admin1RowWire[]; // 一级区域字典
  a2: Admin2RowWire[]; // 二级区域字典
}

type LocalizedNameWire = [en: string, zh: string];
type WorldRegionCode = 'asia' | 'europe' | 'north_america' | 'south_america' | 'africa' | 'oceania';
type CountryTierCode = 1 | 2 | 3; // C1 / C2 / C3
type CountryRowWire = [code: string, name: LocalizedNameWire, worldRegion: WorldRegionCode, countryTier: CountryTierCode];
type Admin1RowWire = [countryIndex: number, code: string, name: LocalizedNameWire];
type Admin2RowWire = [countryIndex: number, admin1Index: number, code: string, name: LocalizedNameWire];

type CityRowWire = [
  id: string, // 稳定城市 ID，例如 geonames-1853909
  name: LocalizedNameWire, // 城市中英文名，只在 cities.json 保存
  countryIndex: number,
  admin1Index: number | null,
  admin2Index: number | null,
  latE5: number, // latitude * 100000 后取整
  lngE5: number, // longitude * 100000 后取整
  elevationM: number // 城市主索引海拔，来自 GeoNames 或种子补全
];
```

城市 JSON 使用短字段名和数组行是为了减小传输体积，并让 gzip / Brotli 更容易压缩。重复值放进 `d` 字典：国家、一级区域和二级区域都用下标引用。城市自己的中英文名只出现一次；天气包不保存城市名、国家名、行政区名和坐标。

`WorldRegionCode` 只表达城市所属的六大洲。Weather Map 的固定地区选项还包含 `east_asia` 和 `southeast_asia`，它们由前端按国家集合匹配城市，不写入国家字典的 `worldRegion` 字段。

国家名称默认来自标准地区显示名；`CN` 在本产品里展示为 `China / 中国`。`CN` 的 C3 详情以中国大陆地级区块为主体，并把香港、澳门和台湾作为 companion C3 区块放入中国详情图；香港、澳门和台湾仍作为独立 C1 地区进入城市字典和全球视图。

`cities.c` 的顺序就是公开默认排序。生成脚本先按 GeoNames 行政级别排序，再按人口排序：国家首都 `PPLC` 最靠前，首都之间人口高者优先；然后是一级行政中心、二级/三级/四级行政中心和普通人口城市。这个顺序只用于解码时派生 `rank` 和组件渲染时的数组位置，不作为字段保存到业务类型里。稳定身份始终是 `id`；天气、URL、收藏、埋点、本地缓存和跨版本引用都保存 `id`，不保存数组下标。只要城市集合、顺序或字段变化，就必须生成新的 `v`。

`selectionReasons` 不进入公开城市 JSON。它服务导入审计、覆盖复盘和调试，保存在 `data/report/city-selection-report.md`；前端展示控制使用 country tier、region key、rank 和后续明确新增的公开字段，不复用审计原因。

`countryTier` 放在国家字典里，不在每个城市行重复。`rank` 不传输，`cities.c` 的顺序就是排序真源，解码后用数组位置 + 1 作为 rank。`geonameId`、`timezone`、`population`、城市列表生成时间和覆盖摘要也不进入公开城市 JSON。`geonameId` 用于追溯，放在生成报告；`timezone` 只影响天气源返回的当地日期，天气包已经保存 date-only 结果；Weather Map 默认列表、默认选中城市和 marker 避让都使用解码后的 rank；城市数量和覆盖统计由 `c.length`、字典和报告计算。

```ts
interface CitiesPayload {
  version: string;
  cityCount: number;
  cities: City[];
}

interface City {
  id: string;
  name: { en: string; zh: string };
  country: {
    code: string;
    regionKey: string; // country:CN
    name: { en: string; zh: string };
    worldRegion: WorldRegionCode;
  };
  admin1?: {
    code: string;
    regionKey: string; // admin1:CN.25
    name: { en: string; zh: string };
  };
  admin2?: {
    code: string;
    regionKey: string; // admin2:CN.25.04
    name: { en: string; zh: string };
  };
  countryTier: 'C1' | 'C2' | 'C3';
  latitude: number;
  longitude: number;
  elevationM: number;
  worldRegion: WorldRegionCode;
  rank: number;
}
```

## 天气数据

未来 14 天全量天气放在一个二进制矩阵包里。City Finder 需要跨 3 / 5 / 7 / 10 / 14 天筛选，如果按日期拆分，前端反而要请求多个文件并处理部分日期失败。forecast bin 内先保存 `cityId[]` 和 `date[]`，再保存按 `dateIndex * cityCount + cityIndex` 排列的数值矩阵。

```ts
interface WeatherCurrentWire {
  v: string; // 每日天气版本，例如 2026-07-23
  g: string; // 生成时间，ISO 字符串
  dd: string; // UI 默认地图日期
  ds: string[]; // 14 天预报窗口里的 date-only key
  cv: string; // 对应 cities.json 的 v
  f: string; // weather/forecast-14d/<date>.bin 路径
  fb: number; // forecast bin byteLength
  fh: string; // forecast bin sha256，用于发布校验和排查
}

type WeatherForecastMatrix = {
  cityIds: string[]; // cityIndex -> cityId
  dates: string[]; // dateIndex -> date-only key，必须等于 current.ds
  indexByCityId: Map<string, number>;
  indexByDate: Map<string, number>;
  sourceElevationMeters: Int16Array; // cityIndex -> 天气源海拔；-32768 表示缺失
  fields: {
    weatherCode: Uint8Array;
    temperatureMinC10: Int16Array;
    temperatureMaxC10: Int16Array;
    temperatureMeanC10: Int16Array;
    humidityMeanPercent: Uint8Array;
    precipitationProbabilityMaxPercent: Uint8Array;
    precipitationSumMm10: Uint16Array;
    windSpeedMaxKmh10: Uint16Array; // 65535 表示单字段缺失
    missing: Uint8Array; // 1 表示该 city/date 缺测
  };
};
```

天气包用 `cityId[]` 关联城市，不用数组下标做跨文件外键。前端读取后从 `cityId[]` 建立 `cityId -> cityIndex`；`current.cv` 用来判断天气包对应哪个城市列表版本，并用于展示数据新鲜度或上报异常，不阻止已匹配城市展示。城市列表新增而天气还没刷新时，该城市显示暂无天气；天气包里已经不存在于已加载 `cities.json` 的城市行直接忽略。`date[]` 必须等于 `current.ds`，缺某个 city/date 时在 `missing` 矩阵里标记。

Open-Meteo Forecast API 在响应顶层返回 `elevation`，并说明这个值用于 statistical downscaling；它不是 `daily` 数组里的逐日变量，但属于天气源本次 forecast 的点位元数据。刷新任务要把它保存到 `sourceElevationMeters`。地图的 elevation layer 优先使用天气源海拔，没有时回退到 `cities.json` 的 `elevationM`。如果后续天气源返回真正逐日变化的海拔或类似地形字段，再把它加入 forecast bin 字段数组。

`weatherType` 和 `comfortScore` 不写入天气包，由前端通过 `weatherCode` 和共享公式计算。`precipitationProbabilityMax` 写入 forecast bin，用于选中城市的单日天气卡片；区域聚合和降水图层仍使用 `precipitationSumMm`。单位固定为摄氏度、毫米、公里/小时和百分比，不在每条记录里重复写单位。温度、降水和风速按 0.1 单位整数化，湿度、降雨概率和天气码用 `Uint8`，缺测用 `missing` byte，具体布局见 `docs/specs/41-weather-matrix-performance.md`。

天气包加载失败不能阻断城市索引和地图边界。前端地区选项、地图底图和 MVT 边界只依赖 `cities.json` 与 `/data/geo/region-tiles/*`；`weather/current.json` 或 forecast bin 失效时，Weather Map 仍显示地图边界，只清空天气点位、天气图层、结果列表和城市预报，并展示天气数据错误状态。

```ts
interface WeatherWindow {
  version: string;
  generatedAt: string;
  cityListVersion: string;
  defaultDate: string;
  dates: string[];
  cities: City[];
  forecastMatrix: WeatherForecastMatrix;
}

interface DailyForecast {
  date: string;
  dateIndex: number;
  weatherCode: number;
  weatherType: 'sunny' | 'partly_cloudy' | 'cloudy' | 'overcast' | 'fog' | 'light_rain' | 'rain' | 'thunderstorm' | 'light_snow' | 'snow';
  temperatureMinC: number;
  temperatureMaxC: number;
  temperatureMeanC: number;
  humidityMeanPercent: number;
  precipitationSumMm: number;
  windSpeedMaxKmh: number | null;
}
```

`DailyForecast` 只在当前列表页、选中城市预报或当前地图日期临时生成，不在 `WeatherWindow` 里长期保存全量数组。

`dates` 使用天气源返回的地点当地自然日，不是 UTC 时间戳。生成、比较和校验日期时使用 date-only 字符串，不能把城市当地日期转成 `toISOString()` 后再截取日期。`defaultDate` 只是 UI 默认日期；跨时区城市可能在窗口头尾有自然日差异，校验时按每个城市自己的 14 条 daily 结果判断。

Open-Meteo Forecast API 支持最多 16 天预报；本项目使用未来 14 天。按 5,000 个以内城市估算，batch size 40 时，每日完整刷新最多约 125 个 HTTP 请求；按当前 3,841 个城市计算约 97 个请求。刷新任务要限制并发、实现重试和失败摘要，不把失败半成品发布到 `weather/current.json`。

刷新流程：

```text
1. 读取 Pages 发布的 cities.json
2. 校验城市字段契约
3. 按 batch size 调天气源
4. 生成 weather/forecast-14d/<date>.bin
5. 上传 forecast bin 到 R2
6. 下载回读并校验 `fb`、`fh`、`date[]`、每个 `cityId`、`sourceElevationM`、字段范围和 bin header
7. 校验通过后更新 weather/current.json
8. 校验失败时保留原 current，并输出 CI 失败摘要
```

## 地图边界数据

代表点进入 `cities.json` 只解决天气数据。地图按国家、一级区域和二级区域着色使用静态 MVT 边界瓦片。

```ts
type WeatherRegionTileFeature = {
  regionKey: string; // country:FR / admin1:CN.13 / admin2:ES.51.01
  level: 'country' | 'admin1' | 'admin2' | 'boundary';
  countryCode: string;
  admin1Code?: string;
  admin2Code?: string;
  labelZh?: string;
  labelEn?: string;
  weatherLevel: 'country' | 'admin1' | 'admin2';
  hasWeatherRegion: boolean;
  hasCity: boolean;
};
```

| 图层 | 文件 | 读取时机 | 匹配方式 |
| --- | --- | --- | --- |
| 国家级瓦片 | `/data/geo/region-tiles/country/{z}/{x}/{y}.mvt` | 地图 `z1-z2` 且视口覆盖到对应 tile 时读取 | `country:<countryCode>` |
| 一级区域瓦片 | `/data/geo/region-tiles/admin1/{z}/{x}/{y}.mvt` | 地图 `z3-z4` 且视口覆盖到对应 tile 时读取 | `admin1:<countryCode>.<admin1Code>`；没有一级区域时回退 `country:<countryCode>` |
| 二级区域瓦片 | `/data/geo/region-tiles/admin2/{z}/{x}/{y}.mvt` | 地图 `z5-z8` 且视口覆盖到对应 tile 时读取；实际只生成 z5，z6-z8 overzoom | `admin2:<countryCode>.<admin1Code>.<admin2Code>`；没有二级区域时回退 admin1，再缺失时回退 country |
| 城市 | `/data/cities.json` | Weather Map 和 City Finder 共用 | 解码城市字典后生成同一套 region key |

边界瓦片必须按 `regionKey` 匹配城市聚合结果。无法匹配的区域使用无数据样式或只展示边界名，并写入城市选择报告、边界生成报告或瓦片报告。marker 和区域着色使用同一批城市。区域颜色来自城市聚合，不使用行政区几何面积平均，也不做邻近插值；tooltip 显示区域名和当前图层指标，当前指标没有数据时显示“暂无数据 / No data”。

前端地区选择只暴露大区、C2/C3 国家和国家内一级行政区。`admin2:<countryCode>.<admin1Code>.<admin2Code>` 只用于高 zoom 边界着色和聚合结果；旧链接带有 admin2 时，运行时归一到所属 `admin1`。切换地区时的自动相机只使用当前结果城市点范围，世界视图使用固定默认相机，不再为了 bounds 读取完整行政区 outline。

边界源里的 `adcode`、`shapeName`、`gn_a1_code`、`iso_3166_2` 等字段只在生成阶段使用。发布到前端的 MVT 只保存渲染和 hover 需要的最小属性；国家、一级/二级区域名称优先来自 `cities.json` 和天气 summary，边界自身的 `labelZh` / `labelEn` 只作为无数据区域 hover 兜底。只需要地点名字、搜索或城市选择的场景只读取 `cities.json`，不加载地图瓦片。

## 文件预算

估算口径是 5,000 个以内城市、14 天预报窗口、国家/一级区域边界，以及覆盖设计要求的 C3 二级区域边界。尺寸按当前 3,841 个城市和三档 MVT 产物校准；公开数据预算只记录原始尺寸，线上响应压缩由部署平台确认。

| 文件 | 用途 | 何时读取 | 数量 | 原始尺寸 |
| --- | --- | --- | ---: | ---: |
| `/data/cities.json` | 城市主索引 | Weather Map 和 City Finder 都会读取 | 1 | 0.5-0.8 MiB |
| `weather/current.json` | 活跃天气入口 | 进入工具页后读取；短缓存，用来发现天气是否更新 | 1 | < 2 KiB |
| `weather/forecast-14d/<date>.bin` | 14 天预报包 | 读取 current 后加载；City Finder 用它筛选天气，Weather Map 用它按日期和图层着色 | 1 个活跃 forecast | 0.7-1.0 MiB |
| `/data/geo/region-tiles/manifest.json` | 边界瓦片 manifest | Weather Map 初始化时读取或由前端内置路径约定替代 | 1 | < 5 KiB |
| `/data/geo/region-tiles/**/*.mvt` | 三档边界瓦片 | MapLibre 按 viewport / zoom 按需读取 | 当前 659 个 MVT | 7.63 MiB 总原始体积 |

一个活跃快照约 10 个公开数据文件：Pages 侧 8 个，R2 侧 2 个。R2 如果保留 30 天历史预报包，会额外增加 30 个 `weather/forecast-14d/<date>.bin`，但用户默认只读取 `weather/current.json` 指向的一个 forecast 文件。

City Finder 只需要 `cities.json`、`weather/current.json` 和 `weather/forecast-14d/<date>.bin`，压缩后通常在 0.5-0.9 MiB。Weather Map 不再下载完整 GeoJSON 边界包，地图首屏只读取当前视口覆盖到的少量 MVT；拖动或缩放只补新进入视口和新 zoom 档需要的 tile，已读 tile 由浏览器和 CDN 缓存复用。

当前卡顿风险主要来自地图初始化、可见 tile 解析、城市/天气矩阵解码和图层样式更新。MVT 把边界解析限制在当前视口和 zoom 档，避免浏览器一次 `JSON.parse` 十几 MiB 行政区几何。工具页仍会在客户端解码城市、创建天气 `TypedArray` view、构建地区选项和组装地图 payload；低端移动设备上，地图初始化、14 天预热和地区选项构建仍需观察。

| 文件 | 上限 |
| --- | ---: |
| `weather/forecast-14d/<date>.bin` | 原始尺寸 < 2 MiB，压缩尺寸 < 1 MiB |
| `cities.json` | 原始尺寸 < 1.5 MiB，压缩尺寸 < 500 KiB |
| `region-tiles/**/*.mvt` | 文件数量保持在千级以内，最大单 tile 原始体积低于 300 KiB |
| Pages 单文件硬边界 | 25 MiB |

MVT 文件数量通过三档模型控制：`z1-z2` 生成 country，`z3-z4` 生成 admin1/fallback，`z5` 生成 admin2/fallback，`z6-z8` overzoom z5。高 zoom 不继续逐级切片，避免 R2 对象数和地图请求数按四叉树膨胀。如果 `weather/forecast-14d/<date>.bin` 接近 2 MiB，先评估字段裁剪、bitmap 缺测、按默认日期拆出 Weather Map 轻包和 Web Worker 解析，不直接改成请求时数据库查询。

## 数据格式选择

`cities.json` 继续使用 compact JSON。城市索引需要名称、国家、行政区和坐标等结构化字段，当前约 0.5 MiB 原始尺寸不构成主要风险；短字段、字典表和 gzip / Brotli 已经能把传输压到几百 KiB。

天气预报使用定长二进制矩阵。天气数据是 `date x city x numeric fields`，字段稳定且多数是数值；forecast bin 先保存 `cityId[]` 和 `date[]` 字典，再把温度、降水、湿度、风速、天气码和缺测标记写进 `ArrayBuffer` / TypedArray。温度、降水和风速按 0.1 单位整数化，湿度和天气码用 `Uint8`，缺测用 byte 或后续 bitmap。这样浏览器不需要为 4 万多条日预报创建大量长期 JS object，解析成本变成 `fetch arrayBuffer + DataView/TypedArray 视图`。具体方案见 `docs/specs/41-weather-matrix-performance.md`。

MessagePack、CBOR 和 protobuf 可以减少原始文本尺寸，但在浏览器里仍需要解码成对象或数组；对当前 forecast 这种规则矩阵，收益通常不如自定义定长二进制明显。Parquet、SQLite/WASM 更适合分析或本地数据库场景，不适合作为公开工具页首屏默认格式。

CSV / TSV 只适合离线交换和人工检查，不适合作为前端运行时天气格式。手写 CSV 解析必须处理转义、换行、空值、类型转换和列版本；即使用严格 TSV 避开大部分转义，浏览器仍要先把整段文本拆行、拆列、转数字，再组装索引。对天气这种固定字段矩阵，CSV 比 compact JSON 少不了多少传输体积，解析可靠性和 CPU 成本都不如 TypedArray 二进制。

地图边界使用 MVT。GeoJSON 仍可作为离线生成中间产物和审计输入，但前端运行时不再把 GeoJSON 作为地图边界渲染格式。PMTiles 可以作为后续对象数量优化层评估；确认 R2 Range Request、CDN 缓存和 MapLibre protocol 链路前，当前发布形态保持普通静态 `.mvt` 文件。

## 拆分与缓存

| 维度 | 做法 | 原因 |
| --- | --- | --- |
| 城市 | 全部城市放入 `cities.json` | 5,000 个以内城市仍适合本地搜索和筛选 |
| 城市字段 | 白名单 compact 字段 | 避免提交 GeoNames 原始大字段和内部字段 |
| 天气 | 14 天合并为 `weather/forecast-14d/<date>.bin` | City Finder 需要完整窗口，本地筛选最简单 |
| 日期 | 不拆 | 切日期无需请求，减少状态复杂度 |
| 图层 | 不拆天气 | 图层只是 UI 展示字段，不是天气存储维度 |
| 地区 | 不拆天气 | World 展示全部城市，国家/大区由前端过滤 |
| 地图边界 | 三档 MVT：country / admin1 / admin2 | 按 viewport 和 zoom 档加载；z5 高精度 overzoom 到 z8，减少小文件和请求数 |
| 搜索索引 | 先不单独拆 | 城市数不大；移动端卡顿后再生成轻量 search index |

当 `weather/forecast-14d/<date>.bin` 下载、解析或筛选影响移动端体验时，先引入 Web Worker 或按地区生成搜索/筛选索引；不要直接把请求时数据库查询作为第一选择。

| 文件 | 缓存 |
| --- | --- |
| `/data/cities.json` | 随 Pages 发布，可长缓存；文件名或构建 hash 变化时更新 |
| `weather/current.json` | 短缓存，5-15 分钟，或使用 ETag |
| `weather/forecast-14d/<date>.bin` | 长缓存，`public, max-age=31536000, immutable` |
| `geo/region-tiles/**/*.mvt` | 随 Pages 发布，可长缓存；文件名或构建 hash 变化时更新 |

每天只上传新的 forecast 文件，并在校验通过后更新 `weather/current.json` 指向新文件。

## 扩展条件

| 条件 | 动作 |
| --- | --- |
| 城市数接近 10,000 | 评估 `weather/forecast-14d/<date>.bin` 下载、解析和筛选耗时 |
| City Finder 在移动端筛选卡顿 | 引入 Web Worker、轻量搜索索引或按地区懒加载 |
| MVT 最大单 tile 接近 300 KiB 或低端设备解析慢 | 提高该档实际切片 zoom 或加强 simplify |
| MVT 请求数接近 R2 Class B 额度 | 降低高 zoom 实际切片层级、加强 CDN 缓存或评估 PMTiles |
| R2 Class B 读请求接近额度 | 增加 Cloudflare Cache、合并请求、调整缓存和热门路径预取 |
| Open-Meteo public API 不符合用途或 SLA | 评估 Open-Meteo customer API、商业许可或替代天气源 |
| 需要用户收藏、个性化、权限或保存筛选 | 引入后端 API 和数据库 |
| 城市数达到 40,000+ 或需要复杂服务端查询 | 按 Pro 版方案评估数据库查询 |

## 落地检查

| 检查项 | 标准 |
| --- | --- |
| 城市字段 | `cities.json` 包含 C1/C2/C3、country/admin1/admin2，并能生成稳定 `regionKey` |
| 天气关联 | 城市和天气只通过 `cityId` 关联，`cv` 只用于版本识别 |
| 天气格式 | forecast bin 先保存 `cityId[]` 和 `date[]`，天气字段按 `dateIndex * cityCount + cityIndex` 读取 |
| 日期语义 | 天气日期按地点当地自然日处理，不做 UTC 日期截断 |
| 边界字段 | MVT 发布字段只保留 `regionKey`、层级、国家/行政区 code、天气粒度和 hover 兜底名 |
| 前端请求 | City Finder 不加载地图边界；Weather Map 只按 viewport / zoom 读取 MVT |
| 缓存 | current 短缓存，forecast 和边界长缓存 |
| 尺寸报告 | 构建或生成脚本输出每个公开 JSON / MVT / `.bin` 的原始尺寸和压缩尺寸，并检查是否超过预算 |
