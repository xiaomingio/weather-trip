# 输入数据

这个目录保存人工或 AI 辅助判断后的 YAML 输入。这里的文件可复核、可 diff、可复跑；`data/generated/*` 和 `apps/web/public/data/*` 里的 JSON/GeoJSON 都由脚本生成，不手工修改。

## 文件

| 文件 | 来源 | 作用 | 消费脚本 |
| --- | --- | --- | --- |
| `coverage-rules.yml` | 人工维护 | 国家分档阈值、预算、人口兜底和 C2/C3 候选规则 | `scripts/generate-country-tier-candidates.ts`、`scripts/generate-country-profiles.ts` |
| `country-name-aliases.yml` | 人工维护 | 外部旅游来源国家名称到 ISO 国家码的别名对齐 | `scripts/generate-tourism-destinations.ts` |
| `tourism-destination-overrides.yml` | 人工整理，可由 AI 辅助从 raw 旅行清单、Wikivoyage、Wikidata、UNESCO、UN Tourism 和热门旅行样本中提出候选，再由人工复核后写入 | 确认目的地是否保留、映射到哪个 GeoNames 城市、使用哪种天气处理模式和权重 | `scripts/generate-tourism-destinations.ts` |
| `country-tier-countries.yml` | 人工复核 `data/report/country-tier-candidate-report.md` 后写入 | 国家层级人工复核名单；`countryTier: C1` 表示候选已复核但不升档，`reason` 只作为人工复核备注，不进入生成产物 | `scripts/generate-country-profiles.ts`、`scripts/generate-static-cities.ts`、`scripts/generate-static-geo.ts` |
| `geo-boundary-sources.yml` | 人工复核边界报告后写入 | 国家详情层级和 Natural Earth map unit 合并口径 | `scripts/generate-static-geo.ts` |

## 维护规则

需要人工复核、会随来源选择变化的个别对象补丁进入对应 input 文件；只有稳定、规范、能被同一套规则解释的大场景留在生成代码里，并用测试保护。中国直辖市按一级行政区承载天气样本、港澳台按中国边界 companion 区块处理，属于代码里的固定场景；少数名称、编码、来源层级或人工跳过项属于 input。新增旅游目的地、国家层级复核记录、人口兜底、边界来源或人工跳过项时，先看对应生成报告，再写 input，然后运行生成脚本；不要直接修改生成产物，也不要在 `apps/web/src` 里写国家或地区专属分支。

`geo-boundary-sources.yml` 只记录边界源层级选择和 Natural Earth map unit 合并口径，例如某国详情层需要取 geoBoundaries ADM3，或国家轮廓需要合并多个 Natural Earth 面。中国 DataV/高德 label 直接使用边界源自带名称；直辖市停在一级区块、GeoNames 中国 admin2 过滤这类固定口径由生成脚本负责，不再拆成 input 文件。

地图边界生成按 MVT 运行时分层做强校验：所有国家 `country:*` 必须出现在 `data/generated/geo/country.geojson`；C2 国家一级区域必须出现在 `data/generated/geo/c2_admin1.geojson`；C3 国家一级区域必须出现在 `data/generated/geo/c3_admin1.geojson`；C3 国家二级区域必须出现在 `data/generated/geo/c3_admin2/<countryCode>.geojson`。脚本按 profiles 选择边界精度，并尽量使用边界源自身的行政区；中国大陆和港澳台使用 DataV/高德。任何缺失、详情区块为空或 admin1 面积覆盖过低都会让 `scripts/generate-static-geo.ts` 失败退出；产物和 `data/report/geo-boundary-report.md` 会先写出，方便本地调试。

可自动抽取的旅行目的地来源放在 `data/raw/tourism-destinations/`，混合后的旅游目的地输入写入 `data/generated/tourism-destinations.jsonl`。AI 可以辅助提出候选、补 geonameId、解释为什么某个目的地值得保留、核对边界 code 映射，但生成链路只读取 raw、YAML input 和生成产物，不读取聊天记录、临时分析或不可复跑的外部状态。
