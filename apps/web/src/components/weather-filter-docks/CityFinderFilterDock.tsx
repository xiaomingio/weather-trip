/**
 * 文件说明: 渲染 City Finder 页面专属的天气、温度、湿度、降水、风速、海拔和日期窗口筛选 Dock。
 * 对应文档: docs/prototypes/weather-filter-interaction/index.html
 */
'use client';

import * as Slider from '@radix-ui/react-slider';
import { useState } from 'react';
import {
  CalendarDays,
  Droplets,
  Mountain,
  ThermometerSun,
  Wind
} from 'lucide-react';
import type { WeatherType } from 'weather-core/types';
import { WeatherTypeIcon } from '@/components/WeatherTypeIcon';
import { formatCompactTemperatureRange } from '@/domain/format';
import type { FilterCopyMessages } from '@/i18n';
import { getMessages } from '@/i18n';
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
import { formatCompactRange } from './filterFormat';
import { PresetButton } from './PresetButton';
import { RegionFields } from './RegionFields';
import type { CityFinderFilterDockProps, FilterKey } from './types';

type FilterPresetMessages = FilterCopyMessages['presets'];
type RangePresetGroup = Exclude<keyof FilterPresetMessages, 'weatherType'>;
type RangePreset<Group extends RangePresetGroup> = {
  id: keyof FilterPresetMessages[Group] & string;
  values: [number, number];
};
type WeatherTypePreset = {
  id: keyof FilterPresetMessages['weatherType'] & string;
  weatherTypes: WeatherType[];
};

const temperaturePresets: RangePreset<'temperature'>[] = [
  { id: 'cold', values: [-10, 10] },
  { id: 'cool', values: [8, 22] },
  { id: 'mild', values: [15, 30] },
  { id: 'warm', values: [20, 35] },
  { id: 'hot', values: [28, 45] }
];

const humidityPresets: RangePreset<'humidity'>[] = [
  { id: 'dry', values: [20, 55] },
  { id: 'comfortable', values: [40, 70] },
  { id: 'humid', values: [65, 90] },
  { id: 'very-humid', values: [80, 100] }
];

const precipitationPresets: RangePreset<'precipitation'>[] = [
  { id: 'none', values: [0, 0] },
  { id: 'light', values: [0, 5] },
  { id: 'moderate', values: [0, 15] },
  { id: 'heavy', values: [5, precipitationFilterBounds.maxMm] }
];

const windSpeedPresets: RangePreset<'wind'>[] = [
  { id: 'calm', values: [0, 20] },
  { id: 'breezy', values: [10, 35] },
  { id: 'windy', values: [30, windSpeedFilterBounds.maxKmh] }
];

const elevationPresets: RangePreset<'elevation'>[] = [
  { id: 'lowland', values: [elevationFilterBounds.minMeters, 500] },
  { id: 'midland', values: [500, 1500] },
  { id: 'highland', values: [1500, elevationFilterBounds.maxMeters] },
  { id: 'mountain', values: [2500, elevationFilterBounds.maxMeters] }
];

const weatherTypePresets: WeatherTypePreset[] = [
  { id: 'sunny', weatherTypes: ['sunny', 'partly_cloudy'] },
  { id: 'cloud-fog', weatherTypes: ['cloudy', 'overcast', 'fog'] },
  { id: 'no-rain', weatherTypes: ['sunny', 'partly_cloudy', 'cloudy', 'overcast', 'fog'] },
  { id: 'rain', weatherTypes: ['light_rain', 'rain', 'thunderstorm'] },
  { id: 'snow', weatherTypes: ['light_snow', 'snow'] }
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
  const copy = getMessages(locale).filter;
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
      presetToggleLabels={{ expand: copy.expandQuickFilters, collapse: copy.collapseQuickFilters }}
    >
      <p className="filter-dock-intro">{copy.cityFinderIntro}</p>

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
          <span>{copy.time}</span>
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
        icon={<WeatherTypeIcon type="partly_cloudy" size={15} />}
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
              {copy.presets.weatherType[preset.id]}
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
              <WeatherTypeIcon type={type} size={17} />
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
              {copy.presets.temperature[preset.id]}
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
              {copy.presets.humidity[preset.id]}
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
        icon={<WeatherTypeIcon type="rain" size={15} />}
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
              {copy.presets.precipitation[preset.id]}
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
              {copy.presets.wind[preset.id]}
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
              {copy.presets.elevation[preset.id]}
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
