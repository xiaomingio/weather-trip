/**
 * 文件说明: 统一维护 Astro 页面壳、顶部导航和 Landing 静态首屏的中英文文案。
 * 对应文档: docs/specs/10-product-design.md
 */

import type { TopTabId } from '@/domain/navigation';
import type { Locale } from './locales';

export type LandingSampleWeather = 'sun' | 'cloud' | 'drizzle' | 'snow';

export type LandingCitySampleMessages = {
  id: string;
  tempC: number;
  weather: LandingSampleWeather;
  humidity: number;
  elevationM: number;
  name: string;
  weatherLabel: string;
};

export type PageShellMessages = {
  site: {
    brandName: string;
    localizedBrandName: string;
  };
  common: {
    unitToggleLabel: string;
    localeToggleLabel: string;
    localeShortLabel: string;
  };
  nav: {
    label: string;
    tabs: Record<TopTabId, string>;
  };
  staticInfo: {
    backHome: string;
  };
  landing: {
    heroTitle: string;
    heroTitleLines: string[];
    heroLead: string;
    primaryAction: string;
    secondaryAction: string;
    coverageLabel: string;
    cities: string;
    regions: string;
    days: (days: number) => string;
    citySamplesLabel: string;
    artAlt: string;
    figureLayers: string;
    humidity: (value: number) => string;
    elevation: (value: number) => string;
    citySamples: LandingCitySampleMessages[];
  };
};

export const pageShellMessages = {
  zh: {
    site: {
      brandName: 'Weather Trip',
      localizedBrandName: '天气旅行'
    },
    common: {
      unitToggleLabel: '切换摄氏度与华氏度',
      localeToggleLabel: 'Switch to English',
      localeShortLabel: 'English'
    },
    nav: {
      label: '天气旅行',
      tabs: {
        landing: '首页',
        'weather-map': '天气地图',
        'city-finder': '城市查找'
      }
    },
    staticInfo: {
      backHome: '返回首页'
    },
    landing: {
      heroTitle: '让天气替你挑一座城市',
      heroTitleLines: ['让天气替你', '挑一座城市'],
      heroLead:
        '出发前先看全球城市接下来几天的温度、晴雨和湿度；也可以选择你喜欢的天气，查看适合的城市。',
      primaryAction: '查看全球天气',
      secondaryAction: '寻找匹配城市',
      coverageLabel: '数据覆盖',
      cities: '城市',
      regions: '国家和地区',
      days: (days: number) => `未来 ${days} 天预报`,
      citySamplesLabel: '城市天气示例',
      artAlt: '旅行天气地图、透明气候图层和指南针组成的画册式预览',
      figureLayers: '天气 · 温度 · 湿度 · 海拔',
      humidity: (value: number) => `湿度 ${value}%`,
      elevation: (value: number) => `海拔 ${value}m`,
      citySamples: [
        { id: 'shanghai', tempC: 19, weather: 'cloud', humidity: 68, elevationM: 4, name: '上海', weatherLabel: '多云' },
        { id: 'nyc', tempC: 21, weather: 'sun', humidity: 52, elevationM: 10, name: '纽约', weatherLabel: '晴天' },
        { id: 'hokkaido', tempC: -6, weather: 'snow', humidity: 74, elevationM: 40, name: '北海道', weatherLabel: '小雪' },
        { id: 'paris', tempC: 12, weather: 'drizzle', humidity: 81, elevationM: 35, name: '巴黎', weatherLabel: '小雨' },
        { id: 'rio', tempC: 31, weather: 'sun', humidity: 82, elevationM: 11, name: '里约热内卢', weatherLabel: '晴天' },
        { id: 'sydney', tempC: 24, weather: 'sun', humidity: 55, elevationM: 19, name: '悉尼', weatherLabel: '晴天' },
        { id: 'lhasa', tempC: 12, weather: 'sun', humidity: 32, elevationM: 3650, name: '拉萨', weatherLabel: '晴天' },
        { id: 'cairo', tempC: 36, weather: 'sun', humidity: 28, elevationM: 74, name: '开罗', weatherLabel: '晴天' }
      ]
    }
  },
  en: {
    site: {
      brandName: 'Weather Trip',
      localizedBrandName: 'Weather Trip'
    },
    common: {
      unitToggleLabel: 'Switch Celsius / Fahrenheit',
      localeToggleLabel: '切换到中文',
      localeShortLabel: '中文'
    },
    nav: {
      label: 'Weather Trip',
      tabs: {
        landing: 'Home',
        'weather-map': 'Weather Map',
        'city-finder': 'City Finder'
      }
    },
    staticInfo: {
      backHome: 'Back home'
    },
    landing: {
      heroTitle: 'Let weather pick your next city',
      heroTitleLines: ['Let weather pick', 'your next city'],
      heroLead:
        'Before you go, scan temperature, sky, and humidity for cities worldwide—or choose weather you like, and find suitable cities.',
      primaryAction: 'View world weather',
      secondaryAction: 'Find matching cities',
      coverageLabel: 'Coverage',
      cities: 'cities',
      regions: 'countries & regions',
      days: (days: number) => `${days}-day forecast`,
      citySamplesLabel: 'City weather samples',
      artAlt: 'Travel weather map preview with climate layers and compass',
      figureLayers: 'Weather · Temperature · Humidity · Elevation',
      humidity: (value: number) => `Humidity ${value}%`,
      elevation: (value: number) => `Elevation ${value}m`,
      citySamples: [
        { id: 'shanghai', tempC: 19, weather: 'cloud', humidity: 68, elevationM: 4, name: 'Shanghai', weatherLabel: 'Cloudy' },
        { id: 'nyc', tempC: 21, weather: 'sun', humidity: 52, elevationM: 10, name: 'New York', weatherLabel: 'Sunny' },
        { id: 'hokkaido', tempC: -6, weather: 'snow', humidity: 74, elevationM: 40, name: 'Hokkaido', weatherLabel: 'Light snow' },
        { id: 'paris', tempC: 12, weather: 'drizzle', humidity: 81, elevationM: 35, name: 'Paris', weatherLabel: 'Light rain' },
        { id: 'rio', tempC: 31, weather: 'sun', humidity: 82, elevationM: 11, name: 'Rio de Janeiro', weatherLabel: 'Sunny' },
        { id: 'sydney', tempC: 24, weather: 'sun', humidity: 55, elevationM: 19, name: 'Sydney', weatherLabel: 'Sunny' },
        { id: 'lhasa', tempC: 12, weather: 'sun', humidity: 32, elevationM: 3650, name: 'Lhasa', weatherLabel: 'Sunny' },
        { id: 'cairo', tempC: 36, weather: 'sun', humidity: 28, elevationM: 74, name: 'Cairo', weatherLabel: 'Sunny' }
      ]
    }
  }
} satisfies Record<Locale, PageShellMessages>;

export function getPageShellMessages(locale: Locale): PageShellMessages {
  return pageShellMessages[locale];
}

export function getTopTabLabels(tabId: TopTabId): Record<Locale, string> {
  return {
    zh: pageShellMessages.zh.nav.tabs[tabId],
    en: pageShellMessages.en.nav.tabs[tabId]
  };
}

export function getTopTabLabel(locale: Locale, tabId: TopTabId): string {
  return pageShellMessages[locale].nav.tabs[tabId];
}
