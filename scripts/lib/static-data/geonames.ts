/**
 * 文件说明: 提供静态数据生成脚本共用的 GeoNames 下载、缓存和解析能力。
 * 参考资料: https://download.geonames.org/export/dump/readme.txt
 * 对应文档: docs/specs/31-data-flow.md
 */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import OpenCC from 'opencc-js';

export type CountryInfo = {
  code: string;
  iso3: string;
  name: string;
  capital?: string;
  areaSqKm: number;
  population: number;
  continentCode: string;
};

export type GeoNamesCity = {
  geonameId: number;
  id: string;
  name: string;
  asciiName: string;
  alternateNames: string[];
  latitude: number;
  longitude: number;
  featureCode: string;
  countryCode: string;
  admin1Code?: string;
  admin2Code?: string;
  population: number;
  elevation?: number;
  dem?: number;
  timezone: string;
  continentCode: string;
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

export type AlternateName = {
  geonameId: number;
  isoLanguage: string;
  alternateName: string;
  isPreferredName: boolean;
  isShortName: boolean;
  isHistoric: boolean;
};

export type GeoNamesDataset = {
  countries: Map<string, CountryInfo>;
  admin1Items: GeoNamesAdmin1[];
  admin2Items: GeoNamesAdmin2[];
  cities: GeoNamesCity[];
  paths: {
    rawDir: string;
    countryInfo: string;
    admin1: string;
    admin2: string;
    citiesZip: string;
    alternateNamesZip: string;
  };
};

export type GeoNamesAdminDataset = Omit<GeoNamesDataset, 'cities'>;

export type LoadGeoNamesDatasetOptions = {
  includeAlternateNames?: boolean;
};

const geonamesBaseUrl = 'https://download.geonames.org/export/dump';
const geonamesCitiesPackage = 'cities1000';
const chineseLanguageCodePriority = ['zh-CN', 'zh-Hans', 'zh-SG', 'zh', 'zh-Hant', 'zh-TW', 'zh-HK', 'zh-MO'];
const chineseLanguageCodes = new Set(chineseLanguageCodePriority);
const convertChineseNameToSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' });

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isValidZip(filePath: string): Promise<boolean> {
  if (!(await fileExists(filePath))) return false;
  const child = spawn('unzip', ['-tqq', filePath], { stdio: ['ignore', 'ignore', 'ignore'] });
  return new Promise((resolve) => {
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

async function shouldUseCachedDownload(destination: string): Promise<boolean> {
  if (!(await fileExists(destination))) return false;
  if (!destination.endsWith('.zip')) return true;
  if (await isValidZip(destination)) return true;
  await rm(destination, { force: true });
  return false;
}

async function downloadFile(url: string, destination: string): Promise<void> {
  if (await shouldUseCachedDownload(destination)) return;

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  await mkdir(path.dirname(destination), { recursive: true });
  const body = response.body as unknown as Parameters<typeof Readable.fromWeb>[0];
  const temporaryPath = `${destination}.tmp`;
  await rm(temporaryPath, { force: true });
  await pipeline(Readable.fromWeb(body), createWriteStream(temporaryPath));
  await rm(destination, { force: true });
  await rename(temporaryPath, destination);
}

async function downloadText(url: string, cachePath: string): Promise<string> {
  if (await fileExists(cachePath)) return readFile(cachePath, 'utf8');

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  const text = await response.text();
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, text);
  return text;
}

function parseInteger(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseCountryInfo(text: string): Map<string, CountryInfo> {
  const countries = new Map<string, CountryInfo>();
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const columns = line.split('\t');
    const code = columns[0];
    const iso3 = columns[1];
    const name = columns[4];
    const areaSqKm = Number(columns[6]) || 0;
    const population = Number(columns[7]) || 0;
    const continentCode = columns[8];
    if (code && iso3 && continentCode) {
      countries.set(code, {
        code,
        iso3,
        name: name || code,
        capital: columns[5] || undefined,
        areaSqKm,
        population,
        continentCode
      });
    }
  }
  return countries;
}

export function parseAdmin1Info(text: string): GeoNamesAdmin1[] {
  return text.split(/\r?\n/).flatMap((line): GeoNamesAdmin1[] => {
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

export function parseAdmin2Info(text: string): GeoNamesAdmin2[] {
  return text.split(/\r?\n/).flatMap((line): GeoNamesAdmin2[] => {
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

function parseGeoNamesCityLine(line: string, countries: Map<string, CountryInfo>): GeoNamesCity | null {
  const columns = line.split('\t');
  if (columns.length < 19) return null;

  const countryCode = columns[8];
  const country = countries.get(countryCode);
  const geonameId = Number(columns[0]);
  const latitude = Number(columns[4]);
  const longitude = Number(columns[5]);
  if (!country || !Number.isFinite(geonameId) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (columns[6] !== 'P' || !columns[17]) return null;

  return {
    geonameId,
    id: `geonames-${geonameId}`,
    name: columns[1],
    asciiName: columns[2] || columns[1],
    alternateNames: columns[3] ? columns[3].split(',') : [],
    latitude,
    longitude,
    featureCode: columns[7],
    countryCode,
    admin1Code: columns[10] || undefined,
    admin2Code: columns[11] || undefined,
    population: Number(columns[14]) || 0,
    elevation: parseInteger(columns[15]),
    dem: parseInteger(columns[16]),
    timezone: columns[17],
    continentCode: country.continentCode
  };
}

export async function readCitiesFromZip(zipPath: string, countries: Map<string, CountryInfo>): Promise<GeoNamesCity[]> {
  const child = spawn('unzip', ['-p', zipPath, `${geonamesCitiesPackage}.txt`], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (!child.stdout) throw new Error('Failed to read GeoNames cities zip output.');

  const stderrChunks: Buffer[] = [];
  child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
  const closePromise = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`unzip ${geonamesCitiesPackage}.zip failed with ${code}: ${Buffer.concat(stderrChunks).toString('utf8')}`));
    });
  });

  const cities: GeoNamesCity[] = [];
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of lines) {
    const city = parseGeoNamesCityLine(line, countries);
    if (city) cities.push(city);
  }
  await closePromise;
  return cities;
}

export async function readAlternateNamesFromZip(zipPath: string, scopedGeonameIds: Set<number>): Promise<Map<number, string>> {
  const child = spawn('unzip', ['-p', zipPath, 'alternateNamesV2.txt'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (!child.stdout) throw new Error('Failed to read GeoNames alternate names zip output.');

  const stderrChunks: Buffer[] = [];
  child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
  const closePromise = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`unzip alternateNamesV2.zip failed with ${code}: ${Buffer.concat(stderrChunks).toString('utf8')}`));
    });
  });

  const bestByGeonameId = new Map<number, AlternateName>();
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of lines) {
    const columns = line.split('\t');
    const geonameId = Number(columns[1]);
    const isoLanguage = columns[2];
    if (!Number.isFinite(geonameId) || !scopedGeonameIds.has(geonameId) || !chineseLanguageCodes.has(isoLanguage) || !columns[3]) {
      continue;
    }

    const candidate: AlternateName = {
      geonameId,
      isoLanguage,
      alternateName: normalizeChineseAlternateName(columns[3]),
      isPreferredName: columns[4] === '1',
      isShortName: columns[5] === '1',
      isHistoric: columns[7] === '1'
    };
    const current = bestByGeonameId.get(geonameId);
    if (!current || compareAlternateName(candidate, current) < 0) bestByGeonameId.set(geonameId, candidate);
  }
  await closePromise;

  return new Map([...bestByGeonameId.entries()].map(([geonameId, name]) => [geonameId, name.alternateName]));
}

function compareAlternateName(left: AlternateName, right: AlternateName): number {
  const languageRank = (value: string) => chineseLanguageCodePriority.indexOf(value);
  return (
    languageRank(left.isoLanguage) - languageRank(right.isoLanguage) ||
    Number(right.isPreferredName) - Number(left.isPreferredName) ||
    Number(right.isShortName) - Number(left.isShortName) ||
    Number(left.isHistoric) - Number(right.isHistoric) ||
    left.alternateName.length - right.alternateName.length ||
    left.alternateName.localeCompare(right.alternateName)
  );
}

export function normalizeChineseAlternateName(value: string): string {
  return convertChineseNameToSimplified(value);
}

function geoNamesRawPaths(rootDir: string): GeoNamesDataset['paths'] {
  const rawDir = path.join(rootDir, 'data', 'raw', 'geonames');
  return {
    rawDir,
    countryInfo: path.join(rawDir, 'countryInfo.txt'),
    admin1: path.join(rawDir, 'admin1CodesASCII.txt'),
    admin2: path.join(rawDir, 'admin2Codes.txt'),
    citiesZip: path.join(rawDir, `${geonamesCitiesPackage}.zip`),
    alternateNamesZip: path.join(rawDir, 'alternateNamesV2.zip')
  };
}

export async function loadGeoNamesAdminDataset(rootDir: string): Promise<GeoNamesAdminDataset> {
  const paths = geoNamesRawPaths(rootDir);
  await mkdir(paths.rawDir, { recursive: true });

  const [countryInfoText, admin1Text, admin2Text] = await Promise.all([
    downloadText(`${geonamesBaseUrl}/countryInfo.txt`, paths.countryInfo),
    downloadText(`${geonamesBaseUrl}/admin1CodesASCII.txt`, paths.admin1),
    downloadText(`${geonamesBaseUrl}/admin2Codes.txt`, paths.admin2)
  ]);

  return {
    countries: parseCountryInfo(countryInfoText),
    admin1Items: parseAdmin1Info(admin1Text),
    admin2Items: parseAdmin2Info(admin2Text),
    paths
  };
}

export async function loadGeoNamesDataset(rootDir: string, options: LoadGeoNamesDatasetOptions = {}): Promise<GeoNamesDataset> {
  const adminDataset = await loadGeoNamesAdminDataset(rootDir);
  const { paths, countries } = adminDataset;
  await downloadFile(`${geonamesBaseUrl}/${geonamesCitiesPackage}.zip`, paths.citiesZip);
  if (options.includeAlternateNames) {
    await downloadFile(`${geonamesBaseUrl}/alternateNamesV2.zip`, paths.alternateNamesZip);
  }

  return {
    ...adminDataset,
    cities: await readCitiesFromZip(paths.citiesZip, countries),
  };
}
