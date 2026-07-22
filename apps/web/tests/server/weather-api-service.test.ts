/**
 * 文件说明: 验证天气工具公开 API 共享参数解析的稳定契约。
 */
import { describe, expect, it } from 'vitest';
import { readLocaleFromSearchParams } from '@/server/weather-api-service';

describe('weather API shared parameters', () => {
  it('defaults to English when locale is omitted', () => {
    expect(readLocaleFromSearchParams(new URLSearchParams())).toBe('en');
  });

  it('accepts supported locales', () => {
    expect(readLocaleFromSearchParams(new URLSearchParams('locale=en'))).toBe('en');
    expect(readLocaleFromSearchParams(new URLSearchParams('locale=zh'))).toBe('zh');
  });

  it('rejects unsupported locales', () => {
    expect(readLocaleFromSearchParams(new URLSearchParams('locale=xx'))).toBeNull();
  });
});
