/**
 * 文件说明: 定义 Web UI 文案支持的语言类型、默认语言和轻量判断入口。
 */

import type { DisplayLocale } from '@/domain/format';

export type Locale = DisplayLocale;

export const supportedLocales = ['zh', 'en'] as const satisfies readonly Locale[];
export const defaultLocale = 'en' satisfies Locale;

export function isLocale(value: string): value is Locale {
  return (supportedLocales as readonly string[]).includes(value);
}
