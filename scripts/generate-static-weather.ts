/**
 * 文件说明: 从 Open-Meteo 生成静态公开数据版 14 天天气二进制包和 current 入口。
 * 对应文档: docs/specs/31-data-flow.md, docs/specs/32-public-data-contract.md, docs/specs/43-weather-matrix-performance.md
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CitiesPayloadWire,
  DayWeatherRowWire,
  WeatherCurrentWire,
  WeatherForecastBinInputRow
} from 'weather-core/static-data';
import { encodeWeatherForecastBin } from 'weather-core/static-data';

const rootDir = process.cwd();
const generatedCitiesPath = path.join(rootDir, 'data', 'generated', 'cities.json');
const defaultOutputDir = path.join(rootDir, 'apps', 'web', 'public', 'data', 'weather');

type CliOptions = {
  source: 'open-meteo';
  outputDir: string;
  forecastName: string;
  versionPrefix: string;
  batchSize: number;
  requestDelayMs: number;
  maxRetries: number;
};

type OpenMeteoCityForecast = {
  cityId: string;
  sourceElevationM: number | null;
  daysByDate: Map<string, DayWeatherRowWire>;
};

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

function readCliOptions(): CliOptions {
  const options: CliOptions = {
    source: 'open-meteo',
    outputDir: defaultOutputDir,
    forecastName: 'local.bin',
    versionPrefix: 'local',
    batchSize: 40,
    requestDelayMs: 2500,
    maxRetries: 4
  };

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--source=')) {
      const value = arg.slice('--source='.length);
      if (value === 'open-meteo') options.source = value;
      else throw new Error(`Unsupported weather source: ${value}`);
    } else if (arg.startsWith('--output-dir=')) {
      options.outputDir = path.resolve(rootDir, arg.slice('--output-dir='.length));
    } else if (arg.startsWith('--forecast-name=')) {
      options.forecastName = arg.slice('--forecast-name='.length);
    } else if (arg.startsWith('--version-prefix=')) {
      options.versionPrefix = arg.slice('--version-prefix='.length);
    } else if (arg.startsWith('--batch-size=')) {
      const value = Number(arg.slice('--batch-size='.length));
      if (Number.isInteger(value) && value > 0) options.batchSize = value;
    } else if (arg.startsWith('--request-delay-ms=')) {
      const value = Number(arg.slice('--request-delay-ms='.length));
      if (Number.isInteger(value) && value >= 0) options.requestDelayMs = value;
    } else if (arg.startsWith('--max-retries=')) {
      const value = Number(arg.slice('--max-retries='.length));
      if (Number.isInteger(value) && value >= 0) options.maxRetries = value;
    }
  }

  return options;
}

function numericOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function retryDelayMs(response: Response, retryIndex: number, baseDelayMs: number): number {
  const retryAfter = response.headers.get('retry-after');
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) return retryAfterSeconds * 1000;
  return baseDelayMs * (retryIndex + 1) * 3;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toNumber(value: unknown, field: string, cityId: string, date: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) throw new Error(`Open-Meteo returned invalid ${field} for ${cityId} on ${date}.`);
  return numberValue;
}

async function fetchOpenMeteoBatch(
  cityRows: CitiesPayloadWire['c'],
  batchIndex: number,
  options: Pick<CliOptions, 'requestDelayMs' | 'maxRetries'>
): Promise<OpenMeteoCityForecast[]> {
  const params = new URLSearchParams({
    latitude: cityRows.map((city) => String(city[5] / 100000)).join(','),
    longitude: cityRows.map((city) => String(city[6] / 100000)).join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'temperature_2m_mean',
      'relative_humidity_2m_mean',
      'precipitation_sum',
      'wind_speed_10m_max'
    ].join(','),
    timezone: 'auto',
    forecast_days: '14'
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  let response: Response | null = null;
  for (let retryIndex = 0; retryIndex <= options.maxRetries; retryIndex += 1) {
    try {
      response = await fetch(url, {
        headers: {
          'user-agent': 'weather-trip-static-refresh/1.0'
        }
      });
    } catch (error) {
      if (retryIndex === options.maxRetries) {
        throw new Error(`Open-Meteo batch ${batchIndex + 1} fetch failed after ${options.maxRetries + 1} attempts: ${errorMessage(error)}`);
      }
      const waitMs = options.requestDelayMs * (retryIndex + 1) * 3;
      console.log(`Open-Meteo batch ${batchIndex + 1} fetch failed; retrying in ${Math.round(waitMs / 1000)}s.`);
      await sleep(waitMs);
      continue;
    }
    if (response.ok) break;
    if (response.status !== 429 || retryIndex === options.maxRetries) {
      throw new Error(`Open-Meteo batch ${batchIndex + 1} failed with ${response.status}.`);
    }
    const waitMs = retryDelayMs(response, retryIndex, options.requestDelayMs);
    console.log(`Open-Meteo batch ${batchIndex + 1} rate limited; retrying in ${Math.round(waitMs / 1000)}s.`);
    await sleep(waitMs);
  }
  if (!response?.ok) throw new Error(`Open-Meteo batch ${batchIndex + 1} failed.`);

  const data = await response.json() as unknown;
  const responses = Array.isArray(data) ? data : [data];
  if (responses.length !== cityRows.length) {
    throw new Error(`Open-Meteo batch ${batchIndex + 1} returned ${responses.length} locations for ${cityRows.length} cities.`);
  }

  const rows: OpenMeteoCityForecast[] = responses.map((item, index) => {
    const cityId = cityRows[index][0];
    const responseItem = item as {
      elevation?: number;
      daily?: Record<string, unknown[]>;
    };
    const daily = responseItem.daily;
    const dates = (daily?.time ?? []).slice(0, 14).map(String);
    const daysByDate = new Map<string, DayWeatherRowWire>();
    for (const [dateIndex, date] of dates.entries()) {
      daysByDate.set(date, [
        Math.round(toNumber(daily?.weather_code?.[dateIndex], 'weather_code', cityId, date)),
        toNumber(daily?.temperature_2m_min?.[dateIndex], 'temperature_2m_min', cityId, date),
        toNumber(daily?.temperature_2m_max?.[dateIndex], 'temperature_2m_max', cityId, date),
        toNumber(daily?.temperature_2m_mean?.[dateIndex], 'temperature_2m_mean', cityId, date),
        Math.round(toNumber(daily?.relative_humidity_2m_mean?.[dateIndex], 'relative_humidity_2m_mean', cityId, date)),
        toNumber(daily?.precipitation_sum?.[dateIndex], 'precipitation_sum', cityId, date),
        numericOrNull(Number(daily?.wind_speed_10m_max?.[dateIndex]))
      ]);
    }

    return {
      cityId,
      sourceElevationM: numericOrNull(responseItem.elevation),
      daysByDate
    };
  });

  return rows;
}

async function buildForecastFromOpenMeteo(
  citiesPayload: CitiesPayloadWire,
  options: Pick<CliOptions, 'batchSize' | 'requestDelayMs' | 'maxRetries'>
): Promise<{ dates: string[]; weatherRows: WeatherForecastBinInputRow[] }> {
  const openMeteoRows: OpenMeteoCityForecast[] = [];
  const cityBatches = chunk(citiesPayload.c, options.batchSize);
  for (const [index, cityBatch] of cityBatches.entries()) {
    if (index > 0 && options.requestDelayMs > 0) await sleep(options.requestDelayMs);
    openMeteoRows.push(...await fetchOpenMeteoBatch(cityBatch, index, options));
    console.log(`Fetched Open-Meteo batch ${index + 1}/${cityBatches.length}.`);
  }

  const dates = [...new Set(openMeteoRows.flatMap((row) => [...row.daysByDate.keys()]))].sort().slice(0, 14);
  if (dates.length === 0) throw new Error('Open-Meteo returned no forecast days.');

  return {
    dates,
    weatherRows: openMeteoRows.map((row) => ({
      cityId: row.cityId,
      sourceElevationM: row.sourceElevationM,
      days: dates.map((date) => row.daysByDate.get(date) ?? null)
    }))
  };
}

function defaultDateByCoverage(dates: string[], weatherRows: WeatherForecastBinInputRow[]): string {
  const [bestDate] = dates
    .map((date, index) => ({
      date,
      count: weatherRows.filter((row) => row.days[index]).length
    }))
    .sort((left, right) => right.count - left.count || left.date.localeCompare(right.date));
  if (!bestDate) throw new Error('Cannot choose default forecast date from an empty date list.');
  return bestDate.date;
}

const options = readCliOptions();
const citiesPayload = await readJson<CitiesPayloadWire>(generatedCitiesPath);
const { dates, weatherRows } = await buildForecastFromOpenMeteo(citiesPayload, options);

const matchedWeatherRows = weatherRows.filter((row) => row.days.some(Boolean)).length;
const defaultDate = defaultDateByCoverage(dates, weatherRows);
const forecastBin = encodeWeatherForecastBin(dates, weatherRows);
const forecastHash = createHash('sha256').update(forecastBin).digest('hex');

const version = `${options.versionPrefix}-${defaultDate}`;
const forecastPath = `weather/forecast-14d/${options.forecastName}`;
const current: WeatherCurrentWire = {
  v: version,
  g: new Date().toISOString(),
  dd: defaultDate,
  ds: dates,
  cv: citiesPayload.v,
  f: forecastPath,
  fb: forecastBin.byteLength,
  fh: forecastHash
};

const forecastDir = path.join(options.outputDir, 'forecast-14d');
await mkdir(forecastDir, { recursive: true });
await writeFile(path.join(options.outputDir, 'current.json'), `${JSON.stringify(current)}\n`);
await writeFile(path.join(forecastDir, options.forecastName), forecastBin);

console.log(`Generated ${weatherRows.length} city weather rows for ${dates.length} dates (${version}); ${matchedWeatherRows} cities have weather.`);
