/**
 * 文件说明: 定义免费静态数据方案的 Wire JSON 契约，并把紧凑传输格式解码为应用模型。
 * 对应文档: docs/plans/free-static-data-plan.md
 */
import { weatherCodeToType } from './weather-code.js';
import type { City, CountryTier, DailyForecast, WeatherDataSnapshot } from './types.js';

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

export type CityWeatherRowWire = [
  cityId: string,
  sourceElevationM: number | null,
  days: Array<DayWeatherRowWire | null>
];

export type WeatherForecast14dWire = {
  v: string;
  cv: string;
  w: CityWeatherRowWire[];
};

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

export function decodeWeatherForecastPayload(current: WeatherCurrentWire, forecast: WeatherForecast14dWire): DailyForecast[] {
  if (forecast.v !== current.v) {
    throw new Error(`Forecast version ${forecast.v} does not match current version ${current.v}.`);
  }

  return forecast.w.flatMap(([cityId, , days]) =>
    days.flatMap((day, dateIndex): DailyForecast[] => {
      if (!day) return [];
      const date = current.ds[dateIndex];
      if (!date) return [];

      return [
        {
          cityId,
          date,
          weatherCode: day[0],
          weatherType: weatherCodeToType(day[0]),
          temperatureMinC: day[1],
          temperatureMaxC: day[2],
          temperatureMeanC: day[3],
          humidityMeanPercent: day[4],
          precipitationSumMm: day[5],
          windSpeedMaxKmh: day[6] ?? undefined
        }
      ];
    })
  );
}

export function decodeWeatherDataSnapshot(
  citiesPayload: CitiesPayloadWire,
  current: WeatherCurrentWire,
  forecast: WeatherForecast14dWire
): WeatherDataSnapshot {
  const sourceElevationByCityId = new Map(forecast.w.map(([cityId, sourceElevationM]) => [cityId, sourceElevationM]));
  const cities = decodeCitiesPayload(citiesPayload).map((city) => {
    const sourceElevationM = sourceElevationByCityId.get(city.id);
    return typeof sourceElevationM === 'number' ? { ...city, elevationMeters: sourceElevationM } : city;
  });

  return {
    version: current.v,
    generatedAt: current.g,
    cityListVersion: current.cv,
    defaultDate: current.dd,
    availableDates: current.ds,
    cities,
    forecasts: decodeWeatherForecastPayload(current, forecast)
  };
}
