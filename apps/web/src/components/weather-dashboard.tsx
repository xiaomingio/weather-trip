/**
 * 文件说明: 组织全球天气工具的筛选状态、城市结果列表、地图和选中城市天气条。
 * 对应文档: docs/product-design.md
 */
'use client';

import * as Slider from '@radix-ui/react-slider';
import { useCallback, useMemo, useState } from 'react';
import {
  CalendarDays,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  MapIcon,
  Mountain,
  SlidersHorizontal,
  Snowflake,
  Sun,
  Cloudy,
  ThermometerSun
} from 'lucide-react';
import type {
  City,
  CityDailyWeather,
  CityTravelScore,
  DailyForecast,
  MapLayer,
  RegionKey,
  TravelFilter,
  ViewMode,
  WeatherType
} from 'weather-core/types';
import { buildDailyWeather, cityMatchesRegion, scoreCityTravel } from '@/domain/scoring';
import { buildChinaProvinceDailySummaries, buildChinaProvinceTravelSummaries } from '@/domain/region-weather';
import {
  getRegionGroup,
  getRegionLabel,
  regionOptions,
  shouldFocusChinaProvinceLayer,
  shouldShowChinaProvinceLayer
} from '@/domain/regions';
import {
  type DisplayLocale,
  formatDateLabel,
  formatCityName,
  formatCityRegion,
  formatElevation,
  formatHumidity,
  formatTemperature,
  formatTemperatureRange,
  formatWeatherType
} from '@/domain/format';
import {
  applyWeatherPreset,
  allWeatherTypes,
  elevationFilterBounds,
  getWeatherPresetLabel,
  getWeatherTypeLabel,
  humidityFilterBounds,
  temperatureFilterBounds,
  weatherPresets
} from '@/domain/weather';
import { WorldWeatherMap } from './world-weather-map';

type WeatherDashboardProps = {
  locale: DisplayLocale;
  cities: City[];
  forecasts: DailyForecast[];
  availableDates: string[];
};

const weatherTypeIcons: Record<WeatherType, React.ReactNode> = {
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

const layers: { id: MapLayer; labels: Record<DisplayLocale, string> }[] = [
  { id: 'comfort', labels: { zh: '旅行适合', en: 'Comfort' } },
  { id: 'temperature', labels: { zh: '气温', en: 'Temperature' } },
  { id: 'weather', labels: { zh: '天气', en: 'Weather' } },
  { id: 'precipitation', labels: { zh: '降水', en: 'Rainfall' } },
  { id: 'humidity', labels: { zh: '湿度', en: 'Humidity' } },
  { id: 'elevation', labels: { zh: '海拔', en: 'Elevation' } }
];

const copy = {
  zh: {
    title: '按天气反向选择下一站',
    localPreview: '数据库实时预览',
    forecast: (days: number) => `${days} 天预报`,
    filterPanel: '天气筛选',
    resultPanel: '天气结果',
    mapPanel: '地图和选中城市天气',
    viewMode: '查看模式',
    travelMode: '旅行筛选',
    dailyMode: '单日图层',
    region: '地区',
    time: '时间',
    nextDays: (days: number) => `未来 ${days} 天`,
    date: '日期',
    layer: '图层',
    quickFilters: '快速筛选',
    temperature: '气温',
    weather: '天气',
    humidity: '湿度',
    elevation: '海拔',
    all: '全部',
    coverageRegions: '覆盖区域',
    coverageCities: '覆盖城市',
    citySamples: '城市样本',
    highMatchCities: '高匹配城市',
    popularCities: '热门城市',
    suitableDays: (match: number, total: number) => `${match}/${total} 天适合`,
    average: '平均',
    dryDays: (days: number) => `少雨 ${days} 天`,
    humidityValue: (value: string) => `湿度 ${value}`,
    minTemperature: '最低温度',
    maxTemperature: '最高温度',
    minHumidity: '最低湿度',
    maxHumidity: '最高湿度',
    minElevation: '最低海拔',
    maxElevation: '最高海拔',
    precipitation: (value: number) => `降水 ${value} mm`
  },
  en: {
    title: 'Pick your next destination by weather',
    localPreview: 'Live database preview',
    forecast: (days: number) => `${days}-day forecast`,
    filterPanel: 'Weather filters',
    resultPanel: 'Weather results',
    mapPanel: 'Map and selected city forecast',
    viewMode: 'View mode',
    travelMode: 'Travel filter',
    dailyMode: 'Single-day layer',
    region: 'Region',
    time: 'Time',
    nextDays: (days: number) => `Next ${days} days`,
    date: 'Date',
    layer: 'Layer',
    quickFilters: 'Quick filters',
    temperature: 'Temperature',
    weather: 'Weather',
    humidity: 'Humidity',
    elevation: 'Elevation',
    all: 'All',
    coverageRegions: 'Regions',
    coverageCities: 'Cities',
    citySamples: 'City samples',
    highMatchCities: 'High matches',
    popularCities: 'Popular cities',
    suitableDays: (match: number, total: number) => `${match}/${total} suitable`,
    average: 'Avg',
    dryDays: (days: number) => `${days} low-rain days`,
    humidityValue: (value: string) => `Humidity ${value}`,
    minTemperature: 'Minimum temperature',
    maxTemperature: 'Maximum temperature',
    minHumidity: 'Minimum humidity',
    maxHumidity: 'Maximum humidity',
    minElevation: 'Minimum elevation',
    maxElevation: 'Maximum elevation',
    precipitation: (value: number) => `Rainfall ${value} mm`
  }
};

function groupForecastsByCity(forecasts: DailyForecast[]): Map<string, DailyForecast[]> {
  const grouped = new Map<string, DailyForecast[]>();

  for (const forecast of forecasts) {
    const list = grouped.get(forecast.cityId) ?? [];
    list.push(forecast);
    grouped.set(forecast.cityId, list);
  }

  for (const list of grouped.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  return grouped;
}

export function WeatherDashboard({ locale, cities, forecasts, availableDates }: WeatherDashboardProps) {
  const [mode, setMode] = useState<ViewMode>('travel');
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(availableDates[0] ?? '');
  const [layer, setLayer] = useState<MapLayer>('comfort');
  const [travelFilter, setTravelFilter] = useState<TravelFilter>({
    dateWindowDays: 14,
    useTemperature: true,
    temperatureMinC: 15,
    temperatureMaxC: 30,
    useHumidity: false,
    humidityMinPercent: 40,
    humidityMaxPercent: 70,
    useElevation: false,
    elevationMinMeters: elevationFilterBounds.minMeters,
    elevationMaxMeters: elevationFilterBounds.maxMeters,
    useWeather: true,
    weatherTypes: ['sunny', 'partly_cloudy'],
    region: 'country:CN'
  });

  const forecastsByCity = useMemo(() => groupForecastsByCity(forecasts), [forecasts]);

  const travelScores = useMemo(() => {
    return cities
      .filter((city) => cityMatchesRegion(city, travelFilter.region))
      .map((city) => scoreCityTravel(city, forecastsByCity.get(city.id) ?? [], travelFilter))
      .sort((a, b) => b.score - a.score || b.matchDays - a.matchDays);
  }, [cities, forecastsByCity, travelFilter]);

  const dailyWeather = useMemo(() => {
    return buildDailyWeather(cities, forecasts, selectedDate, travelFilter.region);
  }, [cities, forecasts, selectedDate, travelFilter.region]);

  const regionSummaries = useMemo(() => {
    if (!shouldShowChinaProvinceLayer(travelFilter.region)) return [];
    return mode === 'travel'
      ? buildChinaProvinceTravelSummaries(cities, forecastsByCity, travelFilter)
      : buildChinaProvinceDailySummaries(cities, forecasts, selectedDate);
  }, [cities, forecasts, forecastsByCity, mode, selectedDate, travelFilter]);

  const selectedTravelScore = travelScores.find((score) => score.city.id === selectedCityId) ?? travelScores[0];
  const selectedDailyWeather = dailyWeather.find((item) => item.city.id === selectedCityId) ?? dailyWeather[0];
  const selectedCity = mode === 'travel' ? selectedTravelScore?.city : selectedDailyWeather?.city;
  const selectedForecasts = selectedCity ? forecastsByCity.get(selectedCity.id) ?? [] : [];
  const effectiveSelectedCityId = selectedCity?.id ?? null;
  const resultItems = mode === 'travel' ? travelScores : dailyWeather;
  const selectedDateIndex = Math.max(0, availableDates.indexOf(selectedDate));
  const selectedWeatherSummary =
    travelFilter.weatherTypes.length === allWeatherTypes.length
      ? copy[locale].all
      : travelFilter.weatherTypes.map((type) => getWeatherTypeLabel(type, locale)).join(locale === 'zh' ? '、' : ', ');

  const visibleCount = mode === 'travel' ? travelScores.length : dailyWeather.length;
  const visibleRegionCount = regionSummaries.length;
  const excellentCount =
    mode === 'travel'
      ? travelScores.filter((score) => score.matchDays / Math.max(score.totalDays, 1) >= 0.7).length
      : dailyWeather.length;

  const setRegion = useCallback((region: RegionKey) => {
    setTravelFilter((current) => ({ ...current, region }));
    setSelectedCityId(null);
  }, []);

  const toggleWeatherType = useCallback((type: WeatherType) => {
    setTravelFilter((current) => {
      const exists = current.weatherTypes.includes(type);
      const weatherTypes = exists ? current.weatherTypes.filter((item) => item !== type) : [...current.weatherTypes, type];
      return { ...current, weatherTypes: weatherTypes.length > 0 ? weatherTypes : current.weatherTypes };
    });
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Global Weather Atlas</p>
          <h1>{copy[locale].title}</h1>
        </div>
        <div className="topbar-meta">
          <a href={locale === 'zh' ? '/en' : '/zh'}>{locale === 'zh' ? 'English' : '中文'}</a>
          <span>{copy[locale].localPreview}</span>
          <span>{copy[locale].forecast(availableDates.length)}</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="filter-panel" aria-label={copy[locale].filterPanel}>
          <section className="control-surface" aria-label={copy[locale].filterPanel}>
            <div className="mode-switch" role="tablist" aria-label={copy[locale].viewMode}>
              <button className={mode === 'travel' ? 'is-active' : ''} onClick={() => setMode('travel')} type="button">
                <CloudSun size={17} />
                {copy[locale].travelMode}
              </button>
              <button className={mode === 'daily' ? 'is-active' : ''} onClick={() => setMode('daily')} type="button">
                <CalendarDays size={17} />
                {copy[locale].dailyMode}
              </button>
            </div>

            <div className="filter-grid">
              <label className="field">
                <span>
                  <SlidersHorizontal size={15} />
                  {copy[locale].region}
                </span>
                <select value={travelFilter.region} onChange={(event) => setRegion(event.target.value as RegionKey)}>
                  {Array.from(new Set(regionOptions.map((option) => getRegionGroup(option, locale)))).map((group) => (
                    <optgroup key={group} label={group}>
                      {regionOptions
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

              {mode === 'travel' ? (
                <>
                  <label className="field">
                    <span>
                      <CalendarDays size={15} />
                      {copy[locale].time}
                    </span>
                    <select
                      value={travelFilter.dateWindowDays}
                      onChange={(event) =>
                        setTravelFilter((current) => ({ ...current, dateWindowDays: Number(event.target.value) }))
                      }
                    >
                      <option value={7}>{copy[locale].nextDays(7)}</option>
                      <option value={10}>{copy[locale].nextDays(10)}</option>
                      <option value={14}>{copy[locale].nextDays(14)}</option>
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <div className="field date-slider-field">
                    <span>
                      <CalendarDays size={15} />
                      {copy[locale].date} {selectedDate ? formatDateLabel(selectedDate, locale) : ''}
                    </span>
                    <Slider.Root
                      className="date-slider"
                      value={[selectedDateIndex]}
                      min={0}
                      max={Math.max(availableDates.length - 1, 0)}
                      step={1}
                      disabled={availableDates.length <= 1}
                      onValueChange={([dateIndex]) => setSelectedDate(availableDates[dateIndex] ?? selectedDate)}
                    >
                      <Slider.Track className="date-slider-track">
                        <Slider.Range className="date-slider-range" />
                      </Slider.Track>
                      <Slider.Thumb className="date-slider-thumb" aria-label={copy[locale].date} />
                    </Slider.Root>
                  </div>
                  <div className="field layer-field">
                    <span>
                      <MapIcon size={15} />
                      {copy[locale].layer}
                    </span>
                    <div className="layer-button-row" aria-label={copy[locale].layer}>
                      {layers.map((item) => (
                        <button
                          key={item.id}
                          className={layer === item.id ? 'is-active' : ''}
                          type="button"
                          onClick={() => setLayer(item.id)}
                        >
                          {item.labels[locale]}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {mode === 'travel' ? (
              <div className="filter-group">
                <span className="filter-group-title">{copy[locale].quickFilters}</span>
                <div className="preset-row" aria-label={copy[locale].quickFilters}>
                  {weatherPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setTravelFilter((current) => applyWeatherPreset(current, preset))}
                    >
                      {getWeatherPresetLabel(preset, locale)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {mode === 'travel' ? (
              <div className="filter-group">
                <label className="filter-check">
                  <input
                    type="checkbox"
                    checked={travelFilter.useTemperature}
                    onChange={(event) =>
                      setTravelFilter((current) => ({ ...current, useTemperature: event.target.checked }))
                    }
                  />
                  <span className="filter-heading-label">
                    <ThermometerSun size={15} />
                    {copy[locale].temperature}
                  </span>
                  <small className="filter-heading-value">
                    {formatTemperature(travelFilter.temperatureMinC)} - {formatTemperature(travelFilter.temperatureMaxC)}
                  </small>
                </label>
                <div className={`range-field ${travelFilter.useTemperature ? '' : 'is-disabled'}`}>
                  <Slider.Root
                    className="temperature-slider"
                    value={[travelFilter.temperatureMinC, travelFilter.temperatureMaxC]}
                    min={temperatureFilterBounds.minC}
                    max={temperatureFilterBounds.maxC}
                    step={1}
                    minStepsBetweenThumbs={1}
                    disabled={!travelFilter.useTemperature}
                    onValueChange={([temperatureMinC, temperatureMaxC]) =>
                      setTravelFilter((current) => ({
                        ...current,
                        temperatureMinC,
                        temperatureMaxC
                      }))
                    }
                  >
                    <Slider.Track className="temperature-slider-track">
                      <Slider.Range className="temperature-slider-range" />
                    </Slider.Track>
                    <Slider.Thumb className="temperature-slider-thumb" aria-label={copy[locale].minTemperature} />
                    <Slider.Thumb className="temperature-slider-thumb" aria-label={copy[locale].maxTemperature} />
                  </Slider.Root>
                </div>
              </div>
            ) : null}

            {mode === 'travel' ? (
              <div className="filter-group">
                <label className="filter-check">
                  <input
                    type="checkbox"
                    checked={travelFilter.useWeather}
                    onChange={(event) => setTravelFilter((current) => ({ ...current, useWeather: event.target.checked }))}
                  />
                  <span className="filter-heading-label">
                    <CloudSun size={15} />
                    {copy[locale].weather}
                  </span>
                  <small className="filter-heading-value">{selectedWeatherSummary}</small>
                </label>
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
              </div>
            ) : null}

            {mode === 'travel' ? (
              <div className="filter-group">
                <label className="filter-check">
                  <input
                    type="checkbox"
                    checked={travelFilter.useHumidity}
                    onChange={(event) =>
                      setTravelFilter((current) => ({ ...current, useHumidity: event.target.checked }))
                    }
                  />
                  <span className="filter-heading-label">
                    <Droplets size={15} />
                    {copy[locale].humidity}
                  </span>
                  <small className="filter-heading-value">
                    {formatHumidity(travelFilter.humidityMinPercent)} - {formatHumidity(travelFilter.humidityMaxPercent)}
                  </small>
                </label>
                <div className={`range-field ${travelFilter.useHumidity ? '' : 'is-disabled'}`}>
                  <Slider.Root
                    className="humidity-slider"
                    value={[travelFilter.humidityMinPercent, travelFilter.humidityMaxPercent]}
                    min={humidityFilterBounds.minPercent}
                    max={humidityFilterBounds.maxPercent}
                    step={1}
                    minStepsBetweenThumbs={1}
                    disabled={!travelFilter.useHumidity}
                    onValueChange={([humidityMinPercent, humidityMaxPercent]) =>
                      setTravelFilter((current) => ({
                        ...current,
                        humidityMinPercent,
                        humidityMaxPercent
                      }))
                    }
                  >
                    <Slider.Track className="humidity-slider-track">
                      <Slider.Range className="humidity-slider-range" />
                    </Slider.Track>
                    <Slider.Thumb className="humidity-slider-thumb" aria-label={copy[locale].minHumidity} />
                    <Slider.Thumb className="humidity-slider-thumb" aria-label={copy[locale].maxHumidity} />
                  </Slider.Root>
                </div>
              </div>
            ) : null}

            {mode === 'travel' ? (
              <div className="filter-group">
                <label className="filter-check">
                  <input
                    type="checkbox"
                    checked={travelFilter.useElevation}
                    onChange={(event) =>
                      setTravelFilter((current) => ({ ...current, useElevation: event.target.checked }))
                    }
                  />
                  <span className="filter-heading-label">
                    <Mountain size={15} />
                    {copy[locale].elevation}
                  </span>
                  <small className="filter-heading-value">
                    {formatElevation(travelFilter.elevationMinMeters, locale)} - {formatElevation(travelFilter.elevationMaxMeters, locale)}
                  </small>
                </label>
                <div className={`range-field ${travelFilter.useElevation ? '' : 'is-disabled'}`}>
                  <Slider.Root
                    className="elevation-slider"
                    value={[travelFilter.elevationMinMeters, travelFilter.elevationMaxMeters]}
                    min={elevationFilterBounds.minMeters}
                    max={elevationFilterBounds.maxMeters}
                    step={100}
                    minStepsBetweenThumbs={1}
                    disabled={!travelFilter.useElevation}
                    onValueChange={([elevationMinMeters, elevationMaxMeters]) =>
                      setTravelFilter((current) => ({
                        ...current,
                        elevationMinMeters,
                        elevationMaxMeters
                      }))
                    }
                  >
                    <Slider.Track className="elevation-slider-track">
                      <Slider.Range className="elevation-slider-range" />
                    </Slider.Track>
                    <Slider.Thumb className="elevation-slider-thumb" aria-label={copy[locale].minElevation} />
                    <Slider.Thumb className="elevation-slider-thumb" aria-label={copy[locale].maxElevation} />
                  </Slider.Root>
                </div>
              </div>
            ) : null}
          </section>
        </aside>

        <aside className="results-panel" aria-label={copy[locale].resultPanel}>
          <div className="summary-grid">
            <div>
              <span>{visibleRegionCount > 0 ? copy[locale].coverageRegions : copy[locale].coverageCities}</span>
              <strong>{visibleRegionCount > 0 ? visibleRegionCount : visibleCount}</strong>
            </div>
            <div>
              <span>{copy[locale].citySamples}</span>
              <strong>{visibleCount}</strong>
            </div>
            <div>
              <span>{mode === 'travel' ? copy[locale].highMatchCities : copy[locale].popularCities}</span>
              <strong>{excellentCount}</strong>
            </div>
          </div>

          <ol className="ranking-list">
            {resultItems.map((item) => {
              const city = item.city;
              const active = effectiveSelectedCityId === city.id;
              const primary =
                mode === 'travel'
                  ? copy[locale].suitableDays((item as CityTravelScore).matchDays, (item as CityTravelScore).totalDays)
                  : formatTemperatureRange(
                      (item as CityDailyWeather).forecast.temperatureMinC,
                      (item as CityDailyWeather).forecast.temperatureMaxC,
                      locale
                    );
              const secondary =
                mode === 'travel'
                  ? `${copy[locale].average} ${formatTemperature((item as CityTravelScore).averageTemperatureC)} · ${copy[
                      locale
                    ].dryDays((item as CityTravelScore).totalDays - (item as CityTravelScore).rainDays)}`
                  : `${formatWeatherType((item as CityDailyWeather).forecast.weatherType, locale)} · ${copy[
                      locale
                    ].humidityValue(formatHumidity((item as CityDailyWeather).forecast.humidityMeanPercent))}`;

              return (
                <li key={city.id}>
                  <button className={active ? 'is-active' : ''} type="button" onClick={() => setSelectedCityId(city.id)}>
                    <span className="city-name-line">{formatCityName(city, locale)}</span>
                    <span className="city-result-meta">
                      <small className="city-region-label">{formatCityRegion(city, locale)}</small>
                      <small className="city-weather-label">{secondary}</small>
                      <b>{primary}</b>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="map-column" aria-label={copy[locale].mapPanel}>
          {selectedCity ? (
            <section className="map-forecast-panel" aria-label={locale === 'zh' ? '选中城市天气' : 'Selected city forecast'}>
              <div className="map-forecast-heading">
                <strong>{formatCityName(selectedCity, locale)}</strong>
                <span>
                  {selectedCity.country}
                  {selectedCity.admin1 ? ` · ${locale === 'zh' ? selectedCity.admin1LocalName ?? selectedCity.admin1 : selectedCity.admin1}` : ''} · {formatElevation(selectedCity.elevationMeters, locale)}
                </span>
              </div>
              <div className="forecast-strip">
                {selectedForecasts.slice(0, 14).map((forecast) => (
                  <div key={`${forecast.cityId}-${forecast.date}`} className="forecast-day">
                    <span>{formatDateLabel(forecast.date, locale)}</span>
                    <div
                      className="forecast-main"
                      title={`${formatWeatherType(forecast.weatherType, locale)} · ${copy[locale].humidityValue(formatHumidity(
                        forecast.humidityMeanPercent
                      ))} · ${copy[locale].precipitation(forecast.precipitationSumMm)}`}
                    >
                      <span className="forecast-icon" aria-hidden="true">
                        {weatherTypeIcons[forecast.weatherType]}
                      </span>
                      <strong>{formatTemperatureRange(forecast.temperatureMinC, forecast.temperatureMaxC, locale)}</strong>
                    </div>
                    <small>{copy[locale].humidityValue(formatHumidity(forecast.humidityMeanPercent))}</small>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <WorldWeatherMap
            mode={mode}
            locale={locale}
            layer={layer}
            travelScores={travelScores}
            dailyWeather={dailyWeather}
            regionSummaries={regionSummaries}
            showChinaProvinceLayer={shouldShowChinaProvinceLayer(travelFilter.region)}
            focusChinaProvinceLayer={shouldFocusChinaProvinceLayer(travelFilter.region)}
            selectedCityId={effectiveSelectedCityId}
            onSelectCity={setSelectedCityId}
          />
        </section>
      </section>
    </main>
  );
}
