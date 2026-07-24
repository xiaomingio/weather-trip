/**
 * 文件说明: 统一定义关于、隐私声明和免责声明页面的路由、导航标签与正文内容。
 * 对应文档: docs/specs/32-public-data-contract.md
 */
import type { DisplayLocale } from './format';

export type StaticInfoPageId = 'about' | 'privacy' | 'disclaimer';

export type StaticInfoSection = {
  heading: string;
  paragraphs: string[];
};

export type StaticInfoPage = {
  id: StaticInfoPageId;
  locale: DisplayLocale;
  path: string;
  navLabel: string;
  title: string;
  description: string;
  updatedLabel: string;
  sections: StaticInfoSection[];
};

export const staticInfoPageIds: StaticInfoPageId[] = ['about', 'privacy', 'disclaimer'];

const updatedDate = {
  zh: '2026 年 7 月 24 日',
  en: 'July 24, 2026'
} satisfies Record<DisplayLocale, string>;

const staticInfoCopy = {
  about: {
    zh: {
      navLabel: '关于',
      title: '关于 Weather Trip',
      description: 'Weather Trip 是一个公开天气旅行工具，用未来天气帮你比较城市和选择目的地。',
      sections: [
        {
          heading: '这个网站做什么',
          paragraphs: [
            'Weather Trip 帮你按未来天气查看和筛选全球城市。你可以先看天气地图，也可以先设定想要的温度、晴雨、湿度或海拔，再找到更适合抵达的城市。'
          ]
        },
        {
          heading: '数据方式',
          paragraphs: [
            '公开页面读取静态城市数据、地理边界和天气快照，不需要注册账号。天气会随时间更新，城市覆盖和预报完整度也会受数据源影响。'
          ]
        },
        {
          heading: '适用边界',
          paragraphs: [
            'Weather Trip 适合做旅行灵感、城市比较和出发前的初步判断。涉及安全、航班、户外活动或当地预警时，请再查看官方天气和旅行信息。'
          ]
        }
      ]
    },
    en: {
      navLabel: 'About',
      title: 'About Weather Trip',
      description: 'Weather Trip is a public weather travel tool for comparing cities and choosing destinations by forecast.',
      sections: [
        {
          heading: 'What it does',
          paragraphs: [
            'Weather Trip helps you explore global cities by future weather. You can scan the weather map, or choose the temperature, sky, humidity, and elevation you want before finding places that fit.'
          ]
        },
        {
          heading: 'How the data works',
          paragraphs: [
            'Public pages read static city data, map boundaries, and weather snapshots. No account is required. Forecasts change over time, and coverage can vary by data source and location.'
          ]
        },
        {
          heading: 'Best use',
          paragraphs: [
            'Weather Trip is meant for travel ideas, city comparison, and early planning. For safety, flights, outdoor activities, or local alerts, check official weather and travel sources too.'
          ]
        }
      ]
    }
  },
  privacy: {
    zh: {
      navLabel: '隐私声明',
      title: '隐私声明',
      description: 'Weather Trip 不要求注册账号；语言、温度单位等偏好会保存在你的浏览器里。',
      sections: [
        {
          heading: '账号和个人资料',
          paragraphs: [
            'Weather Trip 的公开页面不要求你创建账号，也不会要求填写姓名、邮箱或旅行计划。'
          ]
        },
        {
          heading: '浏览器偏好',
          paragraphs: [
            '语言和温度单位等显示偏好可能会保存在你的浏览器中，用来让下次访问保持同样的体验。你可以通过清理浏览器站点数据删除这些偏好。'
          ]
        },
        {
          heading: '统计与日志',
          paragraphs: [
            '如果站点启用了访问统计，我们会用它了解页面使用情况和改进体验。统计服务可能处理基础技术信息，例如页面访问、浏览器类型和大致地区；这些信息不会在 Weather Trip 中绑定到个人账号。'
          ]
        },
        {
          heading: '天气数据请求',
          paragraphs: [
            '页面会从公开静态文件读取城市、地图和天气数据。我们不会用这些请求要求你提供个人行程，也不会把筛选条件当作个人资料保存。'
          ]
        }
      ]
    },
    en: {
      navLabel: 'Privacy',
      title: 'Privacy Statement',
      description: 'Weather Trip does not require an account; display preferences such as language and units may be stored in your browser.',
      sections: [
        {
          heading: 'Accounts and personal profiles',
          paragraphs: [
            'Weather Trip public pages do not ask you to create an account, and they do not ask for your name, email address, or travel plan.'
          ]
        },
        {
          heading: 'Browser preferences',
          paragraphs: [
            'Display preferences such as language and temperature units may be stored in your browser so the site can keep the same experience next time. You can remove them by clearing site data in your browser.'
          ]
        },
        {
          heading: 'Analytics and logs',
          paragraphs: [
            'If analytics is enabled, we use it to understand page usage and improve the experience. The analytics service may process basic technical information such as page visits, browser type, and approximate region; Weather Trip does not tie that information to a user account.'
          ]
        },
        {
          heading: 'Weather data requests',
          paragraphs: [
            'Pages load city, map, and weather data from public static files. We do not require personal itinerary details for those requests, and we do not save filter choices as a personal profile.'
          ]
        }
      ]
    }
  },
  disclaimer: {
    zh: {
      navLabel: '免责声明',
      title: '免责声明',
      description: 'Weather Trip 提供旅行天气参考，不替代官方天气预警、安全建议或专业判断。',
      sections: [
        {
          heading: '信息仅供参考',
          paragraphs: [
            'Weather Trip 展示的天气、城市和地图信息用于一般旅行参考。预报可能变化，也可能因为数据延迟、覆盖差异或来源错误而不完整。'
          ]
        },
        {
          heading: '不是安全或专业建议',
          paragraphs: [
            '本站内容不构成天气预警、航空、航海、户外安全、医疗、法律或其他专业建议。涉及风险决策时，请以官方机构、当地政府、航空公司和专业服务的信息为准。'
          ]
        },
        {
          heading: '使用判断',
          paragraphs: [
            '你应结合实际行程、当地状况和最新官方信息自行判断。Weather Trip 不保证所有数据在任何时间、地点或用途下都准确、完整或可用。'
          ]
        }
      ]
    },
    en: {
      navLabel: 'Disclaimer',
      title: 'Disclaimer',
      description: 'Weather Trip provides travel weather references and does not replace official alerts, safety guidance, or professional judgment.',
      sections: [
        {
          heading: 'Information only',
          paragraphs: [
            'Weather, city, and map information on Weather Trip is provided for general travel reference. Forecasts can change, and data may be incomplete because of delays, coverage gaps, or source errors.'
          ]
        },
        {
          heading: 'Not safety or professional advice',
          paragraphs: [
            'The site does not provide weather warnings, aviation, marine, outdoor safety, medical, legal, or other professional advice. For risk-sensitive decisions, rely on official agencies, local authorities, airlines, and qualified services.'
          ]
        },
        {
          heading: 'Your judgment',
          paragraphs: [
            'Use the site together with your actual itinerary, local conditions, and current official information. Weather Trip does not guarantee that all data will be accurate, complete, or available for every time, place, or use.'
          ]
        }
      ]
    }
  }
} satisfies Record<
  StaticInfoPageId,
  Record<DisplayLocale, Omit<StaticInfoPage, 'id' | 'locale' | 'path' | 'updatedLabel'>>
>;

export function buildStaticInfoPath(locale: DisplayLocale, pageId: StaticInfoPageId): string {
  return `${locale === 'zh' ? '/zh' : ''}/${pageId}`;
}

export function getStaticInfoPage(locale: DisplayLocale, pageId: StaticInfoPageId): StaticInfoPage {
  return {
    id: pageId,
    locale,
    path: buildStaticInfoPath(locale, pageId),
    updatedLabel: locale === 'zh' ? `更新于 ${updatedDate.zh}` : `Updated ${updatedDate.en}`,
    ...staticInfoCopy[pageId][locale]
  };
}

export function getStaticInfoFooterLinks(locale: DisplayLocale): Array<{ id: StaticInfoPageId; label: string; href: string }> {
  return staticInfoPageIds.map((pageId) => ({
    id: pageId,
    label: staticInfoCopy[pageId][locale].navLabel,
    href: buildStaticInfoPath(locale, pageId)
  }));
}
