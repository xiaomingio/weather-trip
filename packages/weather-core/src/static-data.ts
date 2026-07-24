/**
 * 文件说明: 定义免费静态数据方案的公开数据契约，并把城市 JSON 与天气二进制包解码为应用模型。
 * 对应文档: docs/specs/32-public-data-contract.md, docs/specs/41-weather-matrix-performance.md
 */
import { weatherCodeToType } from './weather-code.js';
import type { City, CountryTier, DailyForecast, WeatherDataSnapshot, WeatherForecastMatrix } from './types.js';

export type LocalizedNameWire = [en: string, zh: string];
export type WorldRegionCode = 'asia' | 'europe' | 'north_america' | 'south_america' | 'africa' | 'oceania';
export type CountryTierCode = 1 | 2 | 3;

export type CountryRowWire = [
  code: string,
  name: LocalizedNameWire,
  worldRegion: WorldRegionCode,
  countryTier: CountryTierCode
];
export type Admin1RowWire = [countryIndex: number, code: string, name: LocalizedNameWire];
export type Admin2RowWire = [countryIndex: number, admin1Index: number, code: string, name: LocalizedNameWire];

export type CityRowWire = [
  id: string,
  name: LocalizedNameWire,
  countryIndex: number,
  admin1Index: number | null,
  admin2Index: number | null,
  latE5: number,
  lngE5: number,
  elevationM: number
];

export type CitiesDictWire = {
  co: CountryRowWire[];
  a1: Admin1RowWire[];
  a2: Admin2RowWire[];
};

export type CitiesPayloadWire = {
  v: string;
  d: CitiesDictWire;
  c: CityRowWire[];
};

export type WeatherCurrentWire = {
  v: string;
  g: string;
  dd: string;
  ds: string[];
  cv: string;
  f: string;
  fb: number;
  fh: string;
};

export type DayWeatherRowWire = [
  weatherCode: number,
  temperatureMinC: number,
  temperatureMaxC: number,
  temperatureMeanC: number,
  humidityMeanPercent: number,
  precipitationSumMm: number,
  windSpeedMaxKmh: number | null
];

export type WeatherForecastBinInputRow = {
  cityId: string;
  sourceElevationM: number | null;
  days: Array<DayWeatherRowWire | null>;
};

const forecastBinMagic = 'WTRP';
const forecastBinFormatVersion = 1;
const forecastBinHeaderLength = 64;
const sourceElevationMissing = -32768;
const windSpeedMissingKmh10 = 65535;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type ForecastBinHeader = {
  fileLength: number;
  cityCount: number;
  dateCount: number;
  cityDictionaryOffset: number;
  dateDictionaryOffset: number;
  sourceElevationOffset: number;
  weatherCodeOffset: number;
  temperatureMinOffset: number;
  temperatureMaxOffset: number;
  temperatureMeanOffset: number;
  humidityOffset: number;
  precipitationOffset: number;
  windOffset: number;
  missingOffset: number;
};

function forecastOffset(matrix: Pick<WeatherForecastMatrix, 'cityIds' | 'dates'>, cityIndex: number, dateIndex: number): number {
  return dateIndex * matrix.cityIds.length + cityIndex;
}

function alignTo(value: number, multiple: number): number {
  return Math.ceil(value / multiple) * multiple;
}

function checkedUint8(value: number, field: string): number {
  const rounded = Math.round(value);
  if (!Number.isInteger(rounded) || rounded < 0 || rounded > 255) throw new Error(`${field} must fit Uint8.`);
  return rounded;
}

function checkedInt16(value: number, field: string): number {
  const rounded = Math.round(value);
  if (!Number.isInteger(rounded) || rounded < -32767 || rounded > 32767) throw new Error(`${field} must fit Int16.`);
  return rounded;
}

function checkedUint16(value: number, field: string, max = 65535): number {
  const rounded = Math.round(value);
  if (!Number.isInteger(rounded) || rounded < 0 || rounded > max) throw new Error(`${field} must fit Uint16.`);
  return rounded;
}

function scaled10(value: number, field: string): number {
  if (!Number.isFinite(value)) throw new Error(`${field} must be finite.`);
  return Math.round(value * 10);
}

function stringListByteLength(items: string[]): number {
  return items.reduce((sum, item) => sum + 2 + textEncoder.encode(item).byteLength, 0);
}

function writeStringList(view: DataView, bytes: Uint8Array, offset: number, items: string[]): number {
  let cursor = offset;
  for (const item of items) {
    const encoded = textEncoder.encode(item);
    if (encoded.byteLength > 65535) throw new Error(`String is too long for forecast bin dictionary: ${item}`);
    view.setUint16(cursor, encoded.byteLength, true);
    cursor += 2;
    bytes.set(encoded, cursor);
    cursor += encoded.byteLength;
  }
  return cursor;
}

function readStringList(view: DataView, bytes: Uint8Array, offset: number, endOffset: number, count: number, label: string): string[] {
  const values: string[] = [];
  let cursor = offset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 2 > endOffset) throw new Error(`Forecast bin ${label} dictionary is truncated.`);
    const byteLength = view.getUint16(cursor, true);
    cursor += 2;
    if (cursor + byteLength > endOffset) throw new Error(`Forecast bin ${label} dictionary entry is truncated.`);
    values.push(textDecoder.decode(bytes.subarray(cursor, cursor + byteLength)));
    cursor += byteLength;
  }
  return values;
}

function writeHeader(view: DataView, header: ForecastBinHeader): void {
  for (let index = 0; index < forecastBinMagic.length; index += 1) {
    view.setUint8(index, forecastBinMagic.charCodeAt(index));
  }
  view.setUint16(4, forecastBinFormatVersion, true);
  view.setUint16(6, forecastBinHeaderLength, true);
  view.setUint32(8, header.fileLength, true);
  view.setUint32(12, header.cityCount, true);
  view.setUint32(16, header.dateCount, true);
  view.setUint32(20, header.cityDictionaryOffset, true);
  view.setUint32(24, header.dateDictionaryOffset, true);
  view.setUint32(28, header.sourceElevationOffset, true);
  view.setUint32(32, header.weatherCodeOffset, true);
  view.setUint32(36, header.temperatureMinOffset, true);
  view.setUint32(40, header.temperatureMaxOffset, true);
  view.setUint32(44, header.temperatureMeanOffset, true);
  view.setUint32(48, header.humidityOffset, true);
  view.setUint32(52, header.precipitationOffset, true);
  view.setUint32(56, header.windOffset, true);
  view.setUint32(60, header.missingOffset, true);
}

function readHeader(view: DataView): ForecastBinHeader {
  const magic = Array.from({ length: 4 }, (_, index) => String.fromCharCode(view.getUint8(index))).join('');
  if (magic !== forecastBinMagic) throw new Error('Forecast bin magic does not match WTRP.');
  const formatVersion = view.getUint16(4, true);
  if (formatVersion !== forecastBinFormatVersion) throw new Error(`Unsupported forecast bin version: ${formatVersion}.`);
  const headerLength = view.getUint16(6, true);
  if (headerLength !== forecastBinHeaderLength) throw new Error(`Unsupported forecast bin header length: ${headerLength}.`);

  return {
    fileLength: view.getUint32(8, true),
    cityCount: view.getUint32(12, true),
    dateCount: view.getUint32(16, true),
    cityDictionaryOffset: view.getUint32(20, true),
    dateDictionaryOffset: view.getUint32(24, true),
    sourceElevationOffset: view.getUint32(28, true),
    weatherCodeOffset: view.getUint32(32, true),
    temperatureMinOffset: view.getUint32(36, true),
    temperatureMaxOffset: view.getUint32(40, true),
    temperatureMeanOffset: view.getUint32(44, true),
    humidityOffset: view.getUint32(48, true),
    precipitationOffset: view.getUint32(52, true),
    windOffset: view.getUint32(56, true),
    missingOffset: view.getUint32(60, true)
  };
}

function assertOffsetOrder(header: ForecastBinHeader): void {
  const offsets = [
    header.cityDictionaryOffset,
    header.dateDictionaryOffset,
    header.sourceElevationOffset,
    header.weatherCodeOffset,
    header.temperatureMinOffset,
    header.temperatureMaxOffset,
    header.temperatureMeanOffset,
    header.humidityOffset,
    header.precipitationOffset,
    header.windOffset,
    header.missingOffset,
    header.fileLength
  ];
  for (let index = 1; index < offsets.length; index += 1) {
    if (offsets[index] < offsets[index - 1]) throw new Error('Forecast bin offsets are not monotonic.');
  }
}

function dataBufferFrom(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  return copy.buffer;
}

function buildIndex(values: string[], label: string): Map<string, number> {
  const indexByValue = new Map<string, number>();
  for (const [index, value] of values.entries()) {
    if (indexByValue.has(value)) throw new Error(`Forecast bin ${label} contains duplicate value: ${value}`);
    indexByValue.set(value, index);
  }
  return indexByValue;
}

const countryTierByCode: Record<CountryTierCode, CountryTier> = {
  1: 'C1',
  2: 'C2',
  3: 'C3'
};

function localizedText([en, zh]: LocalizedNameWire): { en: string; zh: string } {
  return { en, zh: zh || en };
}

function regionKeyForAdmin1(countryCode: string, admin1Code: string | undefined): string | undefined {
  return admin1Code ? `admin1:${countryCode}.${admin1Code}` : undefined;
}

function regionKeyForAdmin2(countryCode: string, admin1Code: string | undefined, admin2Code: string | undefined): string | undefined {
  return admin1Code && admin2Code ? `admin2:${countryCode}.${admin1Code}.${admin2Code}` : undefined;
}

export function decodeCitiesPayload(payload: CitiesPayloadWire): City[] {
  return payload.c.map((row, index) => {
    const country = payload.d.co[row[2]];
    if (!country) throw new Error(`cities.c[${index}] references missing country index ${row[2]}.`);

    const admin1 = row[3] === null ? null : payload.d.a1[row[3]];
    const admin2 = row[4] === null ? null : payload.d.a2[row[4]];
    const countryCode = country[0];
    const admin1Code = admin1?.[1];
    const admin2Code = admin2?.[2];
    const countryNames = localizedText(country[1]);
    const admin1Names = admin1 ? localizedText(admin1[2]) : null;
    const admin2Names = admin2 ? localizedText(admin2[3]) : null;

    return {
      id: row[0],
      names: localizedText(row[1]),
      country: countryNames.en,
      countryCode,
      admin1: admin1Names?.en,
      admin1Code,
      admin1GroupCode: admin1Code,
      admin1LocalName: admin1Names?.zh,
      latitude: row[5] / 100000,
      longitude: row[6] / 100000,
      timezone: 'auto',
      elevationMeters: row[7],
      region: country[2],
      countryTier: countryTierByCode[country[3]],
      rank: index + 1,
      selectionReasons: [],
      ...(admin2Names && {
        admin2: admin2Names.en,
        admin2Code,
        admin2LocalName: admin2Names.zh,
        admin2RegionKey: regionKeyForAdmin2(countryCode, admin1Code, admin2Code)
      }),
      admin1RegionKey: regionKeyForAdmin1(countryCode, admin1Code),
      countryRegionKey: `country:${countryCode}`
    } as City;
  });
}

export function encodeWeatherForecastBin(dates: string[], rows: WeatherForecastBinInputRow[]): Uint8Array {
  const cityIds = rows.map((row) => row.cityId);
  buildIndex(cityIds, 'cityIds');
  buildIndex(dates, 'dates');

  const cityCount = cityIds.length;
  const dateCount = dates.length;
  const cellCount = cityCount * dateCount;
  const cityDictionaryOffset = forecastBinHeaderLength;
  const dateDictionaryOffset = cityDictionaryOffset + stringListByteLength(cityIds);
  const sourceElevationOffset = alignTo(dateDictionaryOffset + stringListByteLength(dates), 2);
  const weatherCodeOffset = sourceElevationOffset + cityCount * Int16Array.BYTES_PER_ELEMENT;
  const temperatureMinOffset = alignTo(weatherCodeOffset + cellCount * Uint8Array.BYTES_PER_ELEMENT, 2);
  const temperatureMaxOffset = temperatureMinOffset + cellCount * Int16Array.BYTES_PER_ELEMENT;
  const temperatureMeanOffset = temperatureMaxOffset + cellCount * Int16Array.BYTES_PER_ELEMENT;
  const humidityOffset = temperatureMeanOffset + cellCount * Int16Array.BYTES_PER_ELEMENT;
  const precipitationOffset = alignTo(humidityOffset + cellCount * Uint8Array.BYTES_PER_ELEMENT, 2);
  const windOffset = precipitationOffset + cellCount * Uint16Array.BYTES_PER_ELEMENT;
  const missingOffset = windOffset + cellCount * Uint16Array.BYTES_PER_ELEMENT;
  const fileLength = missingOffset + cellCount * Uint8Array.BYTES_PER_ELEMENT;

  const buffer = new ArrayBuffer(fileLength);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const header: ForecastBinHeader = {
    fileLength,
    cityCount,
    dateCount,
    cityDictionaryOffset,
    dateDictionaryOffset,
    sourceElevationOffset,
    weatherCodeOffset,
    temperatureMinOffset,
    temperatureMaxOffset,
    temperatureMeanOffset,
    humidityOffset,
    precipitationOffset,
    windOffset,
    missingOffset
  };

  writeHeader(view, header);
  writeStringList(view, bytes, cityDictionaryOffset, cityIds);
  writeStringList(view, bytes, dateDictionaryOffset, dates);

  const sourceElevationMeters = new Int16Array(buffer, sourceElevationOffset, cityCount);
  const weatherCode = new Uint8Array(buffer, weatherCodeOffset, cellCount);
  const temperatureMinC10 = new Int16Array(buffer, temperatureMinOffset, cellCount);
  const temperatureMaxC10 = new Int16Array(buffer, temperatureMaxOffset, cellCount);
  const temperatureMeanC10 = new Int16Array(buffer, temperatureMeanOffset, cellCount);
  const humidityMeanPercent = new Uint8Array(buffer, humidityOffset, cellCount);
  const precipitationSumMm10 = new Uint16Array(buffer, precipitationOffset, cellCount);
  const windSpeedMaxKmh10 = new Uint16Array(buffer, windOffset, cellCount);
  const missing = new Uint8Array(buffer, missingOffset, cellCount);

  for (const [cityIndex, row] of rows.entries()) {
    sourceElevationMeters[cityIndex] =
      typeof row.sourceElevationM === 'number' ? checkedInt16(row.sourceElevationM, `${row.cityId}.sourceElevationM`) : sourceElevationMissing;

    for (let dateIndex = 0; dateIndex < dateCount; dateIndex += 1) {
      const offset = dateIndex * cityCount + cityIndex;
      const day = row.days[dateIndex] ?? null;
      if (!day) {
        missing[offset] = 1;
        windSpeedMaxKmh10[offset] = windSpeedMissingKmh10;
        continue;
      }

      weatherCode[offset] = checkedUint8(day[0], `${row.cityId}.${dates[dateIndex]}.weatherCode`);
      temperatureMinC10[offset] = checkedInt16(scaled10(day[1], `${row.cityId}.${dates[dateIndex]}.temperatureMinC`), 'temperatureMinC10');
      temperatureMaxC10[offset] = checkedInt16(scaled10(day[2], `${row.cityId}.${dates[dateIndex]}.temperatureMaxC`), 'temperatureMaxC10');
      temperatureMeanC10[offset] = checkedInt16(scaled10(day[3], `${row.cityId}.${dates[dateIndex]}.temperatureMeanC`), 'temperatureMeanC10');
      humidityMeanPercent[offset] = checkedUint8(day[4], `${row.cityId}.${dates[dateIndex]}.humidityMeanPercent`);
      precipitationSumMm10[offset] = checkedUint16(scaled10(day[5], `${row.cityId}.${dates[dateIndex]}.precipitationSumMm`), 'precipitationSumMm10');
      windSpeedMaxKmh10[offset] =
        typeof day[6] === 'number'
          ? checkedUint16(scaled10(day[6], `${row.cityId}.${dates[dateIndex]}.windSpeedMaxKmh`), 'windSpeedMaxKmh10', windSpeedMissingKmh10 - 1)
          : windSpeedMissingKmh10;
    }
  }

  return bytes;
}

export function decodeWeatherForecastBin(current: WeatherCurrentWire, input: ArrayBuffer | Uint8Array): WeatherForecastMatrix {
  const buffer = dataBufferFrom(input);
  if (buffer.byteLength < forecastBinHeaderLength) throw new Error('Forecast bin is shorter than the header.');

  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const header = readHeader(view);
  if (header.fileLength !== buffer.byteLength) throw new Error(`Forecast bin length ${buffer.byteLength} does not match header ${header.fileLength}.`);
  if (current.fb !== buffer.byteLength) throw new Error(`Forecast bin length ${buffer.byteLength} does not match current.fb ${current.fb}.`);
  assertOffsetOrder(header);

  const cellCount = header.cityCount * header.dateCount;
  const expectedFileLength = header.missingOffset + cellCount * Uint8Array.BYTES_PER_ELEMENT;
  if (expectedFileLength !== header.fileLength) throw new Error('Forecast bin matrix field lengths do not match city/date counts.');
  for (const offset of [
    header.sourceElevationOffset,
    header.temperatureMinOffset,
    header.temperatureMaxOffset,
    header.temperatureMeanOffset,
    header.precipitationOffset,
    header.windOffset
  ]) {
    if (offset % 2 !== 0) throw new Error('Forecast bin Int16/Uint16 field offset is not 2-byte aligned.');
  }

  const cityIds = readStringList(view, bytes, header.cityDictionaryOffset, header.dateDictionaryOffset, header.cityCount, 'cityIds');
  const dates = readStringList(view, bytes, header.dateDictionaryOffset, header.sourceElevationOffset, header.dateCount, 'dates');
  if (current.ds.length !== dates.length || current.ds.some((date, index) => date !== dates[index])) {
    throw new Error('Forecast bin dates do not match current.ds.');
  }

  return {
    cityIds,
    dates,
    indexByCityId: buildIndex(cityIds, 'cityIds'),
    indexByDate: buildIndex(dates, 'dates'),
    sourceElevationMeters: new Int16Array(buffer, header.sourceElevationOffset, header.cityCount),
    fields: {
      weatherCode: new Uint8Array(buffer, header.weatherCodeOffset, cellCount),
      temperatureMinC10: new Int16Array(buffer, header.temperatureMinOffset, cellCount),
      temperatureMaxC10: new Int16Array(buffer, header.temperatureMaxOffset, cellCount),
      temperatureMeanC10: new Int16Array(buffer, header.temperatureMeanOffset, cellCount),
      humidityMeanPercent: new Uint8Array(buffer, header.humidityOffset, cellCount),
      precipitationSumMm10: new Uint16Array(buffer, header.precipitationOffset, cellCount),
      windSpeedMaxKmh10: new Uint16Array(buffer, header.windOffset, cellCount),
      missing: new Uint8Array(buffer, header.missingOffset, cellCount)
    }
  };
}

export function readForecastDay(matrix: WeatherForecastMatrix, cityId: string, date: string): DailyForecast | null {
  const cityIndex = matrix.indexByCityId.get(cityId);
  const dateIndex = matrix.indexByDate.get(date);
  if (cityIndex === undefined || dateIndex === undefined) return null;

  const offset = forecastOffset(matrix, cityIndex, dateIndex);
  if (matrix.fields.missing[offset]) return null;
  const windSpeedMaxKmh10 = matrix.fields.windSpeedMaxKmh10[offset];

  return {
    cityId,
    date,
    weatherCode: matrix.fields.weatherCode[offset],
    weatherType: weatherCodeToType(matrix.fields.weatherCode[offset]),
    temperatureMinC: matrix.fields.temperatureMinC10[offset] / 10,
    temperatureMaxC: matrix.fields.temperatureMaxC10[offset] / 10,
    temperatureMeanC: matrix.fields.temperatureMeanC10[offset] / 10,
    humidityMeanPercent: matrix.fields.humidityMeanPercent[offset],
    precipitationSumMm: matrix.fields.precipitationSumMm10[offset] / 10,
    windSpeedMaxKmh: windSpeedMaxKmh10 === windSpeedMissingKmh10 ? undefined : windSpeedMaxKmh10 / 10
  };
}

export function hasForecastDay(matrix: WeatherForecastMatrix, cityId: string, date: string): boolean {
  const cityIndex = matrix.indexByCityId.get(cityId);
  const dateIndex = matrix.indexByDate.get(date);
  if (cityIndex === undefined || dateIndex === undefined) return false;
  return matrix.fields.missing[forecastOffset(matrix, cityIndex, dateIndex)] === 0;
}

export function readCityForecasts(matrix: WeatherForecastMatrix, cityId: string, limit = matrix.dates.length): DailyForecast[] {
  const forecasts: DailyForecast[] = [];
  for (const date of matrix.dates.slice(0, limit)) {
    const forecast = readForecastDay(matrix, cityId, date);
    if (forecast) forecasts.push(forecast);
  }
  return forecasts;
}

export function readForecastsForDate(matrix: WeatherForecastMatrix, date: string): DailyForecast[] {
  const dateIndex = matrix.indexByDate.get(date);
  if (dateIndex === undefined) return [];

  const forecasts: DailyForecast[] = [];
  for (const cityId of matrix.cityIds) {
    const forecast = readForecastDay(matrix, cityId, date);
    if (forecast) forecasts.push(forecast);
  }
  return forecasts;
}

export function sourceElevationForCity(matrix: WeatherForecastMatrix, cityId: string): number | null {
  const cityIndex = matrix.indexByCityId.get(cityId);
  if (cityIndex === undefined) return null;
  const elevation = matrix.sourceElevationMeters[cityIndex];
  return elevation === sourceElevationMissing ? null : elevation;
}

export function decodeWeatherDataSnapshot(
  citiesPayload: CitiesPayloadWire,
  current: WeatherCurrentWire,
  forecastBin: ArrayBuffer | Uint8Array
): WeatherDataSnapshot {
  const forecastMatrix = decodeWeatherForecastBin(current, forecastBin);
  const cities = decodeCitiesPayload(citiesPayload).map((city) => {
    const sourceElevationM = sourceElevationForCity(forecastMatrix, city.id);
    return typeof sourceElevationM === 'number' ? { ...city, elevationMeters: sourceElevationM } : city;
  });

  return {
    version: current.v,
    generatedAt: current.g,
    cityListVersion: current.cv,
    defaultDate: current.dd,
    availableDates: current.ds,
    cities,
    forecastMatrix
  };
}
