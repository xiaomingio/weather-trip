/**
 * 文件说明: 根据国家旅游画像和目的地种子计算当前需要刷新天气的重点城市集合。
 * 对应文档: docs/data-flow.md
 */

import type { PoolClient } from 'pg';
import type { CountryTourismProfile, TourismDestinationSeed } from './types.js';
import { chunk } from './utils.js';

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
    'create temporary table current_country_profiles (country_code text primary key, tier text not null, population_fallback integer not null, detailed_coverage text) on commit drop'
  );
  const uniqueProfiles = dedupeProfiles(profiles);
  for (const profileBatch of chunk(uniqueProfiles, 500)) {
    const valuesSql = profileBatch
      .map((_, index) => {
        const base = index * 4;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
      })
      .join(',');
    await client.query(
      `
        insert into current_country_profiles (country_code, tier, population_fallback, detailed_coverage)
        values ${valuesSql}
        on conflict (country_code) do update set
          tier = excluded.tier,
          population_fallback = excluded.population_fallback,
          detailed_coverage = excluded.detailed_coverage
      `,
      profileBatch.flatMap((profile) => [
        profile.countryCode,
        profile.tier,
        profile.populationFallback,
        profile.detailedCoverage ?? null
      ])
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

export async function syncFocusedCitiesWithClient(
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
          and geo_names_cities.feature_code in ('PPLC', 'PPLA', 'PPLA2', 'PPLA3', 'PPL')
      ) ranked
      where fallback_rank <= population_fallback
    ),
    china_admin2_representatives as (
      select id
      from (
        select
          geo_names_cities.id,
          row_number() over (
            partition by geo_names_admin2.code
            order by
              current_tourism_seeds.priority nulls last,
              case
                when split_part(regexp_replace(lower(geo_names_admin2.ascii_name), '[^a-z0-9]+', ' ', 'g'), ' ', 1) =
                  split_part(regexp_replace(lower(geo_names_cities.ascii_name), '[^a-z0-9]+', ' ', 'g'), ' ', 1)
                then 0
                else 1
              end,
              case geo_names_cities.feature_code
                when 'PPLC' then 1
                when 'PPLA2' then 1
                when 'PPLA' then 2
                when 'PPLA4' then 3
                when 'PPLA3' then 4
                when 'PPL' then 5
                else 9
              end,
              geo_names_cities.population desc nulls last,
              geo_names_cities.id
          ) as fallback_rank
        from geo_names_admin2
        inner join geo_names_cities
          on geo_names_cities.country_code = geo_names_admin2.country_code
          and geo_names_cities.admin1_code = geo_names_admin2.admin1_code
          and geo_names_cities.admin2_code = geo_names_admin2.admin2_code
        left join current_tourism_seeds
          on current_tourism_seeds.country_code = geo_names_cities.country_code
          and (
            geo_names_cities.geoname_id = current_tourism_seeds.geoname_id
            or geo_names_cities.geoname_id = current_tourism_seeds.mapped_geoname_id
          )
        where geo_names_admin2.country_code = 'CN'
          and exists (
            select 1
            from current_country_profiles
            where current_country_profiles.country_code = geo_names_admin2.country_code
              and current_country_profiles.detailed_coverage = 'admin2'
          )
          and (
            (
              geo_names_admin2.admin2_code ~ '^[0-9]{4}$'
              and right(geo_names_admin2.admin2_code, 2)::integer between 1 and 70
            )
            or geo_names_admin2.admin1_code in ('22', '23', '28', '33')
          )
          and geo_names_cities.population is not null
          and geo_names_cities.population > 0
          and geo_names_cities.feature_code in ('PPLC', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPL')
      ) ranked
      where fallback_rank = 1
    ),
    country_admin1_representatives as (
      select id
      from (
        select
          geo_names_cities.id,
          row_number() over (
            partition by geo_names_admin1.code
            order by
              current_tourism_seeds.priority nulls last,
              case
                when split_part(regexp_replace(lower(geo_names_admin1.ascii_name), '[^a-z0-9]+', ' ', 'g'), ' ', 1) =
                  split_part(regexp_replace(lower(geo_names_cities.ascii_name), '[^a-z0-9]+', ' ', 'g'), ' ', 1)
                then 0
                else 1
              end,
              case geo_names_cities.feature_code
                when 'PPLC' then 1
                when 'PPLA' then 2
                when 'PPLA2' then 3
                when 'PPLA3' then 4
                when 'PPLA4' then 5
                when 'PPL' then 6
                else 9
              end,
              geo_names_cities.population desc nulls last,
              geo_names_cities.id
          ) as fallback_rank
        from current_country_profiles
        inner join geo_names_admin1
          on geo_names_admin1.country_code = current_country_profiles.country_code
        inner join geo_names_cities
          on geo_names_cities.country_code = geo_names_admin1.country_code
          and geo_names_cities.admin1_code = geo_names_admin1.admin1_code
        left join current_tourism_seeds
          on current_tourism_seeds.country_code = geo_names_cities.country_code
          and (
            geo_names_cities.geoname_id = current_tourism_seeds.geoname_id
            or geo_names_cities.geoname_id = current_tourism_seeds.mapped_geoname_id
          )
        where current_country_profiles.detailed_coverage = 'admin1'
          and geo_names_cities.population is not null
          and geo_names_cities.population > 0
          and geo_names_cities.feature_code in ('PPLC', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPL')
      ) ranked
      where fallback_rank = 1
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
      select id, 'fallback:china-admin2-representative' as reason, 70 as priority
      from china_admin2_representatives

      union all
      select id, 'fallback:country-admin1-representative' as reason, 72 as priority
      from country_admin1_representatives
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
