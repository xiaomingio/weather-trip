/**
 * 文件说明: 定义天气数据站当前 Postgres Schema，用于空库初始化和本地开发重建。
 * 对应文档: docs/data-flow.md
 */
import type { Pool, PoolClient } from 'pg';

export async function ensureWeatherSchema(db: Pool | PoolClient): Promise<void> {
  await db.query(`
    create table if not exists geo_names_cities (
      id text primary key,
      geoname_id integer not null unique,
      name text not null,
      ascii_name text not null,
      alternate_names text[] not null default '{}',
      latitude double precision not null,
      longitude double precision not null,
      feature_class text not null,
      feature_code text not null,
      country_code text not null,
      cc2 text,
      admin1_code text,
      admin2_code text,
      admin3_code text,
      admin4_code text,
      population bigint,
      elevation integer,
      dem integer,
      timezone text not null,
      modification_date date,
      continent_code text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists geo_names_admin1 (
      code text primary key,
      country_code text not null,
      admin1_code text not null,
      name text not null,
      ascii_name text not null,
      geoname_id integer not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists geo_names_admin2 (
      code text primary key,
      country_code text not null,
      admin1_code text not null,
      admin2_code text not null,
      name text not null,
      ascii_name text not null,
      geoname_id integer not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists geo_names_alternate_names (
      alternate_name_id integer primary key,
      geoname_id integer not null,
      iso_language text not null,
      alternate_name text not null,
      is_preferred_name boolean not null default false,
      is_short_name boolean not null default false,
      is_colloquial boolean not null default false,
      is_historic boolean not null default false,
      from_period text,
      to_period text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists cities (
      id text primary key references geo_names_cities(id) on update cascade on delete cascade,
      selection_rank integer not null,
      selection_reasons text[] not null default '{}',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists daily_forecasts (
      city_id text not null references cities(id) on update cascade on delete cascade,
      date date not null,
      weather_code integer not null,
      weather_type text not null,
      temperature_min_c numeric not null,
      temperature_max_c numeric not null,
      temperature_mean_c numeric not null,
      humidity_mean_percent numeric not null,
      precipitation_probability_max integer,
      precipitation_sum_mm numeric not null,
      wind_speed_max_kmh numeric,
      fetched_at timestamptz not null default now(),
      primary key (city_id, date)
    );

    create table if not exists refresh_status (
      key text primary key,
      last_success_at timestamptz,
      last_complete_at timestamptz,
      last_error_type text,
      last_error_message text,
      updated_at timestamptz not null default now()
    );

    create index if not exists geo_names_cities_country_code_idx on geo_names_cities(country_code);
    create index if not exists geo_names_cities_feature_code_idx on geo_names_cities(feature_code);
    create index if not exists geo_names_cities_admin1_code_idx on geo_names_cities(country_code, admin1_code);
    create index if not exists geo_names_cities_population_idx on geo_names_cities(population desc nulls last);
    create index if not exists geo_names_admin1_country_admin1_idx on geo_names_admin1(country_code, admin1_code);
    create index if not exists geo_names_admin2_country_admin_idx on geo_names_admin2(country_code, admin1_code, admin2_code);
    create index if not exists geo_names_alternate_names_geoname_language_idx on geo_names_alternate_names(geoname_id, iso_language);
    create index if not exists cities_selection_rank_idx on cities(selection_rank);
    create index if not exists daily_forecasts_date_idx on daily_forecasts(date);
  `);
}
