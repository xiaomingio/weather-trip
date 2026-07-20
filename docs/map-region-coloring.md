# Map Region Coloring and Selection Spec

## 适用范围

本文档是地图区域着色、地图选择和视野框选的规则真源。筛选表单、地图点击、URL query、区域 GeoJSON 和区域天气聚合都按这里的定义对齐。

地图区域着色用于表达天气层的空间分布，不能把所有地区都按同一种行政粒度处理。全球、大洲和国家视图使用同一套自适应规则：先保证全球都有面状颜色，再根据当前选择范围和国家体量提升到更细的行政层级。

## 粒度规则

| 视图范围 | 着色粒度 | 说明 |
| --- | --- | --- |
| 全球 | 国家级为主，大国可叠加一级行政区 | 保证世界地图整体有颜色，避免欧洲小国和岛国被拆得过碎 |
| 大洲 | 国家级为主，大国可叠加一级行政区 | 用户看的是区域分布，国家级更稳定；面积大、气候差异大的国家允许细化 |
| 详细国家 | 按 `detailedCoverage` 决定 | `docs/city-selection.md` 中有 `detailedCoverage` 的国家才开放国家下钻；中国天气点按地级行政区代表点生成，其它当前详细国家按一级行政区代表点生成 |
| 中国省级筛选 | 中国省级区域 | 中国继续使用省级面作为主要区域层，城市点作为样本补充 |
| 未开放选择的国家 | 不单独处理 | 这些国家在全球和大洲视图中按国家级参与着色，不提供单国细分体验 |

详细国家的真源是 `data/city-selection/country-profiles.json` 的 `detailedCoverage` 字段，并由 `docs/city-selection.md` 解释其选择原因。当前详细国家包括中国、美国、日本、法国、西班牙、意大利、墨西哥、泰国、土耳其、英国、德国、加拿大和澳大利亚。中国的天气点用 `admin2` 覆盖地级市、地区、自治州、盟和直辖市代表点；其它当前详细国家用 `admin1` 覆盖州、都道府县、省/大区等一级行政区代表点。

## 国家分层

| 类别 | 国家或地区 | 地图处理 |
| --- | --- | --- |
| 详细国家 | 中国、美国、日本、法国、西班牙、意大利、墨西哥、泰国、土耳其、英国、德国、加拿大、澳大利亚 | 国家视图展开该国详细天气点；全球和大洲视图只使用精选点，避免详细国家样本压过其它国家 |
| 重点旅游国家 | `country-profiles.json` 中没有 `detailedCoverage` 的 `major` / `regional` 国家 | 全球和大洲视图按国家级展示；加入 `detailedCoverage` 后才提供国家级下钻 |
| 小国、岛国、城市国家 | 新加坡、香港、澳门、马尔代夫、马耳他等 | 国家级或点位展示，不默认拆一级行政区 |
| 其它国家 | 未配置为可选国家或重点细分国家的地区 | 国家级展示 |

## 区域数据模型

区域 summary 应使用通用区域 key，不再绑定中国 `adcode`。中国 `adcode` 只作为中国省级 GeoJSON 的展示层映射。

```ts
type MapRegionLevel = 'country' | 'admin1';

type MapRegionKey =
  | `country:${string}` // ISO 3166-1 alpha-2，例如 country:FR
  | `admin1:${string}.${string}`; // GeoNames admin1 code，例如 admin1:US.CA

type MapRegionSummary = {
  id: MapRegionKey; // 区域稳定 ID
  level: MapRegionLevel; // 当前 summary 的行政层级
  countryCode: string; // ISO 3166-1 alpha-2
  admin1Code?: string; // level 为 admin1 时填写
  name: string; // 当前 locale 下可展示名称
  cityCount: number; // 参与聚合的城市样本数
  weatherType: WeatherType; // 城市样本中的主天气
  temperatureMeanC: number; // 样本平均温度
  humidityMeanPercent: number; // 样本平均湿度
  elevationMeters: number; // 样本平均海拔
  precipitationSumMm: number; // 样本平均降水
  comfortScore: number; // 单日舒适度或旅行匹配比例
  matchDays: number; // 旅行筛选命中天数
  totalDays: number; // 旅行筛选总天数
};
```

## 聚合规则

全球和大洲视图先按国家聚合所有可见城市样本。这里的“可见城市样本”不是 `cities` 全量，而是 `docs/city-selection.md` 中定义的全球/洲际精选集合：`tourism:*`、`feature:PPLC`、`population:country-profile`。详细国家的行政代表点只在进入对应国家或省州视图后参与展示。

国家视图按该国 `detailedCoverage` 聚合。用户选择任一详细国家时，地图应显示该国的细分区域着色，而不是只显示国家整体颜色。若某个区域没有天气样本，该区域不着色或使用低透明度空态，不用邻近区域推断。

小国、岛国和城市国家不默认生成一级行政区 summary。它们的天气差异主要通过城市点位表达，面状颜色停留在国家级。

## 选择规则

地图选择和筛选表单共用同一个 `region` 真源。`region` query 始终保存最终生效地区：第一层国家或大区使用 `world`、`europe`、`country:US` 这类值；第二层区域使用 `province:530000` 或 `admin1:US.CA` 这类值。页面刷新、分享链接和语言切换都按这个最终地区恢复，再反推第一层列表和第二层列表的选中项。

地区筛选分成两个列表。第一个列表只放全球、主要大区和详细国家；第二个列表根据第一个列表动态显示该国家的省、州、都道府县或其它一级行政区。选择全球或大洲时，第二个列表不可用；选择中国时，第二个列表显示中国省级区域；选择其它详细国家时，第二个列表显示该国 GeoNames admin1 区域。

地图选择以着色区域面为单位，不以城市点或点位外接框为单位。用户点击可选国家、省、州或其它一级行政区时，系统更新最终 `region`，同步筛选列表和 URL；城市 marker 只用于选中城市详情，不改变地区筛选。

全球和大洲视图中，只有已经开放为详细国家的国家面可以通过地图点击进入国家视图。详细国家视图中，点击一级行政区面进入对应 `admin1:<country>.<code>` 或 `province:<adcode>`。未开放选择的国家仍参与国家级着色，但不通过地图点击进入单国下钻。

## 视野框选规则

切换地区时，地图视野要自动缩放到最终生效地区的着色区域范围，而不是只包住城市点位。切回 `world` 时回到全球着色范围；切到详细国家时框住该国全部已着色一级行政区；切到单个省、州或其它一级行政区时框住该行政区面。

视野框选优先使用当前地图层的 GeoJSON 面边界计算 bounds。只有当前区域没有可用面边界或没有区域 summary 时，才退回城市点 bounds。

跨 180 度经线的区域使用最短经度区间计算 bounds，避免阿拉斯加、太平洋岛国等区域把视野错误扩展到接近全球宽度。天气条件、时间窗口和图层变化不触发强制缩放，避免用户正在查看的地图位置被频繁重置。

## 视觉规则

面状颜色表达区域聚合结果，城市 marker 表达真实天气样本。区域层不能暗示没有样本的位置也有精确天气值；图例文案应说明面状颜色来自城市样本聚合。

全球和大洲视图中，国家级颜色优先保持连续可读。一级行政区只在大国范围内显示，边界线要弱于国家边界，避免地图变成行政区底图。

国家视图中，一级行政区是主层。城市 marker 继续显示，用于解释区域颜色来自哪些样本城市。

## 实现约束

地图底图和区域 GeoJSON 分开管理：世界国家边界、中国省级边界、其它大国一级行政区边界可以是不同数据源，但最终都映射到 `MapRegionKey`。

天气数据仍然来自 `cities` 和 `daily_forecasts`。区域着色不新增天气请求，只复用已有城市样本聚合结果。增加国家筛选项前，需要先保证该国一级行政区边界、GeoNames admin1 code 和城市样本能稳定对齐。

当前 Web 静态边界文件放在 `apps/web/public/data/geo/`：

```text
world-countries.geojson   # Natural Earth admin-0，属性使用 country:<ISO_A2>
detailed-admin1.geojson   # Natural Earth admin-1 详细国家子集，属性使用 admin1:<gn_a1_code>
china-provinces.geojson   # 中国省级边界，属性通过 adcode 映射到 province:<adcode>
```

详细国家一级行政区优先使用边界数据里的 `gn_a1_code`，因为它和 GeoNames `admin1CodesASCII.txt` 的代码一致；不要用展示名称或 ISO 3166-2 手工猜测区域对应关系。
