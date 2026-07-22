/**
 * 文件说明: 定义城市、天气、筛选条件和前端展示所需的共享类型。
 * 对应文档: docs/product-design.md
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
  latitude: number;
  longitude: number;
  timezone: string;
  population?: number;
  elevationMeters: number;
  region: Exclude<WorldRegion, 'world'>;
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
  level: 'country' | 'partition';
  countryCode: string;
  partitionCode?: string;
  name: string;
  cityCount: number;
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
