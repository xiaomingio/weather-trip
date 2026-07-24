# 天气矩阵二进制方案

## 文档边界

本文定义 14 天天气数据的 `.bin + ArrayBuffer` 公开格式、矩阵寻址和前端读取规则。公开数据文件、缓存和发布路径见 `docs/specs/32-public-data-contract.md`；数据刷新链路见 `docs/specs/31-data-flow.md`；地图边界性能优化见 `docs/specs/40-map-vector-tiles-performance.md`。

这个方案只改变天气快照的组织和前端读取方式，不改变城市选择、天气来源、评分规则、区域聚合口径和工具页交互。

## 目标

天气数据是稳定的 `date x city x weather fields` 矩阵。公开 forecast 包使用定长二进制字段数组，浏览器长期持有 `TypedArray`，只在 UI 边界临时组装当前列表、当前日期或选中城市需要的 `DailyForecast`。

| 目标 | 说明 |
| --- | --- |
| 降低内存和 GC 压力 | 不为每个城市每天创建长期存活的 JS object |
| 加快 Weather Map 日期读取 | 同一天的全部城市天气在每个字段里连续保存 |
| 保持跨文件安全关联 | forecast 包自带 `cityId[]`，跨 `cities.json` 和 forecast 仍用 `cityId` 对齐 |
| 减少解析中间态 | 浏览器用 `fetch(...).arrayBuffer()` 后直接创建 `TypedArray` view |
| 保持数字字段紧凑 | 温度、降水、风速按 0.1 单位整数化，天气码、湿度和缺测标记使用 byte |

## 核心模型

forecast 包内先保存 `cityId[]`，再保存 `date[]`。`cityId[]` 定义 `cityIndex -> cityId`，`date[]` 定义 `dateIndex -> date`。天气字段全部使用 date-major 矩阵：

```ts
const offset = dateIndex * cityCount + cityIndex;
```

```ts
type ForecastMatrix = {
  cityIds: string[]; // cityIndex -> cityId
  dates: string[]; // dateIndex -> date-only key
  indexByCityId: Map<string, number>; // cityId -> cityIndex
  indexByDate: Map<string, number>; // date -> dateIndex
  sourceElevationMeters: Int16Array; // cityIndex -> 天气源海拔；-32768 表示缺失
  fields: {
    weatherCode: Uint8Array;
    temperatureMinC10: Int16Array;
    temperatureMaxC10: Int16Array;
    temperatureMeanC10: Int16Array;
    humidityMeanPercent: Uint8Array;
    precipitationSumMm10: Uint16Array;
    windSpeedMaxKmh10: Uint16Array; // 65535 表示缺失
    missing: Uint8Array; // 1 表示该 city/date 缺测
  };
};
```

跨文件 join 规则：

```ts
const cityIndex = forecast.indexByCityId.get(city.id);
if (cityIndex === undefined) {
  // 城市在 cities.json 中存在，但当前天气包没有天气
}
```

forecast 包里存在、但 `cities.json` 中不存在的 `cityId` 在查询和展示时忽略。`current.cv` 和城市列表版本不一致时可以记录异常或上报，但不能退回到按数组下标对齐。

## Bin 布局

```text
forecast.bin
├── header
│   ├── magic = WTRP
│   ├── formatVersion = 2
│   ├── headerLength = 68
│   ├── fileLength
│   ├── cityCount / dateCount
│   ├── cityDictionaryOffset
│   ├── dateDictionaryOffset
│   └── sourceElevation / field offsets
├── city dictionary        # cityIndex -> cityId，Uint16 byteLength + UTF-8 bytes
├── date dictionary        # dateIndex -> date，Uint16 byteLength + UTF-8 bytes
├── sourceElevationMeters  # Int16Array[cityCount]
└── field arrays           # 每个字段 length = cityCount * dateCount
```

header 使用 little-endian 数字。`sourceElevationMeters` 和所有 16-bit 字段 offset 必须 2-byte aligned。

```ts
type ForecastBinHeader = {
  magic: 'WTRP';
  formatVersion: 2;
  headerLength: 68;
  fileLength: number;
  cityCount: number;
  dateCount: number;
  cityDictionaryOffset: number;
  dateDictionaryOffset: number;
  sourceElevationOffset: number;
  weatherCodeOffset: number;
  temperatureMinOffset: number;
  temperatureMaxOffset: number;
  temperatureMeanOffset: number;
  humidityOffset: number;
  precipitationProbabilityOffset: number;
  precipitationOffset: number;
  windOffset: number;
  missingOffset: number;
};
```

`.bin` 是离线生成产物，由 `scripts/generate-static-weather.ts` 从 Open-Meteo 响应写出，并上传到静态数据目录或 R2。浏览器只读取已生成的 `.bin`，不要先下载 JSON 再生成 `.bin`。

## 字段编码

| 字段 | 编码 | 缺失值 | 说明 |
| --- | --- | --- | --- |
| `cityIds` | UTF-8 字典 | - | 每项 `Uint16 byteLength + bytes` |
| `dates` | UTF-8 字典 | - | date-only 字符串，顺序必须等于 `current.ds` |
| `sourceElevationMeters` | `Int16Array` | `-32768` | 天气源本次响应的点位海拔 |
| `weatherCode` | `Uint8Array` | `missing=1` | Open-Meteo weather code 当前小于 100，保留 0-255 |
| `humidityMeanPercent` | `Uint8Array` | `missing=1` | 0-100 |
| `precipitationProbabilityMaxPercent` | `Uint8Array` | `missing=1` | Open-Meteo `precipitation_probability_max`，0-100；V2 forecast day 必填 |
| `temperatureMinC10` / `temperatureMaxC10` / `temperatureMeanC10` | `Int16Array` | `missing=1` | 摄氏度乘以 10 |
| `precipitationSumMm10` | `Uint16Array` | `missing=1` | mm 乘以 10 |
| `windSpeedMaxKmh10` | `Uint16Array` | `65535` | km/h 乘以 10；单字段缺失不代表整天缺测 |
| `missing` | `Uint8Array` | - | 1 表示该 city/date 没有可用天气 |

`weatherType` 和 `comfortScore` 不写入天气包，由前端根据 `weatherCode` 和共享评分公式计算。单位固定为摄氏度、毫米、公里/小时和百分比，不在每条记录里重复保存单位。

格式升级时先让 decoder 同时支持当前线上格式和新格式，再刷新并发布新的 forecast bin。新天气包已经写出后，不允许把前端 decoder 退回只支持旧格式；否则 Weather Map 必须仍降级显示地图边界，不能让天气解码错误阻断 MVT。

## 解码校验

前端默认只做结构校验，不每次计算 SHA。完整 hash 用在生成脚本、CI、上传验收和排查路径；`current.json` 保存 forecast 的字节数和 sha256。

| 检查 | 目的 |
| --- | --- |
| `magic === 'WTRP'` | 防止拿错文件 |
| `formatVersion` 在支持范围内 | 防止 decoder 读错协议 |
| `buffer.byteLength === fileLength` | 发现明显截断或错包 |
| `current.fb === buffer.byteLength` | 校验入口文件和 forecast 文件一致 |
| offset 单调且不越界 | 防止 TypedArray view 指向错误范围 |
| 16-bit 字段 offset 为偶数 | 保证 `Int16Array` / `Uint16Array` view 可创建 |
| field length 等于 `cityCount * dateCount * bytesPerValue` | 防止矩阵尺寸错位 |
| `date[]` 等于 `current.ds` | 防止入口日期窗口和 forecast 包错配 |

## 前端查询

Weather Map 读某一天时，先取 `dateIndex`，再顺序扫描城市：

```ts
for (const city of citiesInRegion) {
  const cityIndex = matrix.indexByCityId.get(city.id);
  if (cityIndex === undefined) continue;
  const offset = dateIndex * matrix.cityIds.length + cityIndex;
  if (matrix.fields.missing[offset]) continue;
  // 读取当前日期的天气字段
}
```

City Finder 读某个城市的 14 天窗口时，固定 `cityIndex` 后遍历日期：

```ts
for (let dateIndex = 0; dateIndex < dateWindowDays; dateIndex += 1) {
  const offset = dateIndex * matrix.cityIds.length + cityIndex;
  if (matrix.fields.missing[offset]) continue;
  // 读取 TypedArray 字段并计算 matchDays / score / bestStreakDays
}
```

UI 组件需要 `DailyForecast` 或现有 result item 时，只在当前列表页、选中城市预报或当前地图日期临时 materialize。`WeatherDataSnapshot` 不长期保存全量 `DailyForecast[]`。

## 加载策略

| 路径 | 天气加载 |
| --- | --- |
| Weather Map 首屏 | 读取 `current.json` 和 14 天 `.bin`，默认日期从 date-major 矩阵里连续读取 |
| Weather Map 切日期 | 从已加载矩阵读取对应日期 |
| City Finder | 从已加载矩阵扫描 3 / 5 / 7 / 10 / 14 天窗口 |
| 选中城市 Forecast panel | 从已加载矩阵读取该城市的 14 天 |

如果 `.bin` 解析或筛选仍影响低端移动端体验，再引入 Web Worker 或按地区生成轻量筛选索引；不要把请求时数据库查询作为公开免费版的首选路径。

## 验证

| 检查 | 目标 |
| --- | --- |
| 数据关联 | 城市新增、删除或重排时，天气不会错配到其他城市 |
| 日期关联 | `date[]` 和 `current.ds` 不一致时拒绝解码 |
| 缺测处理 | forecast 没有的城市或日期显示暂无天气，不抛错 |
| Weather Map | 默认日期、切日期、切图层和地区聚合结果一致 |
| City Finder | matchDays、score、bestStreakDays、排序和分页结果一致 |
| Forecast panel | 选中城市的 14 天预报内容一致 |
| 性能 | 对比 JS heap、主线程耗时和切 tab 体感 |

验收时同时看传输体积和解压后内存。gzip / Brotli 负责降低下载体积，`.bin + TypedArray` 负责降低浏览器解析中间态、对象数量和 GC 压力。
