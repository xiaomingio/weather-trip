/**
 * 文件说明: 验证 Astro 页面壳 i18n 文案各语言保留相同 key 结构。
 */

import { describe, expect, it } from 'vitest';
import { defaultLocale, pageShellMessages, supportedLocales } from '@/i18n';

function listMessageKeys(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'function') return [prefix];
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const childPrefix = prefix ? `${prefix}.${key}` : key;

    return listMessageKeys(child, childPrefix);
  });
}

describe('page shell i18n messages', () => {
  it('keeps page shell keys aligned across supported locales', () => {
    const expectedKeys = listMessageKeys(pageShellMessages[defaultLocale]).sort();

    for (const locale of supportedLocales) {
      expect(listMessageKeys(pageShellMessages[locale]).sort()).toEqual(expectedKeys);
    }
  });
});
