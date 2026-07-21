/**
 * 文件说明: 统一生成公开站 SEO URL、canonical、hreflang、sitemap 和 AI 入口内容。
 * 对应文档: docs/runtime.md
 */
import type { DisplayLocale } from './format';
import { buildTopTabPath, topTabs, type TopTabId } from './navigation';

export const siteOrigin = (process.env.SITE_URL ?? 'https://weather-trip.aicake.io').replace(/\/$/, '');
export const ogImagePath = '/landing/climate-atlas-sunny.png';

export type PublicPage = {
  tabId: TopTabId;
  locale: DisplayLocale;
  path: string;
  title: string;
  description: string;
};

const pageCopy: Record<TopTabId, Record<DisplayLocale, Pick<PublicPage, 'title' | 'description'>>> = {
  landing: {
    zh: {
      title: '天气旅行 | 用天气决定下一个城市',
      description: '查看全球城市未来天气，或先选择你想要的天气，再去找刚好适合抵达的地方。'
    },
    en: {
      title: 'Weather Trip | Choose your next city by weather',
      description: 'Scan future weather across global cities, or first choose the weather you want, then find the right place to land.'
    }
  },
  'weather-map': {
    zh: {
      title: 'Weather Trip | 全球天气地图',
      description: '按日期查看全球城市气温、降水、湿度、天气类型和舒适度。'
    },
    en: {
      title: 'Weather Trip | World Weather',
      description: 'View temperature, rainfall, RH, weather type, and comfort across global cities by date.'
    }
  },
  'city-finder': {
    zh: {
      title: 'Weather Trip | 按天气找城市',
      description: '按温度、晴雨、湿度、海拔和出行天数反向寻找匹配城市。'
    },
    en: {
      title: 'Weather Trip | Weather Match',
      description: 'Find matching cities by temperature, sky, RH, elevation, and trip length.'
    }
  }
};

export function buildAbsoluteUrl(path: string): string {
  return `${siteOrigin}${path}`;
}

export function getPublicPage(locale: DisplayLocale, tabId: TopTabId): PublicPage {
  return {
    locale,
    tabId,
    path: buildTopTabPath(locale, tabId),
    ...pageCopy[tabId][locale]
  };
}

export function getPublicPages(): PublicPage[] {
  return topTabs.flatMap((tab) => [getPublicPage('en', tab.id), getPublicPage('zh', tab.id)]);
}

export function getAlternateLinks(tabId: TopTabId): Record<'en' | 'zh-Hans' | 'x-default', string> {
  return {
    en: buildAbsoluteUrl(buildTopTabPath('en', tabId)),
    'zh-Hans': buildAbsoluteUrl(buildTopTabPath('zh', tabId)),
    'x-default': buildAbsoluteUrl(buildTopTabPath('en', tabId))
  };
}

export function getRobotsTxt(): string {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${buildAbsoluteUrl('/sitemap.xml')}`,
    ''
  ].join('\n');
}

export function getSitemapXml(): string {
  const urls = getPublicPages()
    .map((page) => {
      const alternates = getAlternateLinks(page.tabId);
      const links = Object.entries(alternates)
        .map(
          ([hreflang, href]) =>
            `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${href}" />`
        )
        .join('\n');

      return [
        '  <url>',
        `    <loc>${buildAbsoluteUrl(page.path)}</loc>`,
        links,
        '    <changefreq>daily</changefreq>',
        '  </url>'
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    urls,
    '</urlset>',
    ''
  ].join('\n');
}

export function getLlmsTxt(): string {
  return [
    '# Weather Trip',
    '',
    'Weather Trip is a public weather travel tool for comparing global city forecasts and finding destinations by temperature, rainfall, humidity, weather type, and elevation.',
    '',
    '## Core Pages',
    `- Home: ${buildAbsoluteUrl('/')}`,
    `- World weather map: ${buildAbsoluteUrl('/weather-map')}`,
    `- City finder by weather: ${buildAbsoluteUrl('/city-finder')}`,
    `- Chinese home: ${buildAbsoluteUrl('/zh')}`,
    '',
    '## Data',
    'Weather data is refreshed into Postgres by the worker process and served from cached public snapshots. The public pages do not expose database credentials.',
    '',
    `Sitemap: ${buildAbsoluteUrl('/sitemap.xml')}`,
    ''
  ].join('\n');
}
