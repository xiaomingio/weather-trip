/**
 * 文件说明: 定义城市、天气、筛选条件和前端展示所需的共享类型。
 * 对应文档: docs/specs/32-public-data-contract.md, docs/specs/41-weather-matrix-performance.md
 */

export type WeatherType =
  | 'sunny'
  | 'partly_cloudy'
  | 'cloudy'
  | 'overcast'
  | 'fog'
  | 'light_rain'
  | 'rain'
  | 'thunderstorm'
  | 'light_snow'
  | 'snow';

export type MapLayer = 'weather' | 'temperature' | 'humidity' | 'precipitation' | 'wind' | 'comfort' | 'elevation';

export type WeatherToolId = 'city-finder' | 'weather-map';

export type WorldRegion =
  | 'world'
  | 'asia'
  | 'europe'
  | 'north_america'
  | 'south_america'
  | 'africa'
  | 'oceania';

export type RegionKey = string;

export type CountryTier = 'C1' | 'C2' | 'C3';

export type LocalizedText = {
  zh: string;
  en: string;
};

export type City = {
  id: string;
  names: LocalizedText;
  country: string;
  countryCode?: string;
  admin1?: string;
  admin1Code?: string;
  admin1GroupCode?: string;
  admin1LocalName?: string;
  admin2?: string;
  admin2Code?: string;
  admin2LocalName?: string;
  latitude: number;
  longitude: number;
  timezone: string;
  population?: number;
  elevationMeters: number;
  region: Exclude<WorldRegion, 'world'>;
  countryTier?: CountryTier;
  rank?: number;
  countryRegionKey?: string;
  admin1RegionKey?: string;
  admin2RegionKey?: string;
  selectionReasons?: string[];
};

export type DailyForecast = {
  cityId: string;
  date: string;
  weatherCode: number;
  weatherType: WeatherType;
  temperatureMinC: number;
  temperatureMaxC: number;
  temperatureMeanC: number;
  humidityMeanPercent: number;
  precipitationProbabilityMax?: number;
  precipitationSumMm: number;
  windSpeedMaxKmh?: number;
};

export type WeatherForecastMatrix = {
  cityIds: string[]; // cityIndex -> cityId
  dates: string[]; // dateIndex -> date-only key
  indexByCityId: Map<string, number>;
  indexByDate: Map<string, number>;
  sourceElevationMeters: Int16Array; // cityIndex -> source elevation meters，-32768 表示缺失
  fields: {
    // 所有天气字段都是 date-major 矩阵：offset = dateIndex * cityIds.length + cityIndex
    weatherCode: Uint8Array;
    temperatureMinC10: Int16Array;
    temperatureMaxC10: Int16Array;
    temperatureMeanC10: Int16Array;
    humidityMeanPercent: Uint8Array;
    precipitationSumMm10: Uint16Array;
    windSpeedMaxKmh10: Uint16Array;
    missing: Uint8Array;
  };
};

export type WeatherDataSnapshot = {
  version: string;
  generatedAt: string;
  cityListVersion: string;
  defaultDate: string;
  availableDates: string[];
  cities: City[];
  forecastMatrix: WeatherForecastMatrix;
};

export type WeatherFilter = {
  dateWindowDays: number;
  useTemperature: boolean;
  temperatureMinC: number;
  temperatureMaxC: number;
  useHumidity: boolean;
  humidityMinPercent: number;
  humidityMaxPercent: number;
  usePrecipitation: boolean;
  precipitationMinMm: number;
  precipitationMaxMm: number;
  useWind: boolean;
  windSpeedMinKmh: number;
  windSpeedMaxKmh: number;
  useElevation: boolean;
  elevationMinMeters: number;
  elevationMaxMeters: number;
  useWeather: boolean;
  weatherTypes: WeatherType[];
  region: RegionKey;
};

export type CityFinderScore = {
  city: City;
  forecasts: DailyForecast[];
  matchDays: number;
  totalDays: number;
  score: number;
  averageTemperatureC: number;
  rainDays: number;
  bestStreakDays: number;
};

export type WeatherMapCityWeather = {
  city: City;
  forecast: DailyForecast;
  comfortScore: number;
};

export type RegionWeatherSummary = {
  id: string;
  level: 'country' | 'admin1' | 'admin2';
  countryCode: string;
  admin1Code?: string;
  admin2Code?: string;
  name: string;
  cityCount: number;
  forecastCount: number;
  weatherType: WeatherType;
  temperatureMeanC: number;
  humidityMeanPercent: number;
  elevationMeters: number;
  precipitationSumMm: number;
  windSpeedMaxKmh: number;
  comfortScore: number;
  matchDays: number;
  totalDays: number;
};
