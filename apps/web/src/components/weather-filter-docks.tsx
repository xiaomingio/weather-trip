/**
 * 文件说明: 提供天气工具页可复用的筛选摘要卡、桌面浮层和移动端底部面板筛选组件。
 * 对应文档: docs/product-design.md, docs/prototypes/weather-filter-interaction/index.html
 */
'use client';

import * as Slider from '@radix-ui/react-slider';
import { useEffect, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Cloudy,
  Droplets,
  Info,
  MapIcon,
  Mountain,
  SlidersHorizontal,
  Snowflake,
  Sun,
  ThermometerSun,
  Wind
} from 'lucide-react';
import type { MapLayer, RegionKey, TravelFilter, WeatherType } from 'weather-core/types';
import {
  type DisplayLocale,
  type TemperatureUnit,
  formatCompactTemperatureRange,
  formatDateLabel,
} from '@/domain/format';
import { getRegionGroup, getRegionLabel, type RegionOption } from '@/domain/regions';
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
import type { DashboardSubRegionOption } from '@/domain/weather-dashboard-shared';

type FilterKey =
  | 'temperature'
  | 'weather'
  | 'humidity'
  | 'precipitation'
  | 'wind'
  | 'elevation'
  | 'date'
  | 'layer';

type TravelFilterDockProps = {
  locale: DisplayLocale;
  temperatureUnit: TemperatureUnit;
  travelFilter: TravelFilter;
  setTravelFilter: Dispatch<SetStateAction<TravelFilter>>;
  primaryRegion: RegionKey;
  currentRegion: RegionKey;
  primaryRegionOptions: RegionOption[];
  subRegionOptions: DashboardSubRegionOption[];
  canSelectSubRegion: boolean;
  selectedWeatherSummary: string;
  onPrimaryRegionChange: (region: RegionKey) => void;
  onSubRegionChange: (region: RegionKey) => void;
};

type DailyMapFilterDockProps = {
  locale: DisplayLocale;
  primaryRegion: RegionKey;
  currentRegion: RegionKey;
  primaryRegionOptions: RegionOption[];
  subRegionOptions: DashboardSubRegionOption[];
  canSelectSubRegion: boolean;
  selectedDate: string;
  selectedDateIndex: number;
  regionAvailableDates: string[];
  layer: MapLayer;
  layers: Array<{ id: MapLayer; labels: Record<DisplayLocale, string> }>;
  onPrimaryRegionChange: (region: RegionKey) => void;
  onSubRegionChange: (region: RegionKey) => void;
  onDateChange: (date: string) => void;
  onLayerChange: (layer: MapLayer) => void;
};

type RegionFieldsProps = {
  locale: DisplayLocale;
  primaryRegion: RegionKey;
  currentRegion: RegionKey;
  primaryRegionOptions: RegionOption[];
  subRegionOptions: DashboardSubRegionOption[];
  canSelectSubRegion: boolean;
  onPrimaryRegionChange: (region: RegionKey) => void;
  onSubRegionChange: (region: RegionKey) => void;
};

type FilterDockProps = {
  children: ReactNode;
  presets?: ReactNode;
  variant?: 'travel' | 'daily';
};

type FilterPopoverCardProps = {
  filterKey: FilterKey;
  activeKey: FilterKey | null;
  label: string;
  value: string;
  icon: ReactNode;
  children: ReactNode;
  onOpen: (key: FilterKey) => void;
  onClose: (key?: FilterKey) => void;
};

type RangePreset = {
  id: string;
  labels: Record<DisplayLocale, string>;
  values: [number, number];
};

type WeatherTypePreset = {
  id: string;
  labels: Record<DisplayLocale, string>;
  weatherTypes: WeatherType[];
};

const copy = {
  zh: {
    region: '地区',
    subRegion: '省份',
    time: '时间',
    nextDays: (days: number) => `${days}天`,
    date: '日期',
    layer: '图层',
    quickFilters: '推荐',
    temperature: '气温',
    weather: '天气',
    humidity: '湿度',
    precipitation: '降水',
    wind: '风速',
    elevation: '海拔',
    all: '全部',
    off: '不限',
    enabled: '启用',
    reset: '重置',
    done: '完成',
    minTemperature: '最低温度',
    maxTemperature: '最高温度',
    minHumidity: '最低湿度',
    maxHumidity: '最高湿度',
    minPrecipitation: '最低降水',
    maxPrecipitation: '最高降水',
    minWind: '最低风速',
    maxWind: '最高风速',
    minElevation: '最低海拔',
    maxElevation: '最高海拔',
    comfortHelp: '舒适度按气温 42%、天气 28%、湿度 20% 和基础分 10% 计算，并扣除降水和最大风速；分数越高越适合户外活动。'
  },
  en: {
    region: 'Region',
    subRegion: 'Province',
    time: 'Time',
    nextDays: (days: number) => `${days}d`,
    date: 'Date',
    layer: 'Layer',
    quickFilters: 'Suggested',
    temperature: 'Temperature',
    weather: 'Weather',
    humidity: 'Humidity',
    precipitation: 'Rainfall',
    wind: 'Wind',
    elevation: 'Elevation',
    all: 'All',
    off: 'Any',
    enabled: 'Enable',
    reset: 'Reset',
    done: 'Done',
    minTemperature: 'Minimum temperature',
    maxTemperature: 'Maximum temperature',
    minHumidity: 'Minimum humidity',
    maxHumidity: 'Maximum humidity',
    minPrecipitation: 'Minimum rainfall',
    maxPrecipitation: 'Maximum rainfall',
    minWind: 'Minimum wind',
    maxWind: 'Maximum wind',
    minElevation: 'Minimum elevation',
    maxElevation: 'Maximum elevation',
    comfortHelp: 'Comfort uses temperature 42%, weather 28%, humidity 20%, and a 10% base score, then subtracts rain and max wind penalties. Higher is better for outdoor comfort.'
  }
};

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

function regionGroups(options: RegionOption[], locale: DisplayLocale): string[] {
  return Array.from(new Set(options.map((option) => getRegionGroup(option, locale))));
}

function formatCompactNumber(value: number): string {
  if (Math.abs(value) >= 1000) return `${Number((value / 1000).toFixed(1))}k`;
  return String(Math.round(value));
}

function formatCompactRange(min: number, max: number, unit: string, locale: DisplayLocale): string {
  const separator = locale === 'zh' ? '~' : '-';
  if (Math.round(min) === Math.round(max)) return `${formatCompactNumber(min)}${unit}`;
  return `${formatCompactNumber(min)}${separator}${formatCompactNumber(max)}${unit}`;
}

function FilterDock({ children, presets, variant = 'travel' }: FilterDockProps) {
  return (
    <section className="filter-dock" data-variant={variant} aria-label="Weather filters">
      <div className="filter-dock-main">{children}</div>
      {presets ? <div className="filter-dock-presets">{presets}</div> : null}
    </section>
  );
}

function FilterPopoverCard({ filterKey, activeKey, label, value, icon, children, onOpen, onClose }: FilterPopoverCardProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const popoverGapPx = 8;
  const popoverMinWidthPx = 330;
  const [popoverPosition, setPopoverPosition] = useState({ arrowLeft: 28, left: 0, top: 0, width: popoverMinWidthPx });
  const active = activeKey === filterKey;

  useEffect(() => {
    if (!active) return;

    const updatePopoverPosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const width = Math.min(Math.max(rect.width, popoverMinWidthPx), window.innerWidth - 24);
      const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12));
      const triggerCenter = rect.left + rect.width / 2;
      const arrowLeft = Math.min(Math.max(18, triggerCenter - left - 5.5), width - 29);
      setPopoverPosition({ arrowLeft, left, top: rect.bottom + popoverGapPx, width });
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    updatePopoverPosition();
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePopoverPosition);
    window.addEventListener('scroll', updatePopoverPosition, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePopoverPosition);
      window.removeEventListener('scroll', updatePopoverPosition, true);
    };
  }, [active, onClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const clearCloseTimer = () => {
    if (!closeTimerRef.current) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      if (!wrapperRef.current?.matches(':hover')) onClose(filterKey);
    }, 240);
  };

  const popoverStyle = {
    '--filter-popover-arrow-left': `${popoverPosition.arrowLeft}px`,
    '--filter-popover-left': `${popoverPosition.left}px`,
    '--filter-popover-top': `${popoverPosition.top}px`,
    '--filter-popover-width': `${popoverPosition.width}px`
  } as CSSProperties;

  return (
    <div
      ref={wrapperRef}
      className="filter-popover-card"
      data-active={active ? 'true' : undefined}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') {
          clearCloseTimer();
          onOpen(filterKey);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch') scheduleClose();
      }}
      onFocusCapture={() => onOpen(filterKey)}
    >
      <button
        ref={buttonRef}
        className="filter-summary-card"
        type="button"
        aria-expanded={active}
        onClick={() => {
          clearCloseTimer();
          if (!active) onOpen(filterKey);
        }}
      >
        <span className="filter-summary-label">
          {icon}
          {label}
        </span>
        <span className="filter-summary-value">
          <span>{value}</span>
          {active ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
        </span>
      </button>
      {active ? (
        <>
          <div className="filter-popover-bridge" style={popoverStyle} aria-hidden="true" />
          <div className="filter-popover" style={popoverStyle} role="dialog" aria-label={label}>
            {children}
          </div>
        </>
      ) : null}
    </div>
  );
}

function RegionFields({
  locale,
  primaryRegion,
  currentRegion,
  primaryRegionOptions,
  subRegionOptions,
  canSelectSubRegion,
  onPrimaryRegionChange,
  onSubRegionChange
}: RegionFieldsProps) {
  const subRegionValue = canSelectSubRegion && subRegionOptions.some((region) => region.id === currentRegion) ? currentRegion : primaryRegion;

  return (
    <>
      <label className="filter-select-card">
        <span className="filter-summary-label">
          <SlidersHorizontal size={15} />
          {copy[locale].region}
        </span>
        <select value={primaryRegion} onChange={(event) => onPrimaryRegionChange(event.target.value as RegionKey)}>
          {regionGroups(primaryRegionOptions, locale).map((group) => (
            <optgroup key={group} label={group}>
              {primaryRegionOptions
                .filter((option) => getRegionGroup(option, locale) === group)
                .map((region) => (
                  <option key={region.id} value={region.id}>
                    {getRegionLabel(region, locale)}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className={`filter-select-card ${canSelectSubRegion ? '' : 'is-disabled'}`}>
        <span className="filter-summary-label">
          <MapIcon size={15} />
          {copy[locale].subRegion}
        </span>
        <select
          value={subRegionValue}
          disabled={!canSelectSubRegion}
          onChange={(event) => onSubRegionChange(event.target.value as RegionKey)}
        >
          {subRegionOptions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function PresetButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="filter-preset-button" type="button" onClick={onClick}>
      {children}
    </button>
  );
}

function FilterPanelHeader({
  title,
  value,
  doneLabel,
  enabledLabel,
  enabled,
  onEnabledChange,
  onClose
}: {
  title: string;
  value: string;
  doneLabel: string;
  enabledLabel?: string;
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="filter-panel-title-row">
        <strong>{title}</strong>
        {typeof enabled === 'boolean' && onEnabledChange ? (
          <label className="filter-switch filter-heading-switch">
            <input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
            <span>{enabledLabel}</span>
          </label>
        ) : null}
        <button className="filter-panel-done" type="button" onClick={() => onClose()}>
          {doneLabel}
        </button>
      </div>
      <div className="filter-panel-value-row">{value}</div>
    </>
  );
}

export function TravelFilterDock({
  locale,
  temperatureUnit,
  travelFilter,
  setTravelFilter,
  primaryRegion,
  currentRegion,
  primaryRegionOptions,
  subRegionOptions,
  canSelectSubRegion,
  selectedWeatherSummary,
  onPrimaryRegionChange,
  onSubRegionChange
}: TravelFilterDockProps) {
  const [activeKey, setActiveKey] = useState<FilterKey | null>(null);
  const closePanel = (key?: FilterKey) => {
    setActiveKey((current) => {
      if (key && current !== key) return current;
      return null;
    });
  };
  const temperatureValue = travelFilter.useTemperature
    ? formatCompactTemperatureRange(travelFilter.temperatureMinC, travelFilter.temperatureMaxC, locale, temperatureUnit)
    : copy[locale].off;
  const humidityValue = travelFilter.useHumidity
    ? formatCompactRange(travelFilter.humidityMinPercent, travelFilter.humidityMaxPercent, '%', locale)
    : copy[locale].off;
  const precipitationValue = travelFilter.usePrecipitation
    ? formatCompactRange(travelFilter.precipitationMinMm, travelFilter.precipitationMaxMm, 'mm', locale)
    : copy[locale].off;
  const windValue = travelFilter.useWind
    ? formatCompactRange(travelFilter.windSpeedMinKmh, travelFilter.windSpeedMaxKmh, 'km/h', locale)
    : copy[locale].off;
  const elevationValue = travelFilter.useElevation
    ? formatCompactRange(travelFilter.elevationMinMeters, travelFilter.elevationMaxMeters, 'm', locale)
    : copy[locale].off;
  const weatherValue = travelFilter.useWeather ? selectedWeatherSummary : copy[locale].off;

  const setRange = (key: 'temperature' | 'humidity' | 'precipitation' | 'wind' | 'elevation', [min, max]: [number, number]) => {
    setTravelFilter((current) => {
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
    setTravelFilter((current) => {
      const exists = current.weatherTypes.includes(type);
      const weatherTypes = exists ? current.weatherTypes.filter((item) => item !== type) : [...current.weatherTypes, type];
      return { ...current, useWeather: true, weatherTypes: weatherTypes.length > 0 ? weatherTypes : current.weatherTypes };
    });
  };

  return (
    <FilterDock
      presets={
        <>
          <span className="filter-presets-label">{copy[locale].quickFilters}</span>
          <div className="filter-preset-row">
            {weatherPresets.map((preset) => (
              <PresetButton key={preset.id} onClick={() => setTravelFilter((current) => applyWeatherPreset(current, preset))}>
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
          {copy[locale].time}
        </span>
        <select
          value={travelFilter.dateWindowDays}
          onChange={(event) => setTravelFilter((current) => ({ ...current, dateWindowDays: Number(event.target.value) }))}
        >
          {[3, 5, 7, 10, 14].map((days) => (
            <option key={days} value={days}>
              {copy[locale].nextDays(days)}
            </option>
          ))}
        </select>
      </label>

      <FilterPopoverCard
        filterKey="weather"
        activeKey={activeKey}
        label={copy[locale].weather}
        value={weatherValue}
        icon={<CloudSun size={15} />}
        onOpen={setActiveKey}
        onClose={closePanel}
      >
        <FilterPanelHeader
          title={copy[locale].weather}
          value={weatherValue}
          doneLabel={copy[locale].done}
          enabledLabel={copy[locale].enabled}
          enabled={travelFilter.useWeather}
          onEnabledChange={(enabled) => setTravelFilter((current) => ({ ...current, useWeather: enabled }))}
          onClose={closePanel}
        />
        <div className="filter-local-presets">
          {weatherTypePresets.map((preset) => (
            <PresetButton
              key={preset.id}
              onClick={() => setTravelFilter((current) => ({ ...current, useWeather: true, weatherTypes: [...preset.weatherTypes] }))}
            >
              {preset.labels[locale]}
            </PresetButton>
          ))}
        </div>
        <div className={`weather-chip-row ${travelFilter.useWeather ? '' : 'is-disabled'}`} aria-label={copy[locale].weather}>
          {allWeatherTypes.map((type) => (
            <button
              key={type}
              className={travelFilter.weatherTypes.includes(type) ? 'is-selected' : ''}
              type="button"
              title={getWeatherTypeLabel(type, locale)}
              aria-label={getWeatherTypeLabel(type, locale)}
              disabled={!travelFilter.useWeather}
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
        label={copy[locale].temperature}
        value={temperatureValue}
        icon={<ThermometerSun size={15} />}
        onOpen={setActiveKey}
        onClose={closePanel}
      >
        <FilterPanelHeader
          title={copy[locale].temperature}
          value={temperatureValue}
          doneLabel={copy[locale].done}
          enabledLabel={copy[locale].enabled}
          enabled={travelFilter.useTemperature}
          onEnabledChange={(enabled) => setTravelFilter((current) => ({ ...current, useTemperature: enabled }))}
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
          value={[travelFilter.temperatureMinC, travelFilter.temperatureMaxC]}
          min={temperatureFilterBounds.minC}
          max={temperatureFilterBounds.maxC}
          step={1}
          minStepsBetweenThumbs={1}
          disabled={!travelFilter.useTemperature}
          onValueChange={([temperatureMinC, temperatureMaxC]) =>
            setTravelFilter((current) => ({ ...current, temperatureMinC, temperatureMaxC }))
          }
        >
          <Slider.Track className="temperature-slider-track">
            <Slider.Range className="temperature-slider-range" />
          </Slider.Track>
          <Slider.Thumb className="temperature-slider-thumb" aria-label={copy[locale].minTemperature} />
          <Slider.Thumb className="temperature-slider-thumb" aria-label={copy[locale].maxTemperature} />
        </Slider.Root>
      </FilterPopoverCard>

      <FilterPopoverCard
        filterKey="humidity"
        activeKey={activeKey}
        label={copy[locale].humidity}
        value={humidityValue}
        icon={<Droplets size={15} />}
        onOpen={setActiveKey}
        onClose={closePanel}
      >
        <FilterPanelHeader
          title={copy[locale].humidity}
          value={humidityValue}
          doneLabel={copy[locale].done}
          enabledLabel={copy[locale].enabled}
          enabled={travelFilter.useHumidity}
          onEnabledChange={(enabled) => setTravelFilter((current) => ({ ...current, useHumidity: enabled }))}
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
          value={[travelFilter.humidityMinPercent, travelFilter.humidityMaxPercent]}
          min={humidityFilterBounds.minPercent}
          max={humidityFilterBounds.maxPercent}
          step={1}
          minStepsBetweenThumbs={1}
          disabled={!travelFilter.useHumidity}
          onValueChange={([humidityMinPercent, humidityMaxPercent]) =>
            setTravelFilter((current) => ({ ...current, humidityMinPercent, humidityMaxPercent }))
          }
        >
          <Slider.Track className="humidity-slider-track">
            <Slider.Range className="humidity-slider-range" />
          </Slider.Track>
          <Slider.Thumb className="humidity-slider-thumb" aria-label={copy[locale].minHumidity} />
          <Slider.Thumb className="humidity-slider-thumb" aria-label={copy[locale].maxHumidity} />
        </Slider.Root>
      </FilterPopoverCard>

      <FilterPopoverCard
        filterKey="precipitation"
        activeKey={activeKey}
        label={copy[locale].precipitation}
        value={precipitationValue}
        icon={<CloudRain size={15} />}
        onOpen={setActiveKey}
        onClose={closePanel}
      >
        <FilterPanelHeader
          title={copy[locale].precipitation}
          value={precipitationValue}
          doneLabel={copy[locale].done}
          enabledLabel={copy[locale].enabled}
          enabled={travelFilter.usePrecipitation}
          onEnabledChange={(enabled) => setTravelFilter((current) => ({ ...current, usePrecipitation: enabled }))}
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
          value={[travelFilter.precipitationMinMm, travelFilter.precipitationMaxMm]}
          min={precipitationFilterBounds.minMm}
          max={precipitationFilterBounds.maxMm}
          step={1}
          minStepsBetweenThumbs={0}
          disabled={!travelFilter.usePrecipitation}
          onValueChange={([precipitationMinMm, precipitationMaxMm]) =>
            setTravelFilter((current) => ({ ...current, precipitationMinMm, precipitationMaxMm }))
          }
        >
          <Slider.Track className="precipitation-slider-track">
            <Slider.Range className="precipitation-slider-range" />
          </Slider.Track>
          <Slider.Thumb className="precipitation-slider-thumb" aria-label={copy[locale].minPrecipitation} />
          <Slider.Thumb className="precipitation-slider-thumb" aria-label={copy[locale].maxPrecipitation} />
        </Slider.Root>
      </FilterPopoverCard>

      <FilterPopoverCard
        filterKey="wind"
        activeKey={activeKey}
        label={copy[locale].wind}
        value={windValue}
        icon={<Wind size={15} />}
        onOpen={setActiveKey}
        onClose={closePanel}
      >
        <FilterPanelHeader
          title={copy[locale].wind}
          value={windValue}
          doneLabel={copy[locale].done}
          enabledLabel={copy[locale].enabled}
          enabled={travelFilter.useWind}
          onEnabledChange={(enabled) => setTravelFilter((current) => ({ ...current, useWind: enabled }))}
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
          value={[travelFilter.windSpeedMinKmh, travelFilter.windSpeedMaxKmh]}
          min={windSpeedFilterBounds.minKmh}
          max={windSpeedFilterBounds.maxKmh}
          step={1}
          minStepsBetweenThumbs={1}
          disabled={!travelFilter.useWind}
          onValueChange={([windSpeedMinKmh, windSpeedMaxKmh]) =>
            setTravelFilter((current) => ({ ...current, windSpeedMinKmh, windSpeedMaxKmh }))
          }
        >
          <Slider.Track className="wind-slider-track">
            <Slider.Range className="wind-slider-range" />
          </Slider.Track>
          <Slider.Thumb className="wind-slider-thumb" aria-label={copy[locale].minWind} />
          <Slider.Thumb className="wind-slider-thumb" aria-label={copy[locale].maxWind} />
        </Slider.Root>
      </FilterPopoverCard>

      <FilterPopoverCard
        filterKey="elevation"
        activeKey={activeKey}
        label={copy[locale].elevation}
        value={elevationValue}
        icon={<Mountain size={15} />}
        onOpen={setActiveKey}
        onClose={closePanel}
      >
        <FilterPanelHeader
          title={copy[locale].elevation}
          value={elevationValue}
          doneLabel={copy[locale].done}
          enabledLabel={copy[locale].enabled}
          enabled={travelFilter.useElevation}
          onEnabledChange={(enabled) => setTravelFilter((current) => ({ ...current, useElevation: enabled }))}
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
          value={[travelFilter.elevationMinMeters, travelFilter.elevationMaxMeters]}
          min={elevationFilterBounds.minMeters}
          max={elevationFilterBounds.maxMeters}
          step={100}
          minStepsBetweenThumbs={1}
          disabled={!travelFilter.useElevation}
          onValueChange={([elevationMinMeters, elevationMaxMeters]) =>
            setTravelFilter((current) => ({ ...current, elevationMinMeters, elevationMaxMeters }))
          }
        >
          <Slider.Track className="elevation-slider-track">
            <Slider.Range className="elevation-slider-range" />
          </Slider.Track>
          <Slider.Thumb className="elevation-slider-thumb" aria-label={copy[locale].minElevation} />
          <Slider.Thumb className="elevation-slider-thumb" aria-label={copy[locale].maxElevation} />
        </Slider.Root>
      </FilterPopoverCard>
    </FilterDock>
  );
}

export function DailyMapFilterDock({
  locale,
  primaryRegion,
  currentRegion,
  primaryRegionOptions,
  subRegionOptions,
  canSelectSubRegion,
  selectedDate,
  selectedDateIndex,
  regionAvailableDates,
  layer,
  layers,
  onPrimaryRegionChange,
  onSubRegionChange,
  onDateChange,
  onLayerChange
}: DailyMapFilterDockProps) {
  const selectedDateLabel = selectedDate ? formatDateLabel(selectedDate, locale) : copy[locale].off;

  return (
    <FilterDock variant="daily">
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

      <div className="filter-select-card filter-inline-card">
        <span className="filter-summary-label">
          <CalendarDays size={15} />
          {copy[locale].date}
        </span>
        <span className="filter-summary-value">
          <span>{selectedDateLabel}</span>
        </span>
        <Slider.Root
          className="date-slider"
          value={[selectedDateIndex]}
          min={0}
          max={Math.max(regionAvailableDates.length - 1, 0)}
          step={1}
          disabled={regionAvailableDates.length <= 1}
          onValueChange={([dateIndex]) => onDateChange(regionAvailableDates[dateIndex] ?? selectedDate)}
        >
          <Slider.Track className="date-slider-track">
            <Slider.Range className="date-slider-range" />
          </Slider.Track>
          <Slider.Thumb className="date-slider-thumb" aria-label={copy[locale].date} />
        </Slider.Root>
      </div>

      <div className="filter-select-card filter-inline-card filter-layer-card">
        <span className="filter-summary-label">
          <MapIcon size={15} />
          {copy[locale].layer}
        </span>
        <div className="layer-button-row compact" aria-label={copy[locale].layer}>
          {layers.map((item) => (
            <button
              key={item.id}
              className={`${layer === item.id ? 'is-active' : ''} ${item.id === 'comfort' ? 'has-info' : ''}`}
              type="button"
              aria-describedby={item.id === 'comfort' ? 'comfort-layer-help' : undefined}
              onClick={() => onLayerChange(item.id)}
            >
              <span>{item.labels[locale]}</span>
              {item.id === 'comfort' ? (
                <span className="layer-info" aria-hidden="true">
                  <Info size={13} />
                  <span id="comfort-layer-help" className="layer-info-tooltip" role="tooltip">
                    {copy[locale].comfortHelp}
                  </span>
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </FilterDock>
  );
}
