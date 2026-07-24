/**
 * 文件说明: 统一定义关于、隐私声明和免责声明页面的路由契约，并从 i18n 组装页面内容。
 * 对应文档: docs/specs/32-public-data-contract.md
 */
import { staticInfoMessages } from '@/i18n/static-info';
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

export function buildStaticInfoPath(locale: DisplayLocale, pageId: StaticInfoPageId): string {
  return `${locale === 'zh' ? '/zh' : ''}/${pageId}`;
}

export function getStaticInfoPage(locale: DisplayLocale, pageId: StaticInfoPageId): StaticInfoPage {
  return {
    id: pageId,
    locale,
    path: buildStaticInfoPath(locale, pageId),
    ...staticInfoMessages[locale][pageId]
  };
}

export function getStaticInfoFooterLinks(locale: DisplayLocale): Array<{ id: StaticInfoPageId; label: string; href: string }> {
  return staticInfoPageIds.map((pageId) => ({
    id: pageId,
    label: staticInfoMessages[locale][pageId].navLabel,
    href: buildStaticInfoPath(locale, pageId)
  }));
}
