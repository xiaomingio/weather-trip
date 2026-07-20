/**
 * 文件说明: 提供 Web 只读查询、Worker 写入和现有 JSON 数据导入 Postgres 的统一数据访问层。
 * 对应文档: docs/data-flow.md
 */
import { Pool, type PoolClient } from 'pg';
import type { City, DailyForecast } from 'weather-core/types';
import { ensureWeatherSchema } from './schema.js';

export type WeatherDatabase = {
  pool: Pool;
  close: () => Promise<void>;
};

export type WeatherSnapshot = {
  cities: City[];
  forecasts: DailyForecast[];
  availableDates: string[];
};

export type GeoNamesCity = {
  geonameId: number;
  name: string;
  asciiName: string;
  alternateNames: string[];
  latitude: number;
  longitude: number;
  featureClass: string;
  featureCode: string;
  countryCode: string;
  cc2?: string;
  admin1Code?: string;
  admin2Code?: string;
  admin3Code?: string;
  admin4Code?: string;
  population?: number;
  elevation?: number;
  dem?: number;
  timezone: string;
  modificationDate?: string;
  continentCode?: string;
};

export type GeoNamesAdmin1 = {
  code: string;
  countryCode: string;
  admin1Code: string;
  name: string;
  asciiName: string;
  geonameId: number;
};

export type GeoNamesAdmin2 = {
  code: string;
  countryCode: string;
  admin1Code: string;
  admin2Code: string;
  name: string;
  asciiName: string;
  geonameId: number;
};

export type GeoNamesAlternateName = {
  alternateNameId: number;
  geonameId: number;
  isoLanguage: string;
  alternateName: string;
  isPreferredName: boolean;
  isShortName: boolean;
  isColloquial: boolean;
  isHistoric: boolean;
  fromPeriod?: string;
  toPeriod?: string;
};

export type CountryTourismProfile = {
  countryCode: string;
  tier: 'global_hotspot' | 'major' | 'regional' | 'small_high_density' | 'baseline';
  populationFallback: number;
};

export type TourismDestinationSeed = {
  id: string;
  name: string;
  countryCode: string;
  geonameId?: number;
  source: 'curated' | 'wikivoyage' | 'unesco' | 'un-tourism-village' | 'reference-list';
  weatherMode: 'standalone' | 'map_to_nearest_city' | 'boost_existing_city';
  mappedGeonameId?: number;
  priority: number;
  notes?: string;
};

export function createWeatherDatabase(connectionString = process.env.DATABASE_URL): WeatherDatabase {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  const pool = new Pool({ connectionString });
  return {
    pool,
    close: () => pool.end()
  };
}

const regionByContinentCode: Record<string, City['region']> = {
  AF: 'africa',
  AS: 'asia',
  EU: 'europe',
  NA: 'north_america',
  OC: 'oceania',
  SA: 'south_america'
};

const countryDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' });

function mapCity(row: Record<string, unknown>): City {
  const countryCode = String(row.country_code);
  const admin1Code = row.admin1_code ? String(row.admin1_code) : undefined;
  const admin1 = row.admin1_ascii_name ? String(row.admin1_ascii_name) : undefined;
  const admin1LocalName = row.admin1_zh_name ? String(row.admin1_zh_name) : undefined;

  return {
    id: String(row.id),
    names: {
      zh: row.city_zh_name ? String(row.city_zh_name) : String(row.ascii_name || row.name),
      en: String(row.ascii_name || row.name)
    },
    country: countryDisplayNames.of(countryCode) ?? countryCode,
    countryCode,
    admin1,
    admin1Code,
    admin1GroupCode: admin1Code,
    admin1LocalName,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    timezone: String(row.timezone),
    population: row.population === null ? undefined : Number(row.population),
    elevationMeters: Number(row.elevation ?? row.dem ?? 0),
    region: regionByContinentCode[String(row.continent_code)] ?? 'asia'
  };
}

function mapForecast(row: Record<string, unknown>): DailyForecast {
  return {
    cityId: String(row.city_id),
    date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
    weatherCode: Number(row.weather_code),
    weatherType: row.weather_type as DailyForecast['weatherType'],
    temperatureMinC: Number(row.temperature_min_c),
    temperatureMaxC: Number(row.temperature_max_c),
    temperatureMeanC: Number(row.temperature_mean_c),
    humidityMeanPercent: Number(row.humidity_mean_percent),
    precipitationProbabilityMax:
      row.precipitation_probability_max === null ? undefined : Number(row.precipitation_probability_max),
    precipitationSumMm: Number(row.precipitation_sum_mm),
    windSpeedMaxKmh: row.wind_speed_max_kmh === null ? undefined : Number(row.wind_speed_max_kmh)
  };
}

export async function setupWeatherDatabase(db: WeatherDatabase): Promise<void> {
  await ensureWeatherSchema(db.pool);
}

export async function readCities(db: WeatherDatabase): Promise<City[]> {
  const result = await db.pool.query(`
    select
      geo_names_cities.*,
      city_zh.alternate_name as city_zh_name,
      admin1.ascii_name as admin1_ascii_name,
      admin1_zh.alternate_name as admin1_zh_name
    from cities
    inner join geo_names_cities on geo_names_cities.id = cities.id
    left join geo_names_admin1 admin1
      on admin1.code = geo_names_cities.country_code || '.' || geo_names_cities.admin1_code
    left join lateral (
      select alternate_name
      from geo_names_alternate_names
      where geoname_id = geo_names_cities.geoname_id
        and iso_language in ('zh', 'zh-CN', 'zh-Hans', 'zh-Hant')
        and not is_historic
      order by is_preferred_name desc, is_short_name desc, (iso_language = 'zh-CN') desc, length(alternate_name), alternate_name
      limit 1
    ) city_zh on true
    left join lateral (
      select alternate_name
      from geo_names_alternate_names
      where geoname_id = admin1.geoname_id
        and iso_language in ('zh', 'zh-CN', 'zh-Hans', 'zh-Hant')
        and not is_historic
      order by is_preferred_name desc, is_short_name desc, (iso_language = 'zh-CN') desc, length(alternate_name), alternate_name
      limit 1
    ) admin1_zh on true
    order by cities.selection_rank
  `);
  return result.rows.map(mapCity);
}

async function readCitiesWithForecasts(db: WeatherDatabase): Promise<City[]> {
  const result = await db.pool.query(`
    select distinct
      geo_names_cities.*,
      cities.selection_rank,
      city_zh.alternate_name as city_zh_name,
      admin1.ascii_name as admin1_ascii_name,
      admin1_zh.alternate_name as admin1_zh_name
    from cities
    inner join geo_names_cities on geo_names_cities.id = cities.id
    inner join daily_forecasts on daily_forecasts.city_id = geo_names_cities.id
    left join geo_names_admin1 admin1
      on admin1.code = geo_names_cities.country_code || '.' || geo_names_cities.admin1_code
    left join lateral (
      select alternate_name
      from geo_names_alternate_names
      where geoname_id = geo_names_cities.geoname_id
        and iso_language in ('zh', 'zh-CN', 'zh-Hans', 'zh-Hant')
        and not is_historic
      order by is_preferred_name desc, is_short_name desc, (iso_language = 'zh-CN') desc, length(alternate_name), alternate_name
      limit 1
    ) city_zh on true
    left join lateral (
      select alternate_name
      from geo_names_alternate_names
      where geoname_id = admin1.geoname_id
        and iso_language in ('zh', 'zh-CN', 'zh-Hans', 'zh-Hant')
        and not is_historic
      order by is_preferred_name desc, is_short_name desc, (iso_language = 'zh-CN') desc, length(alternate_name), alternate_name
      limit 1
    ) admin1_zh on true
    order by cities.selection_rank
  `);
  return result.rows.map(mapCity);
}

export async function readForecasts(db: WeatherDatabase): Promise<DailyForecast[]> {
  const result = await db.pool.query('select * from daily_forecasts order by city_id, date');
  return result.rows.map(mapForecast);
}

export function getAvailableDates(cities: City[], forecasts: DailyForecast[]): string[] {
  const dateCounts = new Map<string, number>();

  for (const forecast of forecasts) {
    dateCounts.set(forecast.date, (dateCounts.get(forecast.date) ?? 0) + 1);
  }

  return [...dateCounts.entries()]
    .filter(([, forecastCount]) => cities.length > 0 && forecastCount > 0)
    .map(([date]) => date)
    .sort();
}

export async function readWeatherSnapshot(db: WeatherDatabase): Promise<WeatherSnapshot> {
  const [cities, forecasts] = await Promise.all([readCitiesWithForecasts(db), readForecasts(db)]);
  return {
    cities,
    forecasts,
    availableDates: getAvailableDates(cities, forecasts)
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function upsertGeoNamesCitiesWithClient(client: PoolClient, cities: GeoNamesCity[]): Promise<void> {
  for (const cityBatch of chunk(cities, 500)) {
    const valuesSql = cityBatch
      .map((_, index) => {
        const base = index * 21;
        return `(
          $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::text[],
          $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10},
          $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15},
          $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${base + 20},
          $${base + 21}, now()
        )`;
      })
      .join(',');
    const params = cityBatch.flatMap((city) => [
      `geonames-${city.geonameId}`,
      city.geonameId,
      city.name,
      city.asciiName,
      city.alternateNames,
      city.latitude,
      city.longitude,
      city.featureClass,
      city.featureCode,
      city.countryCode ?? null,
      city.cc2 ?? null,
      city.admin1Code ?? null,
      city.admin2Code ?? null,
      city.admin3Code ?? null,
      city.admin4Code ?? null,
      city.population ?? null,
      city.elevation ?? null,
      city.dem ?? null,
      city.timezone,
      city.modificationDate ?? null,
      city.continentCode ?? null
    ]);

    await client.query(
      `
        insert into geo_names_cities (
          id, geoname_id, name, ascii_name, alternate_names,
          latitude, longitude, feature_class, feature_code, country_code,
          cc2, admin1_code, admin2_code, admin3_code, admin4_code,
          population, elevation, dem, timezone, modification_date,
          continent_code, updated_at
        )
        values ${valuesSql}
        on conflict (id) do update set
          geoname_id = excluded.geoname_id,
          name = excluded.name,
          ascii_name = excluded.ascii_name,
          alternate_names = excluded.alternate_names,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          feature_class = excluded.feature_class,
          feature_code = excluded.feature_code,
          country_code = excluded.country_code,
          cc2 = excluded.cc2,
          admin1_code = excluded.admin1_code,
          admin2_code = excluded.admin2_code,
          admin3_code = excluded.admin3_code,
          admin4_code = excluded.admin4_code,
          population = excluded.population,
          elevation = excluded.elevation,
          dem = excluded.dem,
          timezone = excluded.timezone,
          modification_date = excluded.modification_date,
          continent_code = excluded.continent_code,
          updated_at = now()
      `,
      params
    );
  }
}

async function upsertGeoNamesAdmin1WithClient(client: PoolClient, admin1Items: GeoNamesAdmin1[]): Promise<void> {
  for (const adminBatch of chunk(admin1Items, 1000)) {
    const valuesSql = adminBatch
      .map((_, index) => {
        const base = index * 6;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, now())`;
      })
      .join(',');
    const params = adminBatch.flatMap((admin) => [
      admin.code,
      admin.countryCode,
      admin.admin1Code,
      admin.name,
      admin.asciiName,
      admin.geonameId
    ]);

    await client.query(
      `
        insert into geo_names_admin1 (code, country_code, admin1_code, name, ascii_name, geoname_id, updated_at)
        values ${valuesSql}
        on conflict (code) do update set
          country_code = excluded.country_code,
          admin1_code = excluded.admin1_code,
          name = excluded.name,
          ascii_name = excluded.ascii_name,
          geoname_id = excluded.geoname_id,
          updated_at = now()
      `,
      params
    );
  }
}

async function upsertGeoNamesAdmin2WithClient(client: PoolClient, admin2Items: GeoNamesAdmin2[]): Promise<void> {
  for (const adminBatch of chunk(admin2Items, 1000)) {
    const valuesSql = adminBatch
      .map((_, index) => {
        const base = index * 7;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, now())`;
      })
      .join(',');
    const params = adminBatch.flatMap((admin) => [
      admin.code,
      admin.countryCode,
      admin.admin1Code,
      admin.admin2Code,
      admin.name,
      admin.asciiName,
      admin.geonameId
    ]);

    await client.query(
      `
        insert into geo_names_admin2 (code, country_code, admin1_code, admin2_code, name, ascii_name, geoname_id, updated_at)
        values ${valuesSql}
        on conflict (code) do update set
          country_code = excluded.country_code,
          admin1_code = excluded.admin1_code,
          admin2_code = excluded.admin2_code,
          name = excluded.name,
          ascii_name = excluded.ascii_name,
          geoname_id = excluded.geoname_id,
          updated_at = now()
      `,
      params
    );
  }
}

async function syncGeoNamesAlternateNamesWithClient(
  client: PoolClient,
  alternateNames: GeoNamesAlternateName[],
  scopedGeonameIds: number[]
): Promise<void> {
  for (const geonameIdBatch of chunk(scopedGeonameIds, 5000)) {
    await client.query('delete from geo_names_alternate_names where geoname_id = any($1::int[])', [geonameIdBatch]);
  }

  for (const nameBatch of chunk(alternateNames, 1000)) {
    const valuesSql = nameBatch
      .map((_, index) => {
        const base = index * 10;
        return `(
          $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5},
          $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, now()
        )`;
      })
      .join(',');
    const params = nameBatch.flatMap((name) => [
      name.alternateNameId,
      name.geonameId,
      name.isoLanguage,
      name.alternateName,
      name.isPreferredName,
      name.isShortName,
      name.isColloquial,
      name.isHistoric,
      name.fromPeriod ?? null,
      name.toPeriod ?? null
    ]);

    await client.query(
      `
        insert into geo_names_alternate_names (
          alternate_name_id, geoname_id, iso_language, alternate_name,
          is_preferred_name, is_short_name, is_colloquial, is_historic,
          from_period, to_period, updated_at
        )
        values ${valuesSql}
        on conflict (alternate_name_id) do update set
          geoname_id = excluded.geoname_id,
          iso_language = excluded.iso_language,
          alternate_name = excluded.alternate_name,
          is_preferred_name = excluded.is_preferred_name,
          is_short_name = excluded.is_short_name,
          is_colloquial = excluded.is_colloquial,
          is_historic = excluded.is_historic,
          from_period = excluded.from_period,
          to_period = excluded.to_period,
          updated_at = now()
      `,
      params
    );
  }
}

async function insertCurrentGeonamesCityIds(client: PoolClient, cityIds: string[]): Promise<void> {
  await client.query('create temporary table current_geonames_city_ids (id text primary key) on commit drop');

  for (const idBatch of chunk(cityIds, 5000)) {
    const valuesSql = idBatch.map((_, index) => `($${index + 1})`).join(',');
    await client.query(
      `
        insert into current_geonames_city_ids (id)
        values ${valuesSql}
        on conflict (id) do nothing
      `,
      idBatch
    );
  }
}

function normalizeCityName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function dedupeProfiles(profiles: CountryTourismProfile[]): CountryTourismProfile[] {
  return [...new Map(profiles.map((profile) => [profile.countryCode, profile])).values()];
}

function dedupeTourismSeeds(seeds: TourismDestinationSeed[]): TourismDestinationSeed[] {
  return [
    ...new Map(
      seeds
        .filter((seed) => seed.weatherMode === 'standalone' || seed.weatherMode === 'boost_existing_city' || seed.mappedGeonameId)
        .map((seed) => [
          seed.id,
          {
            ...seed,
            name: normalizeCityName(seed.name)
          }
        ])
    ).values()
  ];
}

async function insertCurrentCountryProfiles(
  client: PoolClient,
  profiles: CountryTourismProfile[]
): Promise<void> {
  await client.query(
    'create temporary table current_country_profiles (country_code text primary key, tier text not null, population_fallback integer not null) on commit drop'
  );
  const uniqueProfiles = dedupeProfiles(profiles);
  for (const profileBatch of chunk(uniqueProfiles, 500)) {
    const valuesSql = profileBatch
      .map((_, index) => {
        const base = index * 3;
        return `($${base + 1}, $${base + 2}, $${base + 3})`;
      })
      .join(',');
    await client.query(
      `
        insert into current_country_profiles (country_code, tier, population_fallback)
        values ${valuesSql}
        on conflict (country_code) do update set
          tier = excluded.tier,
          population_fallback = excluded.population_fallback
      `,
      profileBatch.flatMap((profile) => [profile.countryCode, profile.tier, profile.populationFallback])
    );
  }
}

async function insertCurrentTourismSeeds(
  client: PoolClient,
  seeds: TourismDestinationSeed[]
): Promise<void> {
  await client.query(
    'create temporary table current_tourism_seeds (seed_id text primary key, city_name text not null, country_code text not null, geoname_id integer, mapped_geoname_id integer, source text not null, priority integer not null) on commit drop'
  );
  const uniqueSeeds = dedupeTourismSeeds(seeds);
  for (const seedBatch of chunk(uniqueSeeds, 500)) {
    const valuesSql = seedBatch
      .map((_, index) => {
        const base = index * 7;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
      })
      .join(',');
    await client.query(
      `
        insert into current_tourism_seeds (
          seed_id, city_name, country_code, geoname_id, mapped_geoname_id, source, priority
        )
        values ${valuesSql}
        on conflict (seed_id) do update set
          city_name = excluded.city_name,
          country_code = excluded.country_code,
          geoname_id = excluded.geoname_id,
          mapped_geoname_id = excluded.mapped_geoname_id,
          source = excluded.source,
          priority = excluded.priority
      `,
      seedBatch.flatMap((seed) => [
        seed.id,
        seed.name,
        seed.countryCode,
        seed.geonameId ?? null,
        seed.mappedGeonameId ?? null,
        seed.source,
        seed.priority
      ])
    );
  }
}

async function syncFocusedCitiesWithClient(
  client: PoolClient,
  countryProfiles: CountryTourismProfile[],
  tourismSeeds: TourismDestinationSeed[]
): Promise<void> {
  await insertCurrentCountryProfiles(client, countryProfiles);
  await insertCurrentTourismSeeds(client, tourismSeeds);
  await client.query(
    'create temporary table current_city_selection (id text primary key, selection_rank integer not null, selection_reasons text[] not null) on commit drop'
  );
  await client.query(`
    insert into current_city_selection (id, selection_rank, selection_reasons)
    with ranked_country_population as (
      select id, country_code, population_fallback
      from (
        select
          geo_names_cities.id,
          geo_names_cities.country_code,
          coalesce(current_country_profiles.population_fallback, 1) as population_fallback,
          row_number() over (
            partition by geo_names_cities.country_code
            order by geo_names_cities.population desc nulls last, geo_names_cities.feature_code, geo_names_cities.id
          ) as fallback_rank
        from geo_names_cities
        left join current_country_profiles on current_country_profiles.country_code = geo_names_cities.country_code
        where geo_names_cities.population is not null
          and geo_names_cities.population > 0
      ) ranked
      where fallback_rank <= population_fallback
    ),
    china_admin1_fallback as (
      select id
      from (
        select
          id,
          country_code,
          row_number() over (
            partition by country_code, admin1_code
            order by population desc nulls last, feature_code, id
          ) as fallback_rank
        from geo_names_cities
        where country_code = 'CN'
          and admin1_code is not null
          and population is not null
          and population > 0
      ) ranked
      where fallback_rank <= 3
    ),
    tourism_seed_matches as (
      select distinct on (current_tourism_seeds.seed_id)
        geo_names_cities.id,
        'tourism:' || current_tourism_seeds.source as reason,
        current_tourism_seeds.priority as priority
      from current_tourism_seeds
      inner join geo_names_cities
        on geo_names_cities.country_code = current_tourism_seeds.country_code
        and (
          geo_names_cities.geoname_id = current_tourism_seeds.geoname_id
          or geo_names_cities.geoname_id = current_tourism_seeds.mapped_geoname_id
          or (
            current_tourism_seeds.geoname_id is null
            and current_tourism_seeds.mapped_geoname_id is null
            and regexp_replace(lower(geo_names_cities.ascii_name), '[^a-z0-9]+', ' ', 'g') = current_tourism_seeds.city_name
          )
          or (
            current_tourism_seeds.geoname_id is null
            and current_tourism_seeds.mapped_geoname_id is null
            and exists (
              select 1
              from unnest(geo_names_cities.alternate_names) alternate_name
              where regexp_replace(lower(alternate_name), '[^a-z0-9]+', ' ', 'g') = current_tourism_seeds.city_name
            )
          )
        )
      order by current_tourism_seeds.seed_id, geo_names_cities.population desc nulls last, geo_names_cities.feature_code, geo_names_cities.id
    ),
    candidate_reasons as (
      select id, reason, priority
      from tourism_seed_matches

      union all
      select id, 'feature:PPLC' as reason, 10 as priority
      from geo_names_cities
      where feature_code = 'PPLC'

      union all
      select id, 'population:country-profile' as reason, 80 as priority
      from ranked_country_population

      union all
      select id, 'fallback:china-admin1-top' as reason, 70 as priority
      from china_admin1_fallback
    ),
    deduped_reasons as (
      select distinct id, reason, priority
      from candidate_reasons
    ),
    selected as (
      select
        geo_names_cities.id,
        min(deduped_reasons.priority) as selection_priority,
        array_agg(deduped_reasons.reason order by deduped_reasons.priority, deduped_reasons.reason) as selection_reasons
      from geo_names_cities
      inner join deduped_reasons on deduped_reasons.id = geo_names_cities.id
      group by geo_names_cities.id
    ),
    ranked as (
      select
        selected.id,
        row_number() over (
          order by selected.selection_priority, geo_names_cities.population desc nulls last, geo_names_cities.country_code, geo_names_cities.id
        ) as selection_rank,
        selected.selection_reasons
      from selected
      inner join geo_names_cities on geo_names_cities.id = selected.id
    )
    select id, selection_rank, selection_reasons
    from ranked
  `);

  await client.query(`
    insert into cities (id, selection_rank, selection_reasons, updated_at)
    select id, selection_rank, selection_reasons, now()
    from current_city_selection
    on conflict (id) do update set
      selection_rank = excluded.selection_rank,
      selection_reasons = excluded.selection_reasons,
      updated_at = now()
  `);

  await client.query(`
    delete from cities
    where not exists (
      select 1
      from current_city_selection
      where current_city_selection.id = cities.id
    )
  `);
}

export async function syncGeonamesCities(
  db: WeatherDatabase,
  cities: GeoNamesCity[],
  admin1Items: GeoNamesAdmin1[] = [],
  admin2Items: GeoNamesAdmin2[] = [],
  alternateNames: GeoNamesAlternateName[] = [],
  countryProfiles: CountryTourismProfile[] = [],
  tourismSeeds: TourismDestinationSeed[] = []
): Promise<void> {
  const client = await db.pool.connect();
  try {
    await client.query('begin');
    await insertCurrentGeonamesCityIds(client, cities.map((city) => `geonames-${city.geonameId}`));
    await upsertGeoNamesCitiesWithClient(client, cities);
    await client.query('delete from geo_names_admin1');
    await client.query('delete from geo_names_admin2');
    await upsertGeoNamesAdmin1WithClient(client, admin1Items);
    await upsertGeoNamesAdmin2WithClient(client, admin2Items);
    await syncGeoNamesAlternateNamesWithClient(
      client,
      alternateNames,
      [...cities.map((city) => city.geonameId), ...admin1Items.map((admin) => admin.geonameId), ...admin2Items.map((admin) => admin.geonameId)]
    );
    await client.query(`
      delete from geo_names_cities
      where id like 'geonames-%'
        and not exists (
          select 1
          from current_geonames_city_ids
          where current_geonames_city_ids.id = geo_names_cities.id
        )
    `);
    await syncFocusedCitiesWithClient(client, countryProfiles, tourismSeeds);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function upsertForecasts(db: WeatherDatabase, forecasts: DailyForecast[]): Promise<void> {
  const client = await db.pool.connect();
  try {
    await client.query('begin');
    for (const forecast of forecasts) {
      await client.query(
        `
          insert into daily_forecasts (
            city_id, date, weather_code, weather_type, temperature_min_c, temperature_max_c,
            temperature_mean_c, humidity_mean_percent, precipitation_probability_max,
            precipitation_sum_mm, wind_speed_max_kmh, fetched_at
          )
          values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
          on conflict (city_id, date) do update set
            weather_code = excluded.weather_code,
            weather_type = excluded.weather_type,
            temperature_min_c = excluded.temperature_min_c,
            temperature_max_c = excluded.temperature_max_c,
            temperature_mean_c = excluded.temperature_mean_c,
            humidity_mean_percent = excluded.humidity_mean_percent,
            precipitation_probability_max = excluded.precipitation_probability_max,
            precipitation_sum_mm = excluded.precipitation_sum_mm,
            wind_speed_max_kmh = excluded.wind_speed_max_kmh,
            fetched_at = now()
        `,
        [
          forecast.cityId,
          forecast.date,
          forecast.weatherCode,
          forecast.weatherType,
          forecast.temperatureMinC,
          forecast.temperatureMaxC,
          forecast.temperatureMeanC,
          forecast.humidityMeanPercent,
          forecast.precipitationProbabilityMax ?? null,
          forecast.precipitationSumMm,
          forecast.windSpeedMaxKmh ?? null
        ]
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateRefreshSuccess(db: WeatherDatabase, key: string): Promise<void> {
  await db.pool.query(
    `
      insert into refresh_status (key, last_success_at, last_complete_at, last_error_type, last_error_message, updated_at)
      values ($1, now(), now(), null, null, now())
      on conflict (key) do update set
        last_success_at = now(),
        last_complete_at = now(),
        last_error_type = null,
        last_error_message = null,
        updated_at = now()
    `,
    [key]
  );
}

export async function updateRefreshFailure(db: WeatherDatabase, key: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.pool.query(
    `
      insert into refresh_status (key, last_complete_at, last_error_type, last_error_message, updated_at)
      values ($1, now(), $2, $3, now())
      on conflict (key) do update set
        last_complete_at = now(),
        last_error_type = excluded.last_error_type,
        last_error_message = excluded.last_error_message,
        updated_at = now()
    `,
    [key, error instanceof Error ? error.name : 'Error', message.slice(0, 500)]
  );
}
