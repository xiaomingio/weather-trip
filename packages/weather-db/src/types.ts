/**
 * 文件说明: 定义 weather-db 对外暴露的数据连接、天气快照、刷新状态和导入数据类型。
 * 对应文档: docs/data-flow.md
 */

import type { Pool } from 'pg';
import type { City, DailyForecast } from 'weather-core/types';

export type WeatherDatabase = {
  pool: Pool;
  close: () => Promise<void>;
};

export type WeatherSnapshot = {
  cities: City[];
  forecasts: DailyForecast[];
  availableDates: string[];
};

export type RefreshStatus = {
  key: string;
  lastSuccessAt?: Date;
  lastCompleteAt?: Date;
  lastErrorType?: string;
  lastErrorMessage?: string;
};

export type GeoNamesCity = {
  geonameId: number;
  name: string;
  asciiName: string;
  alternateNames: string[];
  latitude: number;
  longitude: number;
  featureClass: string;
  featureCode: string;
  countryCode: string;
  cc2?: string;
  admin1Code?: string;
  admin2Code?: string;
  admin3Code?: string;
  admin4Code?: string;
  population?: number;
  elevation?: number;
  dem?: number;
  timezone: string;
  modificationDate?: string;
  continentCode?: string;
};

export type GeoNamesAdmin1 = {
  code: string;
  countryCode: string;
  admin1Code: string;
  name: string;
  asciiName: string;
  geonameId: number;
};

export type GeoNamesAdmin2 = {
  code: string;
  countryCode: string;
  admin1Code: string;
  admin2Code: string;
  name: string;
  asciiName: string;
  geonameId: number;
};

export type GeoNamesAlternateName = {
  alternateNameId: number;
  geonameId: number;
  isoLanguage: string;
  alternateName: string;
  isPreferredName: boolean;
  isShortName: boolean;
  isColloquial: boolean;
  isHistoric: boolean;
  fromPeriod?: string;
  toPeriod?: string;
};

export type CountryTourismProfile = {
  countryCode: string;
  tier: 'global_hotspot' | 'major' | 'regional' | 'small_high_density' | 'baseline';
  populationFallback: number;
  detailedCoverage?: 'admin1' | 'admin2';
};

export type TourismDestinationSeed = {
  id: string;
  name: string;
  countryCode: string;
  geonameId?: number;
  source: 'curated' | 'wikivoyage' | 'unesco' | 'un-tourism-village' | 'reference-list';
  weatherMode: 'standalone' | 'map_to_nearest_city' | 'boost_existing_city';
  mappedGeonameId?: number;
  priority: number;
  notes?: string;
};
