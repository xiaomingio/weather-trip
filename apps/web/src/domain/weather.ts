/**
 * 文件说明: 维护 Web 工具页的天气展示标签、图例符号和筛选预设。
 * 对应文档: docs/product-design.md
 */
import type { DisplayLocale } from './format';
import type { WeatherFilter, WeatherType } from 'weather-core/types';

type WeatherPresetFilter = Pick<
  WeatherFilter,
  | 'useTemperature'
  | 'temperatureMinC'
  | 'temperatureMaxC'
  | 'useHumidity'
  | 'humidityMinPercent'
  | 'humidityMaxPercent'
  | 'usePrecipitation'
  | 'precipitationMinMm'
  | 'precipitationMaxMm'
  | 'useWind'
  | 'windSpeedMinKmh'
  | 'windSpeedMaxKmh'
  | 'useElevation'
  | 'elevationMinMeters'
  | 'elevationMaxMeters'
  | 'useWeather'
  | 'weatherTypes'
>;

export type WeatherPreset = WeatherPresetFilter & {
  id: string;
  labels: Record<DisplayLocale, string>;
};

export const temperatureFilterBounds = {
  minC: -30,
  maxC: 50
};

export const humidityFilterBounds = {
  minPercent: 0,
  maxPercent: 100
};

export const precipitationFilterBounds = {
  minMm: 0,
  maxMm: 120
};

export const windSpeedFilterBounds = {
  minKmh: 0,
  maxKmh: 120
};

export const elevationFilterBounds = {
  minMeters: -500,
  maxMeters: 9000
};

export const weatherTypeLabels: Record<DisplayLocale, Record<WeatherType, string>> = {
  zh: {
    sunny: '晴天',
    partly_cloudy: '晴到多云',
    cloudy: '多云',
    overcast: '阴天',
    fog: '雾',
    light_rain: '小雨',
    rain: '雨天',
    thunderstorm: '雷雨',
    light_snow: '小雪',
    snow: '雪'
  },
  en: {
    sunny: 'Sunny',
    partly_cloudy: 'Partly cloudy',
    cloudy: 'Cloudy',
    overcast: 'Overcast',
    fog: 'Fog',
    light_rain: 'Light rain',
    rain: 'Rain',
    thunderstorm: 'Thunderstorm',
    light_snow: 'Light snow',
    snow: 'Snow'
  }
};

export const weatherTypeEmoji: Record<WeatherType, string> = {
  sunny: '☀',
  partly_cloudy: '◐',
  cloudy: '☁',
  overcast: '●',
  fog: '≋',
  light_rain: '╎',
  rain: '雨',
  thunderstorm: 'ϟ',
  light_snow: '✦',
  snow: '雪'
};

export const allWeatherTypes = Object.keys(weatherTypeLabels.zh) as WeatherType[];

const noRainWeatherTypes: WeatherType[] = ['sunny', 'partly_cloudy', 'cloudy', 'overcast', 'fog'];
const sunnyWeatherTypes: WeatherType[] = ['sunny', 'partly_cloudy'];

const defaultPresetFilter: WeatherPresetFilter = {
  useTemperature: false,
  temperatureMinC: temperatureFilterBounds.minC,
  temperatureMaxC: temperatureFilterBounds.maxC,
  useHumidity: false,
  humidityMinPercent: 40,
  humidityMaxPercent: 70,
  usePrecipitation: false,
  precipitationMinMm: precipitationFilterBounds.minMm,
  precipitationMaxMm: 5,
  useWind: false,
  windSpeedMinKmh: windSpeedFilterBounds.minKmh,
  windSpeedMaxKmh: 30,
  useElevation: false,
  elevationMinMeters: elevationFilterBounds.minMeters,
  elevationMaxMeters: elevationFilterBounds.maxMeters,
  useWeather: false,
  weatherTypes: allWeatherTypes
};

export const weatherPresets: WeatherPreset[] = [
  {
    ...defaultPresetFilter,
    id: 'comfortable',
    labels: { zh: '舒适晴朗', en: 'Comfortable sun' },
    useTemperature: true,
    temperatureMinC: 15,
    temperatureMaxC: 30,
    useWeather: true,
    weatherTypes: sunnyWeatherTypes
  },
  {
    ...defaultPresetFilter,
    id: 'dry-weather',
    labels: { zh: '舒适无雨', en: 'Comfortable dry' },
    useTemperature: true,
    temperatureMinC: 15,
    temperatureMaxC: 30,
    useWeather: true,
    weatherTypes: noRainWeatherTypes
  },
  {
    ...defaultPresetFilter,
    id: 'dry-any-temperature',
    labels: { zh: '无雨', en: 'Dry weather' },
    useWeather: true,
    weatherTypes: noRainWeatherTypes
  },
  {
    ...defaultPresetFilter,
    id: 'comfortable-temperature',
    labels: { zh: '舒适温度', en: 'Mild temperature' },
    useTemperature: true,
    temperatureMinC: 15,
    temperatureMaxC: 30
  },
  {
    ...defaultPresetFilter,
    id: 'cool-escape',
    labels: { zh: '清凉无雨', en: 'Cool and dry' },
    useTemperature: true,
    temperatureMinC: 8,
    temperatureMaxC: 26,
    useWeather: true,
    weatherTypes: noRainWeatherTypes
  },
  {
    ...defaultPresetFilter,
    id: 'warm-escape',
    labels: { zh: '温暖晴朗', en: 'Warm and sunny' },
    useTemperature: true,
    temperatureMinC: 18,
    temperatureMaxC: 34,
    useWeather: true,
    weatherTypes: sunnyWeatherTypes
  },
  {
    ...defaultPresetFilter,
    id: 'rain-mood',
    labels: { zh: '雨天', en: 'Rainy days' },
    useWeather: true,
    weatherTypes: ['light_rain', 'rain']
  },
  {
    ...defaultPresetFilter,
    id: 'snow-view',
    labels: { zh: '雪天', en: 'Snow days' },
    useWeather: true,
    weatherTypes: ['light_snow', 'snow']
  },
  {
    ...defaultPresetFilter,
    id: 'highland-cool-dry',
    labels: { zh: '高海拔清凉无雨', en: 'Highland cool dry' },
    useTemperature: true,
    temperatureMinC: 8,
    temperatureMaxC: 26,
    useElevation: true,
    elevationMinMeters: 1500,
    elevationMaxMeters: elevationFilterBounds.maxMeters,
    useWeather: true,
    weatherTypes: noRainWeatherTypes
  },
  {
    ...defaultPresetFilter,
    id: 'highland-sunny',
    labels: { zh: '高海拔无云', en: 'Highland clear' },
    useElevation: true,
    elevationMinMeters: 1500,
    elevationMaxMeters: elevationFilterBounds.maxMeters,
    useWeather: true,
    weatherTypes: ['sunny']
  },
  {
    ...defaultPresetFilter,
    id: 'lowland-comfort-dry',
    labels: { zh: '低海拔舒适无雨', en: 'Lowland mild dry' },
    useTemperature: true,
    temperatureMinC: 15,
    temperatureMaxC: 30,
    useElevation: true,
    elevationMinMeters: elevationFilterBounds.minMeters,
    elevationMaxMeters: 500,
    useWeather: true,
    weatherTypes: noRainWeatherTypes
  },
  {
    ...defaultPresetFilter,
    id: 'lowland-warm-sunny',
    labels: { zh: '低海拔温暖晴朗', en: 'Lowland warm sun' },
    useTemperature: true,
    temperatureMinC: 20,
    temperatureMaxC: 35,
    useElevation: true,
    elevationMinMeters: elevationFilterBounds.minMeters,
    elevationMaxMeters: 500,
    useWeather: true,
    weatherTypes: sunnyWeatherTypes
  }
];

export function getWeatherTypeLabel(type: WeatherType, locale: DisplayLocale): string {
  return weatherTypeLabels[locale][type];
}

export function getWeatherPresetLabel(preset: WeatherPreset, locale: DisplayLocale): string {
  return preset.labels[locale];
}

export function applyWeatherPreset(current: WeatherFilter, preset: WeatherPreset): WeatherFilter {
  return {
    ...current,
    useTemperature: preset.useTemperature,
    temperatureMinC: preset.temperatureMinC,
    temperatureMaxC: preset.temperatureMaxC,
    useHumidity: preset.useHumidity,
    humidityMinPercent: preset.humidityMinPercent,
    humidityMaxPercent: preset.humidityMaxPercent,
    usePrecipitation: preset.usePrecipitation,
    precipitationMinMm: preset.precipitationMinMm,
    precipitationMaxMm: preset.precipitationMaxMm,
    useWind: preset.useWind,
    windSpeedMinKmh: preset.windSpeedMinKmh,
    windSpeedMaxKmh: preset.windSpeedMaxKmh,
    useElevation: preset.useElevation,
    elevationMinMeters: preset.elevationMinMeters,
    elevationMaxMeters: preset.elevationMaxMeters,
    useWeather: preset.useWeather,
    weatherTypes: [...preset.weatherTypes]
  };
}
