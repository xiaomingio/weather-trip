# 天气矩阵性能优化方案

## 文档边界

本文定义 14 天天气数据在前端的数组化和矩阵化方案。公开数据文件、缓存和现有 Wire JSON 见 `docs/specs/32-public-data-contract.md`；数据刷新链路见 `docs/specs/31-data-flow.md`；地图边界性能优化见 `docs/specs/42-map-vector-tiles-performance.md`。

这个方案只改变天气快照的组织和前端读取方式，不改变城市选择、天气来源、评分规则、区域聚合口径和工具页交互。

## 目标

天气数据是稳定的 `city x date x weather fields` 矩阵。当前应用把天气解码为大量 `DailyForecast` 对象，容易增加主线程对象分配和 GC 压力。优化目标是让运行时长期持有紧凑数组，只在 UI 边界临时组装少量展示对象。

| 目标 | 说明 |
| --- | --- |
| 降低内存和 GC 压力 | 不为每个城市每天创建长期存活的 JS object |
| 加快筛选和排序 | City Finder 顺序扫描 TypedArray；Weather Map 按日期直接读同一列 |
| 保持跨文件安全关联 | 跨 `cities.json` 和 forecast 包仍用 `cityId` 对齐，不用裸 index 对齐 |
| 支持渐进迁移 | 先保留 JSON wire，前端解码成矩阵；稳定后再评估 `.bin` |
| 降低首屏阻塞 | Weather Map 默认日期和 City Finder 14 天窗口按用户路径加载 |

## 核心模型

矩阵内部用 `cityIndex` 和 `dateIndex` 定位；跨文件关联只用 `cityId`。forecast 包必须带自己的 `cityIds` 顺序，不能假设它和 `cities.json` 的城市数组顺序一致。

```ts
type ForecastMatrix = {
  version: string; // 天气快照版本
  cityListVersion: string; // 生成天气时读取的 cities 版本，用于校验和排查
  cityIds: string[]; // forecast 自己的城市顺序
  dates: string[]; // 日期窗口，dateIndex 以此为准
  indexByCityId: Map<string, number>; // cityId -> cityIndex
  indexByDate: Map<string, number>; // date -> dateIndex
  fields: {
    weatherCode: Uint8Array;
    temperatureMinC10: Int16Array;
    temperatureMaxC10: Int16Array;
    temperatureMeanC10: Int16Array;
    humidityMeanPercent: Uint8Array;
    precipitationSumMm10: Uint16Array;
    windSpeedMaxKmh10: Uint16Array;
    missing: Uint8Array; // 或 bitmap；标记该 city/date 是否缺测
  };
};
```

索引公式固定：

```ts
const offset = cityIndex * dateCount + dateIndex;
```

跨文件 join 规则：

```ts
const cityIndex = forecast.indexByCityId.get(city.id);
if (cityIndex === undefined) {
  // 城市在 cities.json 中存在，但当前天气包没有天气
}
```

forecast 包里存在、但 `cities.json` 中不存在的 `cityId` 在解码或查询时忽略。`cityListVersion` 不一致时可以记录异常或上报，但不能退回到按数组下标对齐。

## Wire 形态

第一步可以继续使用 JSON，只把 forecast wire 调整为矩阵数组。这样不用一次引入自定义二进制协议，也能让前端内部模型和后续 `.bin` 兼容。

```ts
type ForecastMatrixWire = {
  v: string; // 天气快照版本
  cv: string; // city list version
  ds: string[]; // dates
  c: string[]; // cityIds
  f: {
    wc: number[]; // weatherCode
    tmin10: number[];
    tmax10: number[];
    tmean10: number[];
    rh: number[];
    pcp10: number[];
    wind10: number[];
    miss: number[]; // byte array 或后续 bitmap
  };
};
```

JSON wire 读取后立即转成 TypedArray。应用内部不长期保存 `DailyForecast[]` 全量对象。

```ts
function decodeForecastMatrix(wire: ForecastMatrixWire): ForecastMatrix {
  return {
    version: wire.v,
    cityListVersion: wire.cv,
    cityIds: wire.c,
    dates: wire.ds,
    indexByCityId: new Map(wire.c.map((cityId, index) => [cityId, index])),
    indexByDate: new Map(wire.ds.map((date, index) => [date, index])),
    fields: {
      weatherCode: Uint8Array.from(wire.f.wc),
      temperatureMinC10: Int16Array.from(wire.f.tmin10),
      temperatureMaxC10: Int16Array.from(wire.f.tmax10),
      temperatureMeanC10: Int16Array.from(wire.f.tmean10),
      humidityMeanPercent: Uint8Array.from(wire.f.rh),
      precipitationSumMm10: Uint16Array.from(wire.f.pcp10),
      windSpeedMaxKmh10: Uint16Array.from(wire.f.wind10),
      missing: Uint8Array.from(wire.f.miss)
    }
  };
}
```

第二步再评估二进制 wire。`.bin` 可以把 header、`cityIds` 字典、日期和字段数组写进 `ArrayBuffer`，浏览器用 `fetch(...).arrayBuffer()` 后创建 TypedArray view。二进制 wire 的主要收益不是压缩传输，而是减少解析、对象分配和中间数组。

`.bin` 内必须保存自己的 `cityIds` 字典。这个字典定义 `cityIndex -> cityId`，让天气矩阵的每一行都能在文件内部解释清楚。前端 decode 后再从这个字典创建 `cityId -> cityIndex` Map，用于按城市查询天气；这个 Map 只有城市数量级，成本远小于保存全量 `DailyForecast[]` 对象。第一版不需要在 `.bin` 内实现哈希表或二分索引，协议复杂度不值得。

```text
forecast.bin
├── header
│   ├── magic / formatVersion
│   ├── fileLength
│   ├── cityCount / dateCount
│   ├── cityDictionaryOffset
│   ├── dateDictionaryOffset
│   └── field offsets
├── city dictionary        # cityIndex -> cityId
├── date dictionary        # dateIndex -> date
└── field arrays           # offset = cityIndex * dateCount + dateIndex
```

`.bin` 是离线生成产物，应在天气刷新脚本里由现有 forecast 数据生成，并上传到静态数据目录或 R2。用户打开页面时只读取和 decode 已生成的 `.bin`，不要在浏览器加载 JSON 后再生成 `.bin`；那样只会增加一次额外转换，不能减少首屏下载和解析成本。生成器本身可以用 JS / TS 写，逻辑主要是字段缩放、范围校验、offset 计算、padding 对齐和写入 `Buffer`。

## 格式取舍与校验

Protobuf 是成熟的 schema + 二进制序列化方案。它通过 `.proto` 文件定义字段编号和类型，再用生成器产生 encoder / decoder。它适合结构化 API、跨语言数据交换和需要字段兼容演进的对象数据；对天气矩阵也可以定义 `repeated int32 temperature_mean_c10`、`repeated uint32 humidity` 这类字段。

这个项目的天气数据更适合自定义 `.bin + ArrayBuffer`。原因是 forecast 是固定的矩阵和数值列，自定义 bin 可以直接落到 `Uint8Array`、`Int16Array`、`Uint16Array` 等 TypedArray 布局。Protobuf 虽然成熟，但前端 decoder 通常仍会把 repeated 字段解成普通 JS array 或对象结构，后续还要再转 TypedArray，不能最大化减少中间态和内存分配。

| 方案 | 优点 | 代价 | 结论 |
| --- | --- | --- | --- |
| 矩阵 JSON + TypedArray | 实现简单，容易调试，能先优化长期内存 | 仍有 `JSON.parse` 和 JS number 数组中间态 | 第一阶段 |
| Protobuf | schema 成熟，兼容演进和跨语言生态好 | 前端仍需 decoder，通常还会产生 JS array / object 中间态 | 备选，不作为首选 |
| 自定义 `.bin + ArrayBuffer` | 最贴近 TypedArray，解析和内存最轻 | 需要维护 header、版本、offset、校验和 dump 工具 | 推荐目标方案 |

bin header 应支持低成本结构校验。前端默认只做 O(1) 校验，不每次计算 CRC 或 SHA：

```ts
type ForecastBinHeader = {
  magic: 'WTRP';
  formatVersion: number;
  fileLength: number; // 必须等于 buffer.byteLength
  cityCount: number;
  dateCount: number;
  cityDictionaryOffset: number;
  dateDictionaryOffset: number;
  fieldOffsets: Record<string, number>;
};
```

decode 时至少检查：

| 检查 | 目的 |
| --- | --- |
| `magic === 'WTRP'` | 防止拿错文件 |
| `formatVersion` 在支持范围内 | 防止 decoder 读错协议 |
| `buffer.byteLength === fileLength` | 发现明显截断或错包 |
| offset 单调且不越界 | 防止 TypedArray view 指向错误范围 |
| field length 等于 `cityCount * dateCount * bytesPerValue` | 防止矩阵尺寸错位 |

完整 hash 适合放在生成脚本、CI、上传验收和 debug 模式里，不作为前端默认路径。`current.json` 可以保存 `forecastBinBytes` 和 `forecastBinSha256` 供发布链路和排查使用；前端默认依赖 HTTP / HTTPS、压缩流完整性、`Content-Length` 和 bin header 结构校验。

## 字段编码

JS 支持用 TypedArray 读写紧凑整数数组。天气字段应按取值范围选择最小安全类型，并把小数转成整数保存。

| TypedArray | 每项字节 | 范围 | 适合字段 |
| --- | ---: | --- | --- |
| `Uint8Array` | 1 | 0-255 | 天气码、湿度、缺测标记、布尔状态 |
| `Int8Array` | 1 | -128-127 | 小范围有符号枚举，天气数据通常少用 |
| `Uint16Array` | 2 | 0-65,535 | 降水、风速、非负整数化指标 |
| `Int16Array` | 2 | -32,768-32,767 | 温度、体感温度等可能为负的整数化指标 |
| `Uint32Array` | 4 | 0-4,294,967,295 | 大范围 id 或累计量，默认避免用于逐日天气字段 |
| `Float32Array` | 4 | 约 7 位有效数字 | 只有小数范围不稳定且整数化不合适时使用 |

字段建议：

| 字段 | 编码 | 说明 |
| --- | --- | --- |
| `weatherCode` | `Uint8Array` | Open-Meteo weather code 当前小于 100，保留 0-255 足够 |
| `humidityMeanPercent` | `Uint8Array` | 0-100 |
| `temperatureMinC10` / `temperatureMaxC10` / `temperatureMeanC10` | `Int16Array` | 摄氏度乘以 10；-3276.8 到 3276.7 C 范围足够 |
| `precipitationSumMm10` | `Uint16Array` | mm 乘以 10；最大 6553.5 mm，逐日降水足够 |
| `windSpeedMaxKmh10` | `Uint16Array` | km/h 乘以 10；最大 6553.5 km/h，逐日风速足够 |
| `missing` | `Uint8Array` 或 bitmap | `Uint8Array` 简单；bitmap 更小但读写复杂 |

JSON wire 里数字仍会先成为 JS number，之后再转 TypedArray；这一步已经能减少长期内存占用。二进制 wire 可以直接落到同样的 TypedArray 布局，避免 JSON 数组和 number 中间态。

## 前端查询

Weather Map 读某一天时，只需要当前 `dateIndex` 的矩阵列：

```ts
function readCityDay(matrix: ForecastMatrix, cityId: string, date: string) {
  const cityIndex = matrix.indexByCityId.get(cityId);
  const dateIndex = matrix.indexByDate.get(date);
  if (cityIndex === undefined || dateIndex === undefined) return null;

  const offset = cityIndex * matrix.dates.length + dateIndex;
  if (matrix.fields.missing[offset]) return null;

  return {
    weatherCode: matrix.fields.weatherCode[offset],
    temperatureMeanC: matrix.fields.temperatureMeanC10[offset] / 10,
    humidityMeanPercent: matrix.fields.humidityMeanPercent[offset],
    precipitationSumMm: matrix.fields.precipitationSumMm10[offset] / 10,
    windSpeedMaxKmh: matrix.fields.windSpeedMaxKmh10[offset] / 10
  };
}
```

City Finder 仍然需要扫描 14 天窗口，但扫描对象是紧凑数组：

```ts
for (const city of citiesInRegion) {
  const cityIndex = matrix.indexByCityId.get(city.id);
  if (cityIndex === undefined) continue;

  const rowOffset = cityIndex * matrix.dates.length;
  for (let dateIndex = 0; dateIndex < dateWindowDays; dateIndex += 1) {
    const offset = rowOffset + dateIndex;
    if (matrix.fields.missing[offset]) continue;
    // 读取 TypedArray 字段并计算 matchDays / score / bestStreakDays
  }
}
```

UI 组件需要 `DailyForecast` 或现有 result item 时，只在当前列表页、选中城市预报或当前地图日期临时 materialize。不要重新生成全量 `DailyForecast[]`。

## 加载策略

Weather Map 和 City Finder 对天气窗口的需求不同，加载策略也应分开。

| 路径 | 天气加载 |
| --- | --- |
| Weather Map 首屏 | 加载默认日期轻包，或从已加载矩阵读取默认日期；不在首屏预热全部 14 天 |
| Weather Map 切日期 | 按需加载对应日期轻包，或从 14 天矩阵读取该日期 |
| City Finder | 进入工具页或开始筛选时加载 14 天矩阵 |
| 选中城市 Forecast panel | 从 14 天矩阵读取该城市；如果未加载矩阵，可按 chunk 懒加载城市详情 |

静态免费版可以先采用“City Finder 加载 14 天矩阵，Weather Map 首屏加载默认日期轻包”的组合。这样地图首屏更轻，City Finder 仍保留本地筛选能力。

## 迁移步骤

1. 新增 `ForecastMatrix` domain model 和矩阵查询函数，保持现有 Wire JSON 不变，先在 decode 后转 TypedArray。
2. 把 Weather Map 单日 payload、City Finder scoring、Forecast panel 改为读取矩阵查询函数。
3. 删除长期保存的全量 `DailyForecast[]` 快照，只在 UI 边界临时生成展示对象。
4. 生成矩阵 JSON wire，减少嵌套 day tuple 和重复字段。
5. 拆出 Weather Map 默认日期轻包，City Finder 继续加载 14 天矩阵。
6. 如果内存或解析仍然卡顿，再把矩阵 JSON wire 替换为 `.bin + ArrayBuffer`。

每一步都要保持 `cityId` 是跨文件关联真源。任何使用数组下标跨 `cities.json` 和 forecast 文件对齐的实现都应视为错误。

## 验证

| 检查 | 目标 |
| --- | --- |
| 数据关联 | 城市新增、删除或重排时，天气不会错配到其他城市 |
| 缺测处理 | forecast 没有的城市或日期显示暂无天气，不抛错 |
| Weather Map | 默认日期、切日期、切图层和地区聚合结果与旧实现一致 |
| City Finder | matchDays、score、bestStreakDays、排序和分页结果与旧实现一致 |
| Forecast panel | 选中城市的 14 天预报与旧实现一致 |
| 性能 | Edge / Chrome DevTools 对比 JS heap、主线程耗时和切 tab 体感 |

验收时同时看传输体积和解压后内存。JSON / Brotli 可以降低下载体积，但矩阵和 TypedArray 负责降低浏览器内部对象数量、扫描成本和 GC 压力。
