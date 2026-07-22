/**
 * 文件说明: 同步 GeoNames 城市、行政区、别名和旅游目的地选择数据到 Postgres。
 * 对应文档: docs/data-flow.md
 */

import type { PoolClient } from 'pg';
import type {
  CountryTourismProfile,
  GeoNamesAdmin1,
  GeoNamesAdmin2,
  GeoNamesAlternateName,
  GeoNamesCity,
  TourismDestinationSeed,
  WeatherDatabase
} from './types.js';
import { syncFocusedCitiesWithClient } from './focused-cities-repository.js';
import { chunk } from './utils.js';

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
