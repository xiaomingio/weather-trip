# 地图边界报告

生成时间：`2026-07-24T12:16:12.677Z`
国家分层版本：`country-profiles-3d5372799eab`

## 生成检查

全部通过。

## 全球视图覆盖

| 预期国家 | 生成国家 | 预期 regionKey | 生成 regionKey | geometry 点位校验 regionKey |
| ---: | ---: | ---: | ---: | ---: |
| 245 | 245 | 1049 | 1049 | 1023 |

## 边界包

| 路径 | feature 数 |
| --- | ---: |
| data/generated/geo/country.geojson | 245 |
| data/generated/geo/c2_admin1.geojson | 695 |
| data/generated/geo/c3_admin1.geojson | 109 |
| data/generated/geo/c3_admin2/CN.geojson | 397 |
| data/generated/geo/c3_admin2/ES.geojson | 52 |
| data/generated/geo/c3_admin2/FR.geojson | 96 |
| data/generated/geo/c3_admin2/IT.geojson | 107 |
| data/generated/geo/c3_admin2/PE.geojson | 191 |

## 国家

| 国家 | 档位 | admin1 | admin2 | 仅边界 | 来源 | 缺 admin1 | 缺 admin2 |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: |
| AR | C2 | 24/24 | 0/0 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin1 | 0 | 0 |
| AU | C2 | 8/8 | 0/0 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin1 | 0 | 0 |
| BR | C2 | 27/27 | 0/0 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin1 | 0 | 0 |
| CA | C2 | 13/13 | 0/0 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin1 | 0 | 0 |
| CL | C2 | 16/16 | 0/0 | 0 | Natural Earth 10m admin1 grouped to GeoNames admin1 by city points | 0 | 0 |
| CN | C3 | 31/31 | 357/357 | 13 | Natural Earth 10m admin1 gn_id -> GeoNames admin1, DataV/高德（Amap） province full boundary converted by adcode, DataV/高德（Amap） Hong Kong/Macau/Taiwan detail boundary | 0 | 0 |
| CO | C2 | 33/33 | 0/0 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin1 | 0 | 0 |
| EG | C2 | 27/27 | 0/0 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin1 | 0 | 0 |
| ES | C3 | 19/19 | 52/52 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin2 grouped to admin1, geoBoundaries gbOpen ADM2 simplified | 0 | 0 |
| FR | C3 | 13/13 | 96/96 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin2 grouped to admin1, geoBoundaries gbOpen ADM2 simplified | 0 | 0 |
| ID | C2 | 38/38 | 0/0 | 0 | geoBoundaries gbOpen ADM2 grouped to GeoNames admin1 by ADM2 name, city points, ADM1 containment and nearest city fallback | 0 | 0 |
| IN | C2 | 36/36 | 0/0 | 0 | Natural Earth 10m admin1 grouped to GeoNames admin1 by city points | 0 | 0 |
| IT | C3 | 20/20 | 107/107 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin2 grouped to admin1, geoBoundaries gbOpen ADM3 simplified | 0 | 0 |
| JP | C2 | 47/47 | 0/0 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin1 | 0 | 0 |
| MA | C2 | 12/12 | 0/0 | 0 | geoBoundaries gbOpen ADM1 grouped to GeoNames admin1 by city points | 0 | 0 |
| MX | C2 | 32/32 | 0/0 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin1 | 0 | 0 |
| MY | C2 | 16/16 | 0/0 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin1 | 0 | 0 |
| PE | C3 | 26/26 | 191/191 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin1, geoBoundaries gbOpen ADM2 simplified | 0 | 0 |
| RU | C2 | 83/83 | 0/0 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin1 | 0 | 0 |
| TH | C2 | 77/77 | 0/0 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin1 | 0 | 0 |
| TR | C2 | 81/81 | 0/0 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin1 | 0 | 0 |
| TZ | C2 | 31/31 | 0/0 | 0 | geoBoundaries gbOpen ADM2 grouped to GeoNames admin1 by ADM2 name, city points, ADM1 containment and nearest city fallback | 0 | 0 |
| US | C2 | 51/51 | 0/0 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin1 | 0 | 0 |
| VN | C2 | 34/34 | 0/0 | 0 | Natural Earth 10m admin1 grouped to GeoNames admin1 by city points | 0 | 0 |
| ZA | C2 | 9/9 | 0/0 | 0 | Natural Earth 10m admin1 gn_id -> GeoNames admin1 | 0 | 0 |

## CN admin2 审计

| admin1 code | admin1 名称 | 生成数量 | 匹配 admin2 | 仅边界 | 仅边界区域 |
| --- | --- | ---: | ---: | ---: | --- |
| 01 | Anhui | 16 | 16 | 0 | - |
| 02 | Zhejiang | 11 | 11 | 0 | - |
| 03 | Jiangxi | 11 | 11 | 0 | - |
| 04 | Jiangsu | 13 | 13 | 0 | - |
| 05 | Jilin | 9 | 9 | 0 | - |
| 06 | Qinghai | 8 | 8 | 0 | - |
| 07 | Fujian | 9 | 9 | 0 | - |
| 08 | Heilongjiang | 13 | 13 | 0 | - |
| 09 | Henan | 18 | 18 | 0 | - |
| 10 | Hebei | 11 | 11 | 0 | - |
| 11 | Hunan | 14 | 14 | 0 | - |
| 12 | Hubei | 17 | 17 | 0 | - |
| 13 | Xinjiang | 24 | 17 | 7 | 阿拉尔 (boundary:CN.13.659002)<br>北屯 (boundary:CN.13.659005)<br>铁门关 (boundary:CN.13.659006)<br>双河 (boundary:CN.13.659007)<br>可克达拉 (boundary:CN.13.659008)<br>昆玉 (boundary:CN.13.659009)<br>胡杨河 (boundary:CN.13.659010) |
| 14 | Tibet | 7 | 7 | 0 | - |
| 15 | Gansu | 14 | 14 | 0 | - |
| 16 | Guangxi | 14 | 14 | 0 | - |
| 18 | Guizhou | 9 | 9 | 0 | - |
| 19 | Liaoning | 14 | 14 | 0 | - |
| 20 | Inner Mongolia | 12 | 12 | 0 | - |
| 21 | Ningxia | 5 | 5 | 0 | - |
| 22 | Beijing | 1 | 1 | 0 | - |
| 23 | Shanghai | 1 | 1 | 0 | - |
| 24 | Shanxi | 11 | 11 | 0 | - |
| 25 | Shandong | 16 | 16 | 0 | - |
| 26 | Shaanxi | 10 | 10 | 0 | - |
| 28 | Tianjin | 1 | 1 | 0 | - |
| 29 | Yunnan | 16 | 16 | 0 | - |
| 30 | Guangdong | 21 | 21 | 0 | - |
| 31 | Hainan | 19 | 13 | 6 | 定安 (boundary:CN.31.469021)<br>屯昌 (boundary:CN.31.469022)<br>白沙 (boundary:CN.31.469025)<br>昌江 (boundary:CN.31.469026)<br>乐东 (boundary:CN.31.469027)<br>陵水 (boundary:CN.31.469028) |
| 32 | Sichuan | 21 | 21 | 0 | - |
| 33 | Chongqing | 1 | 1 | 0 | - |

## ES admin2 审计

| admin1 code | admin1 名称 | 生成数量 | 匹配 admin2 | 仅边界 | 仅边界区域 |
| --- | --- | ---: | ---: | ---: | --- |
| 07 | Balearic Islands | 1 | 1 | 0 | - |
| 27 | La Rioja | 1 | 1 | 0 | - |
| 29 | Madrid | 1 | 1 | 0 | - |
| 31 | Murcia | 1 | 1 | 0 | - |
| 32 | Navarre | 1 | 1 | 0 | - |
| 34 | Asturias | 1 | 1 | 0 | - |
| 39 | Cantabria | 1 | 1 | 0 | - |
| 51 | Andalusia | 8 | 8 | 0 | - |
| 52 | Aragon | 3 | 3 | 0 | - |
| 53 | Canary Islands | 2 | 2 | 0 | - |
| 54 | Castille-La Mancha | 5 | 5 | 0 | - |
| 55 | Castille and León | 9 | 9 | 0 | - |
| 56 | Catalonia | 4 | 4 | 0 | - |
| 57 | Extremadura | 2 | 2 | 0 | - |
| 58 | Galicia | 4 | 4 | 0 | - |
| 59 | Basque Country | 3 | 3 | 0 | - |
| 60 | Valencia | 3 | 3 | 0 | - |
| CE | Ceuta | 1 | 1 | 0 | - |
| ML | Melilla | 1 | 1 | 0 | - |

## FR admin2 审计

| admin1 code | admin1 名称 | 生成数量 | 匹配 admin2 | 仅边界 | 仅边界区域 |
| --- | --- | ---: | ---: | ---: | --- |
| 11 | Île-de-France | 8 | 8 | 0 | - |
| 24 | Centre-Val de Loire | 6 | 6 | 0 | - |
| 27 | Bourgogne | 8 | 8 | 0 | - |
| 28 | Normandy | 5 | 5 | 0 | - |
| 32 | Hauts-de-France | 5 | 5 | 0 | - |
| 44 | Grand Est | 10 | 10 | 0 | - |
| 52 | Pays de la Loire | 5 | 5 | 0 | - |
| 53 | Brittany | 4 | 4 | 0 | - |
| 75 | New Aquitaine | 12 | 12 | 0 | - |
| 76 | Occitanie | 13 | 13 | 0 | - |
| 84 | Rhône-Alpes | 12 | 12 | 0 | - |
| 93 | Provence-Alpes-Côte d'Azur | 6 | 6 | 0 | - |
| 94 | Corsica | 2 | 2 | 0 | - |

## IT admin2 审计

| admin1 code | admin1 名称 | 生成数量 | 匹配 admin2 | 仅边界 | 仅边界区域 |
| --- | --- | ---: | ---: | ---: | --- |
| 01 | Abruzzo | 4 | 4 | 0 | - |
| 02 | Basilicate | 2 | 2 | 0 | - |
| 03 | Calabria | 5 | 5 | 0 | - |
| 04 | Campania | 5 | 5 | 0 | - |
| 05 | Emilia-Romagna | 9 | 9 | 0 | - |
| 06 | Friuli Venezia Giulia | 4 | 4 | 0 | - |
| 07 | Lazio | 5 | 5 | 0 | - |
| 08 | Liguria | 4 | 4 | 0 | - |
| 09 | Lombardy | 12 | 12 | 0 | - |
| 10 | The Marches | 5 | 5 | 0 | - |
| 11 | Molise | 2 | 2 | 0 | - |
| 12 | Piedmont | 8 | 8 | 0 | - |
| 13 | Apulia | 6 | 6 | 0 | - |
| 14 | Sardinia | 5 | 5 | 0 | - |
| 15 | Sicily | 9 | 9 | 0 | - |
| 16 | Tuscany | 10 | 10 | 0 | - |
| 17 | Trentino-Alto Adige | 2 | 2 | 0 | - |
| 18 | Umbria | 2 | 2 | 0 | - |
| 19 | Aosta Valley | 1 | 1 | 0 | - |
| 20 | Veneto | 7 | 7 | 0 | - |

## PE admin2 审计

| admin1 code | admin1 名称 | 生成数量 | 匹配 admin2 | 仅边界 | 仅边界区域 |
| --- | --- | ---: | ---: | ---: | --- |
| 01 | Amazonas | 6 | 6 | 0 | - |
| 02 | Ancash | 20 | 20 | 0 | - |
| 03 | Apurímac Department | 6 | 6 | 0 | - |
| 04 | Arequipa | 8 | 8 | 0 | - |
| 05 | Ayacucho | 11 | 11 | 0 | - |
| 06 | Cajamarca Department | 13 | 13 | 0 | - |
| 07 | Callao | 1 | 1 | 0 | - |
| 08 | Cuzco Department | 13 | 13 | 0 | - |
| 09 | Huancavelica | 7 | 7 | 0 | - |
| 10 | Huánuco Department | 10 | 10 | 0 | - |
| 11 | Ica | 5 | 5 | 0 | - |
| 12 | Junin | 9 | 9 | 0 | - |
| 13 | La Libertad | 11 | 11 | 0 | - |
| 14 | Lambayeque | 3 | 3 | 0 | - |
| 15 | Lima region | 10 | 10 | 0 | - |
| 16 | Loreto | 8 | 8 | 0 | - |
| 17 | Madre de Dios | 3 | 3 | 0 | - |
| 18 | Moquegua Department | 3 | 3 | 0 | - |
| 19 | Pasco | 3 | 3 | 0 | - |
| 20 | Piura | 8 | 8 | 0 | - |
| 21 | Puno | 13 | 13 | 0 | - |
| 22 | San Martín Department | 10 | 10 | 0 | - |
| 23 | Tacna | 4 | 4 | 0 | - |
| 24 | Tumbes | 3 | 3 | 0 | - |
| 25 | Ucayali | 3 | 3 | 0 | - |
