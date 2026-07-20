/**
 * 文件说明: 从 GeoNames 官方全球 cities1000 导出包同步城市主数据到 Postgres。
 * 参考资料: https://download.geonames.org/export/dump/readme.txt
 * 对应文档: docs/data-flow.md
 */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { loadRootEnv } from './env.mjs';
import {
  createWeatherDatabase,
  setupWeatherDatabase,
  syncGeonamesCities,
  updateRefreshSuccess,
  type CountryTourismProfile,
  type GeoNamesAdmin1,
  type GeoNamesAdmin2,
  type GeoNamesAlternateName,
  type GeoNamesCity,
  type TourismDestinationSeed
} from 'weather-db';

type CountryInfo = {
  code: string;
  continentCode: string;
};

type GeoNamesCityRow = {
  geonameId: string;
  name: string;
  asciiName: string;
  alternateNames: string[];
  latitude: number;
  longitude: number;
  featureClass: string;
  featureCode: string;
  countryCode: string;
  cc2?: string;
  admin1Code: string;
  admin2Code?: string;
  admin3Code?: string;
  admin4Code?: string;
  population: number;
  elevation?: number;
  dem?: number;
  timezone: string;
  modificationDate?: string;
};

const geonamesBaseUrl = 'https://download.geonames.org/export/dump';
const geonamesCitiesPackage = 'cities1000';
const chineseLanguageCodes = new Set(['zh', 'zh-CN', 'zh-Hans', 'zh-Hant']);
const citySelectionDataDir = path.join(process.cwd(), 'data/city-selection');

function parseInteger(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCountryInfo(text: string): Map<string, CountryInfo> {
  const countries = new Map<string, CountryInfo>();

  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;

    const columns = line.split('\t');
    const code = columns[0];
    const continentCode = columns[8];
    if (!code || !continentCode) continue;

    countries.set(code, { code, continentCode });
  }

  return countries;
}

function parseAdmin1Info(text: string): GeoNamesAdmin1[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      if (!line) return [];
      const columns = line.split('\t');
      const [countryCode, admin1Code] = (columns[0] ?? '').split('.');
      const geonameId = Number(columns[3]);
      if (!countryCode || !admin1Code || !columns[1] || !Number.isFinite(geonameId)) return [];

      return [{
        code: columns[0],
        countryCode,
        admin1Code,
        name: columns[1],
        asciiName: columns[2] || columns[1],
        geonameId
      }];
    });
}

function parseAdmin2Info(text: string): GeoNamesAdmin2[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      if (!line) return [];
      const columns = line.split('\t');
      const [countryCode, admin1Code, admin2Code] = (columns[0] ?? '').split('.');
      const geonameId = Number(columns[3]);
      if (!countryCode || !admin1Code || !admin2Code || !columns[1] || !Number.isFinite(geonameId)) return [];

      return [{
        code: columns[0],
        countryCode,
        admin1Code,
        admin2Code,
        name: columns[1],
        asciiName: columns[2] || columns[1],
        geonameId
      }];
    });
}

function parseGeoNamesCityRow(line: string): GeoNamesCityRow | null {
  const columns = line.split('\t');
  if (columns.length < 19) return null;

  return {
    geonameId: columns[0],
    name: columns[1],
    asciiName: columns[2] || columns[1],
    alternateNames: columns[3] ? columns[3].split(',') : [],
    latitude: Number(columns[4]),
    longitude: Number(columns[5]),
    featureClass: columns[6],
    featureCode: columns[7],
    countryCode: columns[8],
    cc2: columns[9] || undefined,
    admin1Code: columns[10],
    admin2Code: columns[11] || undefined,
    admin3Code: columns[12] || undefined,
    admin4Code: columns[13] || undefined,
    population: Number(columns[14]) || 0,
    elevation: parseInteger(columns[15]),
    dem: parseInteger(columns[16]),
    timezone: columns[17],
    modificationDate: columns[18] || undefined
  };
}

function toGeoNamesCity(row: GeoNamesCityRow, countries: Map<string, CountryInfo>): GeoNamesCity | null {
  if (row.featureClass !== 'P' || !row.timezone) return null;
  if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) return null;

  const country = countries.get(row.countryCode);
  if (!country) return null;

  return {
    geonameId: Number(row.geonameId),
    name: row.name,
    asciiName: row.asciiName,
    alternateNames: row.alternateNames,
    latitude: row.latitude,
    longitude: row.longitude,
    featureClass: row.featureClass,
    featureCode: row.featureCode,
    countryCode: country.code,
    cc2: row.cc2,
    admin1Code: row.admin1Code || undefined,
    admin2Code: row.admin2Code,
    admin3Code: row.admin3Code,
    admin4Code: row.admin4Code,
    population: row.population,
    elevation: row.elevation,
    dem: row.dem,
    timezone: row.timezone,
    modificationDate: row.modificationDate,
    continentCode: country.continentCode
  };
}

async function downloadText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const body = response.body as unknown as Parameters<typeof Readable.fromWeb>[0];
  await pipeline(Readable.fromWeb(body), createWriteStream(destination));
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

async function logCitySelectionSummary(db: ReturnType<typeof createWeatherDatabase>): Promise<void> {
  const [total, reasons, countries] = await Promise.all([
    db.pool.query('select count(*)::int as count from cities'),
    db.pool.query(`
      select reason, count(*)::int as count
      from cities
      cross join unnest(selection_reasons) reason
      group by reason
      order by count desc, reason
    `),
    db.pool.query(`
      select geo_names_cities.country_code, count(*)::int as count
      from cities
      inner join geo_names_cities on geo_names_cities.id = cities.id
      group by geo_names_cities.country_code
      order by count desc, geo_names_cities.country_code
      limit 20
    `)
  ]);

  console.log(`Selected ${total.rows[0]?.count ?? 0} focused weather cities.`);
  console.log(`Selection reasons: ${reasons.rows.map((row) => `${row.reason}=${row.count}`).join(', ')}`);
  console.log(`Top selected countries: ${countries.rows.map((row) => `${row.country_code}=${row.count}`).join(', ')}`);
}

async function readCitiesFromZip(
  zipPath: string,
  countries: Map<string, CountryInfo>
): Promise<GeoNamesCity[]> {
  const child = spawn('unzip', ['-p', zipPath, `${geonamesCitiesPackage}.txt`], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (!child.stdout) throw new Error('Failed to read GeoNames zip output.');

  const stderrChunks: Buffer[] = [];
  child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
  const closePromise = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`unzip failed with ${code}: ${Buffer.concat(stderrChunks).toString('utf8')}`));
    });
  });

  const cities: GeoNamesCity[] = [];
  const lines = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity
  });

  for await (const line of lines) {
    const row = parseGeoNamesCityRow(line);
    if (!row) continue;

    const city = toGeoNamesCity(row, countries);
    if (city) cities.push(city);
  }

  await closePromise;
  return cities;
}

async function readAlternateNamesFromZip(zipPath: string, scopedGeonameIds: Set<number>): Promise<GeoNamesAlternateName[]> {
  const child = spawn('unzip', ['-p', zipPath, 'alternateNamesV2.txt'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (!child.stdout) throw new Error('Failed to read GeoNames alternate names zip output.');

  const stderrChunks: Buffer[] = [];
  child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
  const closePromise = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`unzip alternateNamesV2 failed with ${code}: ${Buffer.concat(stderrChunks).toString('utf8')}`));
    });
  });

  const alternateNames: GeoNamesAlternateName[] = [];
  const lines = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity
  });

  for await (const line of lines) {
    const columns = line.split('\t');
    const alternateNameId = Number(columns[0]);
    const geonameId = Number(columns[1]);
    const isoLanguage = columns[2];
    if (!Number.isFinite(alternateNameId) || !Number.isFinite(geonameId) || !scopedGeonameIds.has(geonameId) || !chineseLanguageCodes.has(isoLanguage)) continue;
    if (!columns[3]) continue;

    alternateNames.push({
      alternateNameId,
      geonameId,
      isoLanguage,
      alternateName: columns[3],
      isPreferredName: columns[4] === '1',
      isShortName: columns[5] === '1',
      isColloquial: columns[6] === '1',
      isHistoric: columns[7] === '1',
      fromPeriod: columns[8] || undefined,
      toPeriod: columns[9] || undefined
    });
  }

  await closePromise;
  return alternateNames;
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'global-weather-geonames-'));
const zipPath = path.join(tempDir, `${geonamesCitiesPackage}.zip`);
const alternateNamesZipPath = path.join(tempDir, 'alternateNamesV2.zip');
loadRootEnv();
const db = createWeatherDatabase();

try {
  await setupWeatherDatabase(db);
  const [countryInfoText, admin1InfoText, admin2InfoText] = await Promise.all([
    downloadText(`${geonamesBaseUrl}/countryInfo.txt`),
    downloadText(`${geonamesBaseUrl}/admin1CodesASCII.txt`),
    downloadText(`${geonamesBaseUrl}/admin2Codes.txt`)
  ]);
  const [countryProfiles, tourismSeeds] = await Promise.all([
    readJsonFile<CountryTourismProfile[]>(path.join(citySelectionDataDir, 'country-profiles.json')),
    readJsonFile<TourismDestinationSeed[]>(path.join(citySelectionDataDir, 'tourism-destinations.json'))
  ]);
  const countries = parseCountryInfo(countryInfoText);
  const admin1Items = parseAdmin1Info(admin1InfoText);
  const admin2Items = parseAdmin2Info(admin2InfoText);

  await Promise.all([
    downloadFile(`${geonamesBaseUrl}/${geonamesCitiesPackage}.zip`, zipPath),
    downloadFile(`${geonamesBaseUrl}/alternateNamesV2.zip`, alternateNamesZipPath)
  ]);
  const cities = await readCitiesFromZip(zipPath, countries);
  const scopedGeonameIds = new Set([
    ...cities.map((city) => city.geonameId),
    ...admin1Items.map((admin) => admin.geonameId),
    ...admin2Items.map((admin) => admin.geonameId)
  ]);
  const alternateNames = await readAlternateNamesFromZip(alternateNamesZipPath, scopedGeonameIds);

  await syncGeonamesCities(db, cities, admin1Items, admin2Items, alternateNames, countryProfiles, tourismSeeds);
  await logCitySelectionSummary(db);
  await updateRefreshSuccess(db, 'cities:import-geonames');

  console.log(`Imported ${cities.length} global GeoNames cities, ${admin1Items.length} admin1 rows, ${admin2Items.length} admin2 rows, ${alternateNames.length} Chinese alternate names, ${countryProfiles.length} country profiles, and ${tourismSeeds.length} tourism seeds into Postgres.`);
} finally {
  await db.close();
  await rm(tempDir, { recursive: true, force: true });
}
