/**
 * 文件说明: 渲染 City Finder 页面专属的天气、温度、湿度、降水、风速、海拔和日期窗口筛选 Dock。
 * 对应文档: docs/prototypes/weather-filter-interaction/index.html
 */
'use client';

import * as Slider from '@radix-ui/react-slider';
import { useState, type ReactNode } from 'react';
import {
  CalendarDays,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Cloudy,
  Droplets,
  Mountain,
  Snowflake,
  Sun,
  ThermometerSun,
  Wind
} from 'lucide-react';
import type { WeatherType } from 'weather-core/types';
import { formatCompactTemperatureRange } from '@/domain/format';
import {
  allWeatherTypes,
  applyWeatherPreset,
  elevationFilterBounds,
  getWeatherPresetLabel,
  getWeatherTypeLabel,
  humidityFilterBounds,
  precipitationFilterBounds,
  temperatureFilterBounds,
  windSpeedFilterBounds,
  weatherPresets
} from '@/domain/weather';
import { FilterDock } from './FilterDock';
import { FilterPanelHeader } from './FilterPanelHeader';
import { FilterPopoverCard } from './FilterPopoverCard';
import { filterCopy } from './filterCopy';
import { formatCompactRange } from './filterFormat';
import { PresetButton } from './PresetButton';
import { RegionFields } from './RegionFields';
import type { CityFinderFilterDockProps, FilterKey, RangePreset, WeatherTypePreset } from './types';

const weatherTypeIcons: Record<WeatherType, ReactNode> = {
  sunny: <Sun size={17} />,
  partly_cloudy: <CloudSun size={17} />,
  cloudy: <Cloud size={17} />,
  overcast: <Cloudy size={17} />,
  fog: <CloudFog size={17} />,
  light_rain: <CloudDrizzle size={17} />,
  rain: <CloudRain size={17} />,
  thunderstorm: <CloudLightning size={17} />,
  light_snow: <Snowflake size={17} />,
  snow: <CloudSnow size={17} />
};

const temperaturePresets: RangePreset[] = [
  { id: 'cold', labels: { zh: '偏冷', en: 'Cold' }, values: [-10, 10] },
  { id: 'cool', labels: { zh: '清凉', en: 'Cool' }, values: [8, 22] },
  { id: 'mild', labels: { zh: '舒适', en: 'Mild' }, values: [15, 30] },
  { id: 'warm', labels: { zh: '温暖', en: 'Warm' }, values: [20, 35] },
  { id: 'hot', labels: { zh: '炎热', en: 'Hot' }, values: [28, 45] }
];

const humidityPresets: RangePreset[] = [
  { id: 'dry', labels: { zh: '干爽', en: 'Dry' }, values: [20, 55] },
  { id: 'comfortable', labels: { zh: '舒适', en: 'Comfort' }, values: [40, 70] },
  { id: 'humid', labels: { zh: '湿润', en: 'Humid' }, values: [65, 90] },
  { id: 'very-humid', labels: { zh: '潮湿', en: 'Very humid' }, values: [80, 100] }
];

const precipitationPresets: RangePreset[] = [
  { id: 'none', labels: { zh: '无雨', en: 'Dry' }, values: [0, 0] },
  { id: 'light', labels: { zh: '小雨', en: 'Light' }, values: [0, 5] },
  { id: 'moderate', labels: { zh: '中等', en: 'Moderate' }, values: [0, 15] },
  { id: 'heavy', labels: { zh: '明显降水', en: 'Wet' }, values: [5, precipitationFilterBounds.maxMm] }
];

const windSpeedPresets: RangePreset[] = [
  { id: 'calm', labels: { zh: '微风', en: 'Calm' }, values: [0, 20] },
  { id: 'breezy', labels: { zh: '有风', en: 'Breezy' }, values: [10, 35] },
  { id: 'windy', labels: { zh: '大风', en: 'Windy' }, values: [30, windSpeedFilterBounds.maxKmh] }
];

const elevationPresets: RangePreset[] = [
  { id: 'lowland', labels: { zh: '低海拔', en: 'Lowland' }, values: [elevationFilterBounds.minMeters, 500] },
  { id: 'midland', labels: { zh: '中海拔', en: 'Midland' }, values: [500, 1500] },
  { id: 'highland', labels: { zh: '高海拔', en: 'Highland' }, values: [1500, elevationFilterBounds.maxMeters] },
  { id: 'mountain', labels: { zh: '山地', en: 'Mountain' }, values: [2500, elevationFilterBounds.maxMeters] }
];

const weatherTypePresets: WeatherTypePreset[] = [
  { id: 'sunny', labels: { zh: '晴朗', en: 'Sunny' }, weatherTypes: ['sunny', 'partly_cloudy'] },
  { id: 'cloud-fog', labels: { zh: '云雾', en: 'Cloud/fog' }, weatherTypes: ['cloudy', 'overcast', 'fog'] },
  { id: 'no-rain', labels: { zh: '无雨', en: 'No rain' }, weatherTypes: ['sunny', 'partly_cloudy', 'cloudy', 'overcast', 'fog'] },
  { id: 'rain', labels: { zh: '下雨', en: 'Rain' }, weatherTypes: ['light_rain', 'rain', 'thunderstorm'] },
  { id: 'snow', labels: { zh: '下雪', en: 'Snow' }, weatherTypes: ['light_snow', 'snow'] }
];

export function CityFinderFilterDock({
  locale,
  temperatureUnit,
  weatherFilter,
  setWeatherFilter,
  primaryRegion,
  currentRegion,
  primaryRegionOptions,
  subRegionOptions,
  canSelectSubRegion,
  selectedWeatherSummary,
  onPrimaryRegionChange,
  onSubRegionChange
}: CityFinderFilterDockProps) {
  const copy = filterCopy[locale];
  const [activeKey, setActiveKey] = useState<FilterKey | null>(null);
  const closePanel = (key?: FilterKey) => {
    setActiveKey((current) => {
      if (key && current !== key) return current;
      return null;
    });
  };
  const temperatureValue = weatherFilter.useTemperature
    ? formatCompactTemperatureRange(weatherFilter.temperatureMinC, weatherFilter.temperatureMaxC, locale, temperatureUnit)
    : copy.off;
  const humidityValue = weatherFilter.useHumidity
    ? formatCompactRange(weatherFilter.humidityMinPercent, weatherFilter.humidityMaxPercent, '%', locale)
    : copy.off;
  const precipitationValue = weatherFilter.usePrecipitation
    ? formatCompactRange(weatherFilter.precipitationMinMm, weatherFilter.precipitationMaxMm, 'mm', locale)
    : copy.off;
  const windValue = weatherFilter.useWind
    ? formatCompactRange(weatherFilter.windSpeedMinKmh, weatherFilter.windSpeedMaxKmh, 'km/h', locale)
    : copy.off;
  const elevationValue = weatherFilter.useElevation
    ? formatCompactRange(weatherFilter.elevationMinMeters, weatherFilter.elevationMaxMeters, 'm', locale)
    : copy.off;
  const weatherValue = weatherFilter.useWeather ? selectedWeatherSummary : copy.off;

  const setRange = (key: 'temperature' | 'humidity' | 'precipitation' | 'wind' | 'elevation', [min, max]: [number, number]) => {
    setWeatherFilter((current) => {
      if (key === 'temperature') {
        return { ...current, useTemperature: true, temperatureMinC: min, temperatureMaxC: max };
      }
      if (key === 'humidity') {
        return { ...current, useHumidity: true, humidityMinPercent: min, humidityMaxPercent: max };
      }
      if (key === 'precipitation') {
        return { ...current, usePrecipitation: true, precipitationMinMm: min, precipitationMaxMm: max };
      }
      if (key === 'wind') {
        return { ...current, useWind: true, windSpeedMinKmh: min, windSpeedMaxKmh: max };
      }
      return { ...current, useElevation: true, elevationMinMeters: min, elevationMaxMeters: max };
    });
  };

  const toggleWeatherType = (type: WeatherType) => {
    setWeatherFilter((current) => {
      const exists = current.weatherTypes.includes(type);
      const weatherTypes = exists ? current.weatherTypes.filter((item) => item !== type) : [...current.weatherTypes, type];
      return { ...current, useWeather: true, weatherTypes: weatherTypes.length > 0 ? weatherTypes : current.weatherTypes };
    });
  };

  return (
    <FilterDock
      presets={
        <>
          <span className="filter-presets-label">{copy.quickFilters}</span>
          <div className="filter-preset-row">
            {weatherPresets.map((preset) => (
              <PresetButton key={preset.id} onClick={() => setWeatherFilter((current) => applyWeatherPreset(current, preset))}>
                {getWeatherPresetLabel(preset, locale)}
              </PresetButton>
            ))}
          </div>
        </>
      }
    >
      <RegionFields
        locale={locale}
        primaryRegion={primaryRegion}
        currentRegion={currentRegion}
        primaryRegionOptions={primaryRegionOptions}
        subRegionOptions={subRegionOptions}
        canSelectSubRegion={canSelectSubRegion}
        onPrimaryRegionChange={onPrimaryRegionChange}
        onSubRegionChange={onSubRegionChange}
      />

      <label className="filter-select-card">
        <span className="filter-summary-label">
          <CalendarDays size={15} />
          {copy.time}
        </span>
        <select
          value={weatherFilter.dateWindowDays}
          onChange={(event) => setWeatherFilter((current) => ({ ...current, dateWindowDays: Number(event.target.value) }))}
        >
          {[3, 5, 7, 10, 14].map((days) => (
            <option key={days} value={days}>
              {copy.nextDays(days)}
            </option>
          ))}
        </select>
      </label>

      <FilterPopoverCard
        filterKey="weather"
        activeKey={activeKey}
        label={copy.weather}
        value={weatherValue}
        icon={<CloudSun size={15} />}
        onOpen={setActiveKey}
        onClose={closePanel}
      >
        <FilterPanelHeader
          title={copy.weather}
          value={weatherValue}
          doneLabel={copy.done}
          enabledLabel={copy.enabled}
          enabled={weatherFilter.useWeather}
          onEnabledChange={(enabled) => setWeatherFilter((current) => ({ ...current, useWeather: enabled }))}
          onClose={closePanel}
        />
        <div className="filter-local-presets">
          {weatherTypePresets.map((preset) => (
            <PresetButton
              key={preset.id}
              onClick={() => setWeatherFilter((current) => ({ ...current, useWeather: true, weatherTypes: [...preset.weatherTypes] }))}
            >
              {preset.labels[locale]}
            </PresetButton>
          ))}
        </div>
        <div className={`weather-chip-row ${weatherFilter.useWeather ? '' : 'is-disabled'}`} aria-label={copy.weather}>
          {allWeatherTypes.map((type) => (
            <button
              key={type}
              className={weatherFilter.weatherTypes.includes(type) ? 'is-selected' : ''}
              type="button"
              title={getWeatherTypeLabel(type, locale)}
              aria-label={getWeatherTypeLabel(type, locale)}
              disabled={!weatherFilter.useWeather}
              onClick={() => toggleWeatherType(type)}
            >
              {weatherTypeIcons[type]}
            </button>
          ))}
        </div>
      </FilterPopoverCard>

      <FilterPopoverCard
        filterKey="temperature"
        activeKey={activeKey}
        label={copy.temperature}
        value={temperatureValue}
        icon={<ThermometerSun size={15} />}
        onOpen={setActiveKey}
        onClose={closePanel}
      >
        <FilterPanelHeader
          title={copy.temperature}
          value={temperatureValue}
          doneLabel={copy.done}
          enabledLabel={copy.enabled}
          enabled={weatherFilter.useTemperature}
          onEnabledChange={(enabled) => setWeatherFilter((current) => ({ ...current, useTemperature: enabled }))}
          onClose={closePanel}
        />
        <div className="filter-local-presets">
          {temperaturePresets.map((preset) => (
            <PresetButton key={preset.id} onClick={() => setRange('temperature', preset.values)}>
              {preset.labels[locale]}
            </PresetButton>
          ))}
        </div>
        <Slider.Root
          className="temperature-slider"
          value={[weatherFilter.temperatureMinC, weatherFilter.temperatureMaxC]}
          min={temperatureFilterBounds.minC}
          max={temperatureFilterBounds.maxC}
          step={1}
          minStepsBetweenThumbs={1}
          disabled={!weatherFilter.useTemperature}
          onValueChange={([temperatureMinC, temperatureMaxC]) =>
            setWeatherFilter((current) => ({ ...current, temperatureMinC, temperatureMaxC }))
          }
        >
          <Slider.Track className="temperature-slider-track">
            <Slider.Range className="temperature-slider-range" />
          </Slider.Track>
          <Slider.Thumb className="temperature-slider-thumb" aria-label={copy.minTemperature} />
          <Slider.Thumb className="temperature-slider-thumb" aria-label={copy.maxTemperature} />
        </Slider.Root>
      </FilterPopoverCard>

      <FilterPopoverCard
        filterKey="humidity"
        activeKey={activeKey}
        label={copy.humidity}
        value={humidityValue}
        icon={<Droplets size={15} />}
        onOpen={setActiveKey}
        onClose={closePanel}
      >
        <FilterPanelHeader
          title={copy.humidity}
          value={humidityValue}
          doneLabel={copy.done}
          enabledLabel={copy.enabled}
          enabled={weatherFilter.useHumidity}
          onEnabledChange={(enabled) => setWeatherFilter((current) => ({ ...current, useHumidity: enabled }))}
          onClose={closePanel}
        />
        <div className="filter-local-presets">
          {humidityPresets.map((preset) => (
            <PresetButton key={preset.id} onClick={() => setRange('humidity', preset.values)}>
              {preset.labels[locale]}
            </PresetButton>
          ))}
        </div>
        <Slider.Root
          className="humidity-slider"
          value={[weatherFilter.humidityMinPercent, weatherFilter.humidityMaxPercent]}
          min={humidityFilterBounds.minPercent}
          max={humidityFilterBounds.maxPercent}
          step={1}
          minStepsBetweenThumbs={1}
          disabled={!weatherFilter.useHumidity}
          onValueChange={([humidityMinPercent, humidityMaxPercent]) =>
            setWeatherFilter((current) => ({ ...current, humidityMinPercent, humidityMaxPercent }))
          }
        >
          <Slider.Track className="humidity-slider-track">
            <Slider.Range className="humidity-slider-range" />
          </Slider.Track>
          <Slider.Thumb className="humidity-slider-thumb" aria-label={copy.minHumidity} />
          <Slider.Thumb className="humidity-slider-thumb" aria-label={copy.maxHumidity} />
        </Slider.Root>
      </FilterPopoverCard>

      <FilterPopoverCard
        filterKey="precipitation"
        activeKey={activeKey}
        label={copy.precipitation}
        value={precipitationValue}
        icon={<CloudRain size={15} />}
        onOpen={setActiveKey}
        onClose={closePanel}
      >
        <FilterPanelHeader
          title={copy.precipitation}
          value={precipitationValue}
          doneLabel={copy.done}
          enabledLabel={copy.enabled}
          enabled={weatherFilter.usePrecipitation}
          onEnabledChange={(enabled) => setWeatherFilter((current) => ({ ...current, usePrecipitation: enabled }))}
          onClose={closePanel}
        />
        <div className="filter-local-presets">
          {precipitationPresets.map((preset) => (
            <PresetButton key={preset.id} onClick={() => setRange('precipitation', preset.values)}>
              {preset.labels[locale]}
            </PresetButton>
          ))}
        </div>
        <Slider.Root
          className="precipitation-slider"
          value={[weatherFilter.precipitationMinMm, weatherFilter.precipitationMaxMm]}
          min={precipitationFilterBounds.minMm}
          max={precipitationFilterBounds.maxMm}
          step={1}
          minStepsBetweenThumbs={0}
          disabled={!weatherFilter.usePrecipitation}
          onValueChange={([precipitationMinMm, precipitationMaxMm]) =>
            setWeatherFilter((current) => ({ ...current, precipitationMinMm, precipitationMaxMm }))
          }
        >
          <Slider.Track className="precipitation-slider-track">
            <Slider.Range className="precipitation-slider-range" />
          </Slider.Track>
          <Slider.Thumb className="precipitation-slider-thumb" aria-label={copy.minPrecipitation} />
          <Slider.Thumb className="precipitation-slider-thumb" aria-label={copy.maxPrecipitation} />
        </Slider.Root>
      </FilterPopoverCard>

      <FilterPopoverCard
        filterKey="wind"
        activeKey={activeKey}
        label={copy.wind}
        value={windValue}
        icon={<Wind size={15} />}
        onOpen={setActiveKey}
        onClose={closePanel}
      >
        <FilterPanelHeader
          title={copy.wind}
          value={windValue}
          doneLabel={copy.done}
          enabledLabel={copy.enabled}
          enabled={weatherFilter.useWind}
          onEnabledChange={(enabled) => setWeatherFilter((current) => ({ ...current, useWind: enabled }))}
          onClose={closePanel}
        />
        <div className="filter-local-presets">
          {windSpeedPresets.map((preset) => (
            <PresetButton key={preset.id} onClick={() => setRange('wind', preset.values)}>
              {preset.labels[locale]}
            </PresetButton>
          ))}
        </div>
        <Slider.Root
          className="wind-slider"
          value={[weatherFilter.windSpeedMinKmh, weatherFilter.windSpeedMaxKmh]}
          min={windSpeedFilterBounds.minKmh}
          max={windSpeedFilterBounds.maxKmh}
          step={1}
          minStepsBetweenThumbs={1}
          disabled={!weatherFilter.useWind}
          onValueChange={([windSpeedMinKmh, windSpeedMaxKmh]) =>
            setWeatherFilter((current) => ({ ...current, windSpeedMinKmh, windSpeedMaxKmh }))
          }
        >
          <Slider.Track className="wind-slider-track">
            <Slider.Range className="wind-slider-range" />
          </Slider.Track>
          <Slider.Thumb className="wind-slider-thumb" aria-label={copy.minWind} />
          <Slider.Thumb className="wind-slider-thumb" aria-label={copy.maxWind} />
        </Slider.Root>
      </FilterPopoverCard>

      <FilterPopoverCard
        filterKey="elevation"
        activeKey={activeKey}
        label={copy.elevation}
        value={elevationValue}
        icon={<Mountain size={15} />}
        onOpen={setActiveKey}
        onClose={closePanel}
      >
        <FilterPanelHeader
          title={copy.elevation}
          value={elevationValue}
          doneLabel={copy.done}
          enabledLabel={copy.enabled}
          enabled={weatherFilter.useElevation}
          onEnabledChange={(enabled) => setWeatherFilter((current) => ({ ...current, useElevation: enabled }))}
          onClose={closePanel}
        />
        <div className="filter-local-presets">
          {elevationPresets.map((preset) => (
            <PresetButton key={preset.id} onClick={() => setRange('elevation', preset.values)}>
              {preset.labels[locale]}
            </PresetButton>
          ))}
        </div>
        <Slider.Root
          className="elevation-slider"
          value={[weatherFilter.elevationMinMeters, weatherFilter.elevationMaxMeters]}
          min={elevationFilterBounds.minMeters}
          max={elevationFilterBounds.maxMeters}
          step={100}
          minStepsBetweenThumbs={1}
          disabled={!weatherFilter.useElevation}
          onValueChange={([elevationMinMeters, elevationMaxMeters]) =>
            setWeatherFilter((current) => ({ ...current, elevationMinMeters, elevationMaxMeters }))
          }
        >
          <Slider.Track className="elevation-slider-track">
            <Slider.Range className="elevation-slider-range" />
          </Slider.Track>
          <Slider.Thumb className="elevation-slider-thumb" aria-label={copy.minElevation} />
          <Slider.Thumb className="elevation-slider-thumb" aria-label={copy.maxElevation} />
        </Slider.Root>
      </FilterPopoverCard>
    </FilterDock>
  );
}
