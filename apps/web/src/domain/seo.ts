/**
 * 文件说明: 统一生成公开站 SEO URL、canonical、hreflang、sitemap 和 AI 入口内容。
 * 对应文档: docs/runtime.md
 */
import type { DisplayLocale } from './format';
import { buildTopTabPath, topTabs, type TopTabId } from './navigation';
import { getStaticInfoPage, staticInfoPageIds, type StaticInfoPageId } from './static-info';

export const siteOrigin = (process.env.SITE_URL ?? 'https://weather-trip.aicake.io').replace(/\/$/, '');
export const ogImagePath = '/landing/climate-atlas-sunny.webp';

export type PublicPage = {
  id: TopTabId | StaticInfoPageId;
  group: 'tool' | 'info';
  tabId?: TopTabId;
  locale: DisplayLocale;
  path: string;
  title: string;
  description: string;
};

const pageCopy: Record<TopTabId, Record<DisplayLocale, Pick<PublicPage, 'title' | 'description'>>> = {
  landing: {
    zh: {
      title: '天气旅行 | 用天气决定下一个城市',
      description: '查看全球城市未来天气，或选择你喜欢的天气，查看适合的城市。'
    },
    en: {
      title: 'Weather Trip | Choose your next city by weather',
      description: 'Scan future weather across global cities, or choose weather you like, and find suitable cities.'
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
    id: tabId,
    group: 'tool',
    locale,
    tabId,
    path: buildTopTabPath(locale, tabId),
    ...pageCopy[tabId][locale]
  };
}

export function getPublicPages(): PublicPage[] {
  const toolPages = topTabs.flatMap((tab) => [getPublicPage('en', tab.id), getPublicPage('zh', tab.id)]);
  const infoPages = staticInfoPageIds.flatMap((pageId) =>
    (['en', 'zh'] as const).map((locale) => {
      const page = getStaticInfoPage(locale, pageId);
      return {
        id: page.id,
        group: 'info',
        locale,
        path: page.path,
        title: page.title,
        description: page.description
      } satisfies PublicPage;
    })
  );
  return [...toolPages, ...infoPages];
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
      const alternates =
        page.group === 'tool' && page.tabId
          ? getAlternateLinks(page.tabId)
          : {
              en: buildAbsoluteUrl(getStaticInfoPage('en', page.id as StaticInfoPageId).path),
              'zh-Hans': buildAbsoluteUrl(getStaticInfoPage('zh', page.id as StaticInfoPageId).path),
              'x-default': buildAbsoluteUrl(getStaticInfoPage('en', page.id as StaticInfoPageId).path)
            };
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
    `- About: ${buildAbsoluteUrl('/about')}`,
    `- Privacy statement: ${buildAbsoluteUrl('/privacy')}`,
    `- Disclaimer: ${buildAbsoluteUrl('/disclaimer')}`,
    `- Chinese home: ${buildAbsoluteUrl('/zh')}`,
    '',
    '## Data',
    'Weather data is served from static JSON snapshots. Local development reads /data, while production can read current weather packages from Cloudflare R2.',
    '',
    `Sitemap: ${buildAbsoluteUrl('/sitemap.xml')}`,
    ''
  ].join('\n');
}
