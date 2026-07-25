# Weather Trip Interaction Logic

## 文档边界

本文定义 Weather Trip 整个项目的交互逻辑：入口导航、语言和温度单位、URL 状态、Landing 到工具页的流转、工具页筛选、结果列表、选中城市、地图 marker 与预报面板联动。城市覆盖、行政分层和 `rank` 生成规则见 `docs/specs/30-weather-coverage-design.md`；公开数据如何用 `cities.c` 顺序传输 `rank` 见 `docs/specs/32-public-data-contract.md`；地图 hover、点击、相机、城市列表联动和 marker 密度细节见 `docs/specs/22-weather-map-interactions.md`；响应式布局见 `docs/specs/21-tool-responsive-layout.md`。

## 全局导航

顶部导航在 Landing、Weather Map 和 City Finder 保持同一套入口：品牌回到首页，工具 Tab 在 Weather Map 和 City Finder 之间切换，右侧保留温度单位和语言切换。顶部导航的结构和响应式细节见 `docs/specs/21-tool-responsive-layout.md`。

切换工具 Tab 时使用固定 URL，不携带当前工具的 query，也不把当前工具的 query 混到另一个工具。目标工具如果没有 URL query，就从自己的 `localStorage` 状态恢复；没有可恢复状态时使用默认状态。

语言切换使用另一种语言下的同一页面固定入口，不携带当前筛选 query。目标语言使用对应路径，英文默认路径不带语言前缀，中文路径加 `/zh`。

## Landing 流转

Landing page 只承担产品说明和工具入口，不承载地图筛选状态。用户从 Landing 进入 Weather Map 或 City Finder 时，工具页按自己的默认状态或上次保存状态初始化。

Landing 的温度单位切换会写入本地偏好；进入工具页后继续使用同一偏好展示温度。

## 共享偏好

温度单位是全站共享偏好，用户切换后写入本地存储。摄氏度和华氏度只影响 UI 展示，不改变天气包里的原始单位，也不改变 URL。

语言由路径表达，不写入工具 query。中文和英文共用同一份城市和天气数据，城市名、地区名、天气类型和界面文案按当前语言格式化。

## 页面状态

两个工具页用独立路径和 query 表达当前页可分享状态：

| 页面 | URL 状态 |
| --- | --- |
| Weather Map | `region`、`date`、`layer` |
| City Finder | `region`、`days`、`temp`、`weather`、`humidity`、`precipitation`、`wind`、`elevation` |

URL 只保存当前页面自己需要分享的业务状态。工具 Tab、语言切换和 Landing 入口不携带这些 query；每个工具页把自己的 query 另存到 `localStorage`，下次从固定入口进入同一工具时恢复。城市选中态、地图相机、结果列表滚动位置和刷新遮罩不写入 URL；其中地图相机只保存到本次浏览会话。

## 地区交互

地区入口包含全球、大区、C2/C3 国家，以及国家内一级区域。C3 二级区域只用于地图着色和 hover，不进入筛选下拉；旧 URL 或本地状态里出现 `admin2:*` 时，恢复到所属 `admin1:*`。

切换地区后，城市列表、地图 marker、区域聚合和日期可用范围都按新地区重算。地区变化不覆盖已有选中城市；如果当前没有选中城市且新结果非空，工具页选中当前列表第一项。

## 日期与图层

Weather Map 的日期滑块使用当前地区可用日期。切换地区时，如果原日期不可用，按滑块相对位置迁移到新地区日期，并把实际 date-only 值写回 URL。

图层切换只改变地图色彩、marker 指标、tooltip 指标和结果列表排序入口，不改变地区、日期、城市筛选或用户正在查看的地图相机。

## 默认城市顺序

前端把解码后的 `city.rank` 作为默认城市顺序。`rank` 越小，城市在默认列表和低 zoom marker 避让里的优先级越高。

默认顺序不是天气指标排序，也不是运行时人口排序。天气、温度、湿度、降水、风、海拔和舒适度只影响用户主动选择对应排序项后的列表顺序；默认体验先展示地图阅读锚点。

## Weather Map 结果列表

Weather Map 的排序下拉包含“默认 / Default”和各地图图层。默认排序使用 `city.rank` 升序，列表顶部优先出现高行政级别且人口更大的城市，例如人口最多的首都排在最前。

当用户按某个图层排序时，主排序使用该图层指标；指标相同或不可区分时，用 `city.rank` 兜底。公开运行时不依赖 `population` 字段排序，因为 `population` 不进入 public `cities.json`。

天气图层进入页面时使用默认排序。切换到数值图层时，列表跟随该图层排序；用户仍可从排序下拉切回默认。

## City Finder 结果列表

City Finder 主排序使用匹配分数和匹配天数。分数和匹配天数相同时，使用 `city.rank` 兜底，避免同分城市按缺失人口或当前数组偶然顺序展示。

City Finder 的筛选条件变化后，匹配分数、结果列表、地图 marker 和区域聚合都按新的天气窗口重算。结果为空时展示空状态，不保留上一轮结果假装可用。

## 选中城市

工具页没有任何选中城市且当前结果非空时，选中当前城市列表第一项，让 forecast 面板有可展示对象。用户点击列表项或地图 marker 后，选中城市以用户选择为准；筛选、搜索、排序、日期、图层和地区变化都不覆盖已有选中城市。

选中城市影响预报面板、对应 marker 的选中态和列表行选中态，不改变地区、日期、图层或排序。列表点击可以请求地图把对应 marker 移到舒适可视区域；地图 marker 点击可以请求虚拟列表瞬时滚动到对应行。具体联动见 `docs/specs/22-weather-map-interactions.md`。

## 城市 Marker 优先级

地图 marker 的颜色、文字和 tooltip 跟当前图层走；低 zoom 避让时的保留顺序跟默认城市顺序走。选中城市始终保留，其次保留 `rank` 更靠前的城市。这样缩小地图时，首都和主要行政中心会作为地理锚点优先出现，不会被当前天气值更高的普通城市挤掉。

## 加载与刷新

首屏没有数据时展示 loading 或空状态。已有数据刷新时保留旧内容，刷新完成后替换；失败时显示错误状态，不清空已经可读的上下文。地图和预报面板可以分别刷新，某个面板加载中不阻塞另一个面板继续展示旧数据。
