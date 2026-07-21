import { describe, expect, it } from 'vitest';
import { readLocaleFromSearchParams } from './weather-dashboard.json';

describe('weather dashboard API parameters', () => {
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
