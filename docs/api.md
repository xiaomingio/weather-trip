# Weather Tool API Spec

本文档定义 Web 工具页当前使用的公开 JSON 接口。接口只返回公开页面需要的数据；Postgres 仍是运行时数据真源，接口层只负责按业务视图组装 DTO、压缩和短缓存。

## 通用规则

所有接口都支持 `locale=en|zh`，省略时默认 `en`。不支持的 locale 返回 `400`。

所有响应都是 `application/json; charset=utf-8`，支持 `br` / `gzip` 压缩，缓存策略为 `public, max-age=60, stale-while-revalidate=120`。接口内部共享 60 秒天气快照缓存和 60 秒 JSON 响应缓存，但每条接口使用独立 cache namespace。

地区参数统一使用 `region`：

```ts
type RegionKey =
  | 'world'
  | 'asia'
  | 'east_asia'
  | 'southeast_asia'
  | 'europe'
  | 'north_america'
  | 'south_america'
  | 'africa'
  | 'oceania'
  | `country:${string}` // country:US
  | `partition:${string}.${string}`; // partition:US.CA
```

`partition` 是地图分块，不绑定固定行政层级。当前数据源主要来自国家级和一级行政区边界，后续可以换成更细分块，只要保持 `partition:<country>.<code>` 的稳定 key。

```ts
type MapBounds = [west: number, south: number, east: number, north: number];

type WeatherRegionOption = {
  id: RegionKey;
  label: string;
  group: string;
  mapLayer: 'country' | 'partition';
  bounds: MapBounds | null;
};
```

## 地区接口

`GET /api/regions.json`

用于加载一级地区列表。前端按 locale 加载一次，可复用到天气地图和城市查找两个 tab。

参数：

```ts
type RegionsParams = {
  locale?: 'en' | 'zh';
};
```

返回：

```ts
type RegionsPayload = {
  regions: WeatherRegionOption[];
};
```

`GET /api/subregions.json`

用于根据当前一级地区加载下级地图分块。切换一级地区后重新请求。

参数：

```ts
type SubregionsParams = {
  locale?: 'en' | 'zh';
  region: RegionKey;
};
```

返回：

```ts
type SubregionsPayload = {
  region: RegionKey;
  subRegions: WeatherRegionOption[];
};
```

## 天气地图

`GET /api/map-dates.json`

用于加载天气地图当前地区的可选日期。首屏先用它确定默认日期和日期控件范围。

参数：

```ts
type MapDatesParams = {
  locale?: 'en' | 'zh';
  region: RegionKey;
  date?: string; // YYYY-MM-DD；不在当前地区可用日期中时由服务端修正
};
```

返回：

```ts
type MapDatesPayload = {
  tool: 'weather-map';
  region: RegionKey;
  selectedDate: string;
  availableDates: string[];
  regionAvailableDates: string[];
};
```

`GET /api/weather-layers/{layer}.json`

用于加载天气地图某一类天气图层数据。`layer` 是资源路径的一部分；首屏请求必须带 `date`，只返回单日数据；页面渲染后再发不带 `date` 的请求，异步预取当前地区前 14 天数据。

不支持的 `layer` 表示资源不存在，返回 `404`。

参数：

```ts
type WeatherLayerParams = {
  layer: 'weather' | 'temperature' | 'humidity' | 'precipitation' | 'wind' | 'comfort' | 'elevation'; // 路径参数
  locale?: 'en' | 'zh';
  region: RegionKey;
  date?: string; // 带 date 返回单日；不带 date 返回前 14 天
};
```

返回：

```ts
type WeatherLayerPayload = {
  tool: 'weather-map';
  region: RegionKey;
  selectedDate: string;
  layer: WeatherLayerParams['layer'];
  days: Array<{
    date: string;
    resultItems: DashboardWeatherMapResultItem[];
    regionSummaries: RegionWeatherSummary[];
  }>;
};
```

## 城市查找

`GET /api/city-search.json`

用于按天气筛选条件返回城市列表和地图分块聚合。点选城市不会重新请求这个接口，城市详情走 `/api/city-forecast.json`。

参数：

```ts
type CitySearchParams = {
  locale?: 'en' | 'zh';
  region: RegionKey;
  days?: '3' | '5' | '7' | '10' | '14';
  temp?: 'off' | `${number},${number}`;
  weather?: 'off' | string; // 逗号分隔 WeatherType
  humidity?: 'off' | `${number},${number}`;
  precipitation?: 'off' | `${number},${number}`;
  wind?: 'off' | `${number},${number}`;
  elevation?: 'off' | `${number},${number}`;
};
```

返回：

```ts
type CitySearchPayload = {
  tool: 'city-finder';
  region: RegionKey;
  selectedDate: string;
  availableDates: string[];
  regionAvailableDates: string[];
  resultItems: DashboardCityFinderResultItem[];
  regionSummaries: RegionWeatherSummary[];
  selectedCityForecasts: [];
};
```

## 城市详情

`GET /api/city-forecast.json`

用于加载单个城市最近 14 天天气详情，天气地图和城市查找两个 tab 复用。

参数：

```ts
type CityForecastParams = {
  locale?: 'en' | 'zh';
  cityId: string;
};
```

返回：

```ts
type CityForecastPayload = {
  cityId: string | null;
  selectedCityForecasts: DailyForecast[];
};
```
