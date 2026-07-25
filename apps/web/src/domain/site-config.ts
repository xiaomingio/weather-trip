/**
 * 文件说明: 定义 Web 公开站点配置真源（正式域名、统计、静态/R2 数据入口），供构建和运行时读取。
 * 对应文档: docs/specs/50-launch.md, docs/specs/51-runtime.md
 */

export type SiteConfig = {
  siteUrl: string;
  umami: {
    scriptUrl: string;
    websiteId: string;
  };
  staticDataBaseUrl: string;
  /** 生产环境天气 current / forecast 的公开读入口（R2 custom domain）。 */
  weatherDataBaseUrl: string;
  geoVectorBaseUrl: string;
};

/**
 * 生产公开配置。会进入 Git 与静态构建产物；不放密钥。
 * 本机 `.env*` 不作为生产真源。
 */
export const siteConfig: SiteConfig = {
  siteUrl: 'https://weather-trip.aicake.io',
  umami: {
    scriptUrl: 'https://stats.aicake.io/script.js',
    websiteId: 'd65fd5cf-0c89-4901-b29a-9ba4d4b8976c'
  },
  staticDataBaseUrl: '/data',
  weatherDataBaseUrl: 'https://weather-data.aicake.io',
  geoVectorBaseUrl: '/data/geo/region-tiles'
};

export const siteOrigin = siteConfig.siteUrl.replace(/\/$/, '');

/** 开发读本地 public/data；生产构建读 R2 公开域名。 */
export function getWeatherDataBaseUrl(): string {
  if (import.meta.env.DEV) return siteConfig.staticDataBaseUrl;
  return siteConfig.weatherDataBaseUrl;
}

export function getStaticDataBaseUrl(): string {
  return siteConfig.staticDataBaseUrl;
}

export function getGeoVectorBaseUrl(): string {
  return siteConfig.geoVectorBaseUrl;
}

/** 仅生产构建注入统计脚本，避免本地 dev 污染访问数据。 */
export function isUmamiEnabled(): boolean {
  const { scriptUrl, websiteId } = siteConfig.umami;
  return Boolean(import.meta.env.PROD && scriptUrl && websiteId);
}
