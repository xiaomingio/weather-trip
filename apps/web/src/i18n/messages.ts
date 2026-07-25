/**
 * 文件说明: 统一维护天气工具 UI 的中英文文案真源，并用类型约束各语言 key parity。
 * 对应文档: docs/specs/10-product-design.md
 */

import type { MapLayer } from 'weather-core/types';
import type { Locale } from './locales';

export type WeatherMapLegendMessages = {
  low: string;
  mid: string;
  high: string;
};

export type WeatherMapLegendKey = 'match' | 'temperature' | 'humidity' | 'precipitation' | 'wind' | 'elevation' | 'weather' | 'comfort';

export type WeatherMapMessages = {
  layer: Record<MapLayer, string>;
  sort: {
    default: string;
  };
  legend: Record<WeatherMapLegendKey, WeatherMapLegendMessages>;
};

export type DashboardCopyMessages = {
  title: {
    cityFinder: string;
    weatherMap: string;
  };
  filterPanel: string;
  resultPanel: string;
  forecastPanel: string;
  mapPanel: string;
  language: string;
  region: string;
  subRegion: string;
  time: string;
  nextDays: (days: number) => string;
  date: string;
  layer: string;
  quickFilters: string;
  temperature: string;
  weather: string;
  humidity: string;
  elevation: string;
  all: string;
  sort: string;
  sortAscending: string;
  sortDescending: string;
  cities: string;
  highMatchCities: string;
  citySearch: string;
  citySearchPlaceholder: string;
  noCityMatches: string;
  loadingWeatherData: string;
  noForecastData: string;
  noMapData: string;
  suitableDays: (match: number, total: number) => string;
  matchingFilterDays: (match: number, total: number) => string;
  average: string;
  dryDays: (days: number) => string;
  humidityValue: (value: string) => string;
  forecastHumidity: string;
  forecastPrecipitation: string;
  forecastPrecipitationProbability: string;
  forecastWind: string;
  minTemperature: string;
  maxTemperature: string;
  minHumidity: string;
  maxHumidity: string;
  minElevation: string;
  maxElevation: string;
  precipitation: (value: number) => string;
};

export type FilterCopyMessages = {
  cityFinderIntro: string;
  region: string;
  subRegion: string;
  time: string;
  nextDays: (days: number) => string;
  date: string;
  layer: string;
  quickFilters: string;
  expandQuickFilters: string;
  collapseQuickFilters: string;
  temperature: string;
  weather: string;
  humidity: string;
  precipitation: string;
  wind: string;
  elevation: string;
  all: string;
  off: string;
  enabled: string;
  reset: string;
  done: string;
  minTemperature: string;
  maxTemperature: string;
  minHumidity: string;
  maxHumidity: string;
  minPrecipitation: string;
  maxPrecipitation: string;
  minWind: string;
  maxWind: string;
  minElevation: string;
  maxElevation: string;
  comfortHelp: string;
  presets: {
    temperature: Record<'cold' | 'cool' | 'mild' | 'warm' | 'hot', string>;
    humidity: Record<'dry' | 'comfortable' | 'humid' | 'very-humid', string>;
    precipitation: Record<'none' | 'light' | 'moderate' | 'heavy', string>;
    wind: Record<'calm' | 'breezy' | 'windy', string>;
    elevation: Record<'lowland' | 'midland' | 'highland' | 'mountain', string>;
    weatherType: Record<'sunny' | 'cloud-fog' | 'no-rain' | 'rain' | 'snow', string>;
  };
};

export type UiMessages = {
  worldWeatherMap: {
    showRegions: string;
    regionColoringHelp: string;
    fullscreenMap: string;
    exitMapFullscreen: string;
    noData: string;
    mapAriaLabel: string;
    colorLegendAriaLabel: string;
  };
  forecastDayCardTooltip: {
    temperature: string;
    averageTemperature: string;
    humidity: string;
    precipitation: string;
    precipitationProbability: string;
    wind: string;
  };
};

export type AppMessages = {
  dashboard: DashboardCopyMessages;
  filter: FilterCopyMessages;
  weatherMap: WeatherMapMessages;
  ui: UiMessages;
};

const zhMessages = {
  dashboard: {
    title: {
      cityFinder: '按天气找城市',
      weatherMap: '全球天气地图'
    },
    filterPanel: '天气筛选',
    resultPanel: '天气结果',
    forecastPanel: '选中城市天气',
    mapPanel: '地图',
    language: 'English',
    region: '地区/国家',
    subRegion: '省/州',
    time: '时间',
    nextDays: (days: number) => `未来 ${days} 天`,
    date: '日期',
    layer: '图层',
    quickFilters: '快速筛选',
    temperature: '气温',
    weather: '天气',
    humidity: '湿度',
    elevation: '海拔',
    all: '全部',
    sort: '排序',
    sortAscending: '升序',
    sortDescending: '降序',
    cities: '城市',
    highMatchCities: '高匹配城市',
    citySearch: '搜索城市',
    citySearchPlaceholder: '搜索城市',
    noCityMatches: '没有匹配城市',
    loadingWeatherData: '正在加载天气数据',
    noForecastData: '暂无城市天气',
    noMapData: '暂无地图数据',
    suitableDays: (match: number, total: number) => `${match}/${total} 天匹配`,
    matchingFilterDays: (match: number, total: number) => `${match}/${total}天符合筛选条件`,
    average: '平均',
    dryDays: (days: number) => `少雨 ${days} 天`,
    humidityValue: (value: string) => `湿度 ${value}`,
    forecastHumidity: '湿度',
    forecastPrecipitation: '雨量',
    forecastPrecipitationProbability: '雨率',
    forecastWind: '风力',
    minTemperature: '最低温度',
    maxTemperature: '最高温度',
    minHumidity: '最低湿度',
    maxHumidity: '最高湿度',
    minElevation: '最低海拔',
    maxElevation: '最高海拔',
    precipitation: (value: number) => `降水 ${value} mm`
  },
  filter: {
    cityFinderIntro: '选择你喜欢的天气，查看适合的城市。',
    region: '地区/国家',
    subRegion: '省/州',
    time: '时间',
    nextDays: (days: number) => `${days}天`,
    date: '日期',
    layer: '图层',
    quickFilters: '快速筛选',
    expandQuickFilters: '更多',
    collapseQuickFilters: '收起',
    temperature: '气温',
    weather: '天气',
    humidity: '湿度',
    precipitation: '降水',
    wind: '风速',
    elevation: '海拔',
    all: '全部',
    off: '不限',
    enabled: '启用',
    reset: '重置',
    done: '完成',
    minTemperature: '最低温度',
    maxTemperature: '最高温度',
    minHumidity: '最低湿度',
    maxHumidity: '最高湿度',
    minPrecipitation: '最低降水',
    maxPrecipitation: '最高降水',
    minWind: '最低风速',
    maxWind: '最高风速',
    minElevation: '最低海拔',
    maxElevation: '最高海拔',
    comfortHelp: '舒适度按气温 42%、天气 28%、湿度 20% 和基础分 10% 计算，并扣除降水和最大风速；分数越高越适合户外活动。',
    presets: {
      temperature: {
        cold: '偏冷',
        cool: '清凉',
        mild: '舒适',
        warm: '温暖',
        hot: '炎热'
      },
      humidity: {
        dry: '干爽',
        comfortable: '舒适',
        humid: '湿润',
        'very-humid': '潮湿'
      },
      precipitation: {
        none: '无雨',
        light: '小雨',
        moderate: '中等',
        heavy: '明显降水'
      },
      wind: {
        calm: '微风',
        breezy: '有风',
        windy: '大风'
      },
      elevation: {
        lowland: '低海拔',
        midland: '中海拔',
        highland: '高海拔',
        mountain: '山地'
      },
      weatherType: {
        sunny: '晴朗',
        'cloud-fog': '云雾',
        'no-rain': '无雨',
        rain: '下雨',
        snow: '下雪'
      }
    }
  },
  weatherMap: {
    layer: {
      weather: '天气',
      temperature: '气温',
      humidity: '湿度',
      precipitation: '降水',
      wind: '风速',
      elevation: '海拔',
      comfort: '舒适度'
    },
    sort: {
      default: '默认'
    },
    legend: {
      match: { low: '少', mid: '中', high: '多' },
      temperature: { low: '冷', mid: '舒适', high: '热' },
      humidity: { low: '干', mid: '舒适', high: '潮湿' },
      precipitation: { low: '少', mid: '中', high: '多' },
      wind: { low: '小', mid: '中', high: '大' },
      elevation: { low: '低', mid: '中', high: '高' },
      weather: { low: '晴', mid: '阴', high: '雨雪' },
      comfort: { low: '低', mid: '中', high: '高' }
    }
  },
  ui: {
    worldWeatherMap: {
      showRegions: '显示区块',
      regionColoringHelp: '显示按区域内城市采样点汇总计算的地图区块；数值图层取平均值，天气图层取出现最多的类型。',
      fullscreenMap: '地图全屏',
      exitMapFullscreen: '退出地图全屏',
      noData: '暂无数据',
      mapAriaLabel: '全球天气地图',
      colorLegendAriaLabel: '颜色图例'
    },
    forecastDayCardTooltip: {
      temperature: '气温',
      averageTemperature: '平均气温',
      humidity: '湿度',
      precipitation: '雨量',
      precipitationProbability: '降雨概率',
      wind: '风力'
    }
  }
} satisfies AppMessages;

const enMessages = {
  dashboard: {
    title: {
      cityFinder: 'Find cities by weather',
      weatherMap: 'World weather map'
    },
    filterPanel: 'Weather filters',
    resultPanel: 'Weather results',
    forecastPanel: 'Selected city forecast',
    mapPanel: 'Map',
    language: '中文',
    region: 'Region/country',
    subRegion: 'State/province',
    time: 'Time',
    nextDays: (days: number) => `Next ${days} days`,
    date: 'Date',
    layer: 'Layer',
    quickFilters: 'Quick filters',
    temperature: 'Temperature',
    weather: 'Weather',
    humidity: 'RH',
    elevation: 'Elevation',
    all: 'All',
    sort: 'Sort',
    sortAscending: 'Ascending',
    sortDescending: 'Descending',
    cities: 'Cities',
    highMatchCities: 'High matches',
    citySearch: 'Search cities',
    citySearchPlaceholder: 'Search city',
    noCityMatches: 'No matching cities',
    loadingWeatherData: 'Loading weather data',
    noForecastData: 'No city forecast',
    noMapData: 'No map data',
    suitableDays: (match: number, total: number) => `${match}/${total}d match`,
    matchingFilterDays: (match: number, total: number) => `${match}/${total} days match your filters`,
    average: 'Avg',
    dryDays: (days: number) => `${days} low-rain days`,
    humidityValue: (value: string) => `RH ${value}`,
    forecastHumidity: 'RH',
    forecastPrecipitation: 'PCPN',
    forecastPrecipitationProbability: 'POP',
    forecastWind: 'WSPD',
    minTemperature: 'Minimum temperature',
    maxTemperature: 'Maximum temperature',
    minHumidity: 'Minimum RH',
    maxHumidity: 'Maximum RH',
    minElevation: 'Minimum elevation',
    maxElevation: 'Maximum elevation',
    precipitation: (value: number) => `Rainfall ${value} mm`
  },
  filter: {
    cityFinderIntro: 'Choose weather you like, and find suitable cities.',
    region: 'Region/country',
    subRegion: 'State/province',
    time: 'Time',
    nextDays: (days: number) => `${days}d`,
    date: 'Date',
    layer: 'Layer',
    quickFilters: 'Quick filters',
    expandQuickFilters: 'More',
    collapseQuickFilters: 'Less',
    temperature: 'Temperature',
    weather: 'Weather',
    humidity: 'Humidity',
    precipitation: 'Rainfall',
    wind: 'Wind',
    elevation: 'Elevation',
    all: 'All',
    off: 'Any',
    enabled: 'Enable',
    reset: 'Reset',
    done: 'Done',
    minTemperature: 'Minimum temperature',
    maxTemperature: 'Maximum temperature',
    minHumidity: 'Minimum humidity',
    maxHumidity: 'Maximum humidity',
    minPrecipitation: 'Minimum rainfall',
    maxPrecipitation: 'Maximum rainfall',
    minWind: 'Minimum wind',
    maxWind: 'Maximum wind',
    minElevation: 'Minimum elevation',
    maxElevation: 'Maximum elevation',
    comfortHelp: 'Comfort uses temperature 42%, weather 28%, humidity 20%, and a 10% base score, then subtracts rain and max wind penalties. Higher is better for outdoor comfort.',
    presets: {
      temperature: {
        cold: 'Cold',
        cool: 'Cool',
        mild: 'Mild',
        warm: 'Warm',
        hot: 'Hot'
      },
      humidity: {
        dry: 'Dry',
        comfortable: 'Comfort',
        humid: 'Humid',
        'very-humid': 'Very humid'
      },
      precipitation: {
        none: 'Dry',
        light: 'Light',
        moderate: 'Moderate',
        heavy: 'Wet'
      },
      wind: {
        calm: 'Calm',
        breezy: 'Breezy',
        windy: 'Windy'
      },
      elevation: {
        lowland: 'Lowland',
        midland: 'Midland',
        highland: 'Highland',
        mountain: 'Mountain'
      },
      weatherType: {
        sunny: 'Sunny',
        'cloud-fog': 'Cloud/fog',
        'no-rain': 'No rain',
        rain: 'Rain',
        snow: 'Snow'
      }
    }
  },
  weatherMap: {
    layer: {
      weather: 'Weather',
      temperature: 'Temperature',
      humidity: 'Humidity',
      precipitation: 'Rainfall',
      wind: 'Wind',
      elevation: 'Elevation',
      comfort: 'Comfort'
    },
    sort: {
      default: 'Default'
    },
    legend: {
      match: { low: 'Low', mid: 'Mid', high: 'High' },
      temperature: { low: 'Cold', mid: 'Mild', high: 'Hot' },
      humidity: { low: 'Dry', mid: 'Mild', high: 'Humid' },
      precipitation: { low: 'Low', mid: 'Mid', high: 'High' },
      wind: { low: 'Light', mid: 'Mid', high: 'Strong' },
      elevation: { low: 'Low', mid: 'Mid', high: 'High' },
      weather: { low: 'Sun', mid: 'Cloud', high: 'Rain/snow' },
      comfort: { low: 'Low', mid: 'Mid', high: 'High' }
    }
  },
  ui: {
    worldWeatherMap: {
      showRegions: 'Show regions',
      regionColoringHelp: 'Show map regions aggregated from city sample points; numeric layers use averages, while weather uses the most common type.',
      fullscreenMap: 'Fullscreen map',
      exitMapFullscreen: 'Exit map fullscreen',
      noData: 'No data',
      mapAriaLabel: 'Global weather map',
      colorLegendAriaLabel: 'Color legend'
    },
    forecastDayCardTooltip: {
      temperature: 'Temperature',
      averageTemperature: 'Average temperature',
      humidity: 'Relative humidity',
      precipitation: 'Precipitation',
      precipitationProbability: 'Probability of precipitation',
      wind: 'Wind speed'
    }
  }
} satisfies AppMessages;

export const messages = {
  zh: zhMessages,
  en: enMessages
} satisfies Record<Locale, AppMessages>;
