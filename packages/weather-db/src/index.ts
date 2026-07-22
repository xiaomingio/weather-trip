/**
 * 文件说明: 汇总导出 weather-db 的连接、读取、写入、导入和刷新状态仓储能力。
 * 对应文档: docs/data-flow.md
 */

export type {
  CountryTourismProfile,
  GeoNamesAdmin1,
  GeoNamesAdmin2,
  GeoNamesAlternateName,
  GeoNamesCity,
  RefreshStatus,
  TourismDestinationSeed,
  WeatherDatabase,
  WeatherSnapshot
} from './types.js';
export { createWeatherDatabase, setupWeatherDatabase } from './connection.js';
export { getAvailableDates, readCities, readForecasts, readWeatherSnapshot } from './read-repository.js';
export { syncGeonamesCities } from './geonames-repository.js';
export { upsertForecasts } from './forecast-repository.js';
export { readRefreshStatus, updateRefreshFailure, updateRefreshSuccess } from './refresh-repository.js';
