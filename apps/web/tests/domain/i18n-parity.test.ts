/**
 * 文件说明: 验证轻量 i18n messages 各语言保留相同 key 结构，避免新增语言时漏配文案。
 */

import { describe, expect, it } from 'vitest';
import { defaultLocale, messages, staticInfoMessages, supportedLocales } from '@/i18n';

function listMessageKeys(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string' || typeof value === 'function') return [prefix];
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const childPrefix = prefix ? `${prefix}.${key}` : key;

    return listMessageKeys(child, childPrefix);
  });
}

describe('i18n messages', () => {
  it('keeps message keys aligned across supported locales', () => {
    const expectedKeys = listMessageKeys(messages[defaultLocale]).sort();

    for (const locale of supportedLocales) {
      expect(listMessageKeys(messages[locale]).sort()).toEqual(expectedKeys);
    }
  });

  it('keeps static info page keys aligned across supported locales', () => {
    const expectedKeys = listMessageKeys(staticInfoMessages[defaultLocale]).sort();

    for (const locale of supportedLocales) {
      expect(listMessageKeys(staticInfoMessages[locale]).sort()).toEqual(expectedKeys);
    }
  });
});
