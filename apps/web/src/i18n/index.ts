/**
 * 文件说明: 暴露 Web UI 轻量 typed i18n 的统一入口。
 */

import type { AppMessages } from './messages';
import { messages } from './messages';
import type { Locale } from './locales';

export { defaultLocale, isLocale, supportedLocales } from './locales';
export type { Locale } from './locales';
export { messages } from './messages';
export type {
  AppMessages,
  DashboardCopyMessages,
  FilterCopyMessages,
  UiMessages,
  WeatherMapLegendKey,
  WeatherMapLegendMessages,
  WeatherMapMessages
} from './messages';
export { getPageShellMessages, getTopTabLabel, getTopTabLabels, pageShellMessages } from './page-shell';
export type { LandingCitySampleMessages, LandingSampleWeather, PageShellMessages } from './page-shell';
export { staticInfoMessages } from './static-info';
export type { StaticInfoPageMessages } from './static-info';

export function getMessages(locale: Locale): AppMessages {
  return messages[locale];
}
