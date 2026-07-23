/**
 * 文件说明: 抽取公开旅行目的地来源的原始数据，供后续 GeoNames 对齐前生成候选目的地输入。
 * 参考资料: Wikivoyage MediaWiki API, UNESCO WHC syndication, UN Tourism Best Tourism Villages
 * 对应文档: data/input/README.md
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type WikivoyageCategory = 'Star cities' | 'Guide cities' | 'Huge city articles';

type WikivoyageMember = {
  pageid: number;
  ns: number;
  title: string;
};

type WikivoyageDestination = {
  pageId: number;
  title: string;
  sourceCategories: WikivoyageCategory[];
  sourceUrl: string;
};

type UntourismPlace = {
  id: string;
  title: string;
  address: string;
  source: string;
  location: {
    lat: string;
    lng: string;
    country: string;
    extra_fields: {
      region?: string;
      img?: string;
      url?: string;
      listorder?: number;
    };
  };
  categories: Array<{
    id: string;
    name: string;
    type: string;
  }>;
};

type UntourismDestination = {
  id: string;
  title: string;
  address: string;
  country: string;
  region: string | null;
  years: string[];
  latitude: number | null;
  longitude: number | null;
  detailUrl: string | null;
  imageUrl: string | null;
};

type FetchProbe = {
  url: string;
  transport: 'fetch' | 'playwright';
  ok: boolean;
  status: number;
  statusText: string;
  contentType: string | null;
  byteLength: number;
  blockedByCloudflare: boolean;
  bodyPreview?: string;
  savedAs?: string;
  parsedCount?: number;
  pageTitle?: string;
  finalUrl?: string;
  error?: string;
};

type PlaywrightProbeResult = {
  probe: FetchProbe;
  body: Buffer | null;
};

type SourceSummary = {
  generatedAt: string;
  outputDir: string;
  sources: Array<{
    source: string;
    url: string;
    extractable: 'yes' | 'partial' | 'blocked';
    count: number | null;
    fields: string[];
    risks: string[];
    rawFiles: string[];
  }>;
};

const rootDir = process.cwd();
const generatedAt = new Date().toISOString();
const outputDir = path.join(rootDir, 'data', 'raw', 'tourism-destinations');

const userAgent = 'WeatherTripSourceExtractor/0.1 (Weather Trip data research)';

const wikivoyageCategories: WikivoyageCategory[] = ['Star cities', 'Guide cities', 'Huge city articles'];

const unescoEndpoints = [
  'https://whc.unesco.org/en/list/xml/',
  'https://whc.unesco.org/en/list/xls/',
  'https://whc.unesco.org/en/list/xlsx/'
];

async function writeJson(fileName: string, value: JsonValue): Promise<string> {
  const fullPath = path.join(outputDir, fileName);
  await writeFile(fullPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return fullPath;
}

async function fetchText(url: string): Promise<{ response: Response; text: string }> {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
  const text = await response.text();
  return { response, text };
}

function wikivoyageApiUrl(category: WikivoyageCategory, cmcontinue?: string): string {
  const url = new URL('https://en.wikivoyage.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query',
    list: 'categorymembers',
    cmtitle: `Category:${category}`,
    cmlimit: '500',
    cmtype: 'page',
    format: 'json',
    formatversion: '2',
    ...(cmcontinue ? { cmcontinue } : {})
  }).toString();
  return url.toString();
}

async function fetchWikivoyageCategory(category: WikivoyageCategory): Promise<WikivoyageMember[]> {
  const rows: WikivoyageMember[] = [];
  let cmcontinue: string | undefined;

  do {
    const { text } = await fetchText(wikivoyageApiUrl(category, cmcontinue));
    const payload = JSON.parse(text) as {
      query?: { categorymembers?: WikivoyageMember[] };
      continue?: { cmcontinue?: string };
    };
    rows.push(...(payload.query?.categorymembers ?? []));
    cmcontinue = payload.continue?.cmcontinue;
  } while (cmcontinue);

  return rows;
}

async function extractWikivoyage(): Promise<{
  countByCategory: Record<WikivoyageCategory, number>;
  destinations: WikivoyageDestination[];
  rawFiles: string[];
}> {
  const membersByCategory = {} as Record<WikivoyageCategory, WikivoyageMember[]>;
  const destinationByPageId = new Map<number, WikivoyageDestination>();

  for (const category of wikivoyageCategories) {
    const members = await fetchWikivoyageCategory(category);
    membersByCategory[category] = members;
    for (const member of members) {
      const existing = destinationByPageId.get(member.pageid);
      if (existing) {
        existing.sourceCategories.push(category);
        continue;
      }
      destinationByPageId.set(member.pageid, {
        pageId: member.pageid,
        title: member.title,
        sourceCategories: [category],
        sourceUrl: `https://en.wikivoyage.org/wiki/${encodeURIComponent(member.title.replaceAll(' ', '_'))}`
      });
    }
  }

  const destinations = [...destinationByPageId.values()].sort((left, right) => left.title.localeCompare(right.title));
  const rawFiles = [
    await writeJson('wikivoyage-categorymembers.json', membersByCategory as unknown as JsonValue),
    await writeJson('wikivoyage-destinations.json', destinations as unknown as JsonValue)
  ];

  return {
    countByCategory: Object.fromEntries(
      wikivoyageCategories.map((category) => [category, membersByCategory[category].length])
    ) as Record<WikivoyageCategory, number>,
    destinations,
    rawFiles
  };
}

function extractCallArgument(source: string, call: string): string {
  const callIndex = source.indexOf(call);
  if (callIndex < 0) {
    throw new Error(`Cannot find ${call} in UN Tourism page content`);
  }

  const start = callIndex + call.length;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') inString = true;
    if (char === '{' || char === '[') depth += 1;
    if (char === '}' || char === ']') depth -= 1;
    if (char === ')' && depth === 0) return source.slice(start, index);
  }

  throw new Error(`Cannot parse ${call} argument from UN Tourism page content`);
}

function parseCoordinate(value: string): number | null {
  const normalized = value.replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

async function extractUntourism(): Promise<{ destinations: UntourismDestination[]; rawFiles: string[] }> {
  const pageUrl = 'https://tourism-villages.unwto.org/en/wp-json/wp/v2/pages/4213?context=view';
  const { text } = await fetchText(pageUrl);
  const page = JSON.parse(text) as { id: number; link: string; modified: string; content: { rendered: string } };
  const mapPayload = JSON.parse(extractCallArgument(page.content.rendered, '.maps(')) as { places: UntourismPlace[] };

  const destinations = mapPayload.places.map((place) => ({
    id: place.id,
    title: place.title,
    address: place.address,
    country: place.location.country,
    region: place.location.extra_fields.region ?? null,
    years: place.categories.map((category) => category.name),
    latitude: parseCoordinate(place.location.lat),
    longitude: parseCoordinate(place.location.lng),
    detailUrl: place.location.extra_fields.url ?? null,
    imageUrl: place.location.extra_fields.img ?? null
  }));

  const rawFiles = [
    await writeJson('un-tourism-villages-page.json', page as unknown as JsonValue),
    await writeJson('un-tourism-villages-map.json', mapPayload as unknown as JsonValue),
    await writeJson('un-tourism-villages-destinations.json', destinations as unknown as JsonValue)
  ];

  return { destinations, rawFiles };
}

function parseUnescoXmlCount(xml: string): number | null {
  const rowMatches = xml.match(/<row\b/gi);
  if (rowMatches) return rowMatches.length;
  const siteMatches = xml.match(/<site\b/gi);
  return siteMatches?.length ?? null;
}

function decodeXmlText(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function xmlTag(row: string, tagName: string): string | null {
  const match = row.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i'));
  if (!match) return null;
  const value = decodeXmlText(match[1].replace(/<[^>]+>/g, '').trim());
  return value.length > 0 ? value : null;
}

function parseUnescoXmlDestinations(xml: string): JsonValue[] {
  const rows = [...xml.matchAll(/<row>([\s\S]*?)<\/row>/gi)].map((match) => match[1]);
  return rows.map((row) => ({
    idNumber: xmlTag(row, 'id_number'),
    uniqueNumber: xmlTag(row, 'unique_number'),
    name: xmlTag(row, 'site'),
    states: xmlTag(row, 'states'),
    isoCodes: xmlTag(row, 'iso_code')?.split(',').map((code) => code.trim()).filter(Boolean) ?? [],
    regions: xmlTag(row, 'regions'),
    category: xmlTag(row, 'category'),
    latitude: xmlTag(row, 'latitude') ? Number(xmlTag(row, 'latitude')) : null,
    longitude: xmlTag(row, 'longitude') ? Number(xmlTag(row, 'longitude')) : null,
    dateInscribed: xmlTag(row, 'date_inscribed'),
    sourceUrl: xmlTag(row, 'http_url')
  }));
}

function isXmlContentType(contentType: string | null): boolean {
  return contentType === 'text/xml;charset=UTF-8' || contentType?.startsWith('text/xml') === true || contentType?.startsWith('application/xml') === true;
}

function unescoRawFileName(url: string, contentType: string | null): string {
  if (isXmlContentType(contentType)) return 'unesco-world-heritage-list.xml';
  if (url.endsWith('/xlsx/')) return 'unesco-world-heritage-list.xlsx';
  if (url.endsWith('/xls/')) return 'unesco-world-heritage-list.xls';
  return 'unesco-world-heritage-list.bin';
}

async function probeUnescoWithPlaywright(url: string): Promise<PlaywrightProbeResult | null> {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      locale: 'en-US',
      timezoneId: 'Asia/Shanghai',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForTimeout(3_000);
      const contentType = response?.headers()['content-type'] ?? null;
      const body = response ? Buffer.from(await response.body()) : Buffer.from(await page.content(), 'utf8');
      const textPreview = body.toString('utf8', 0, Math.min(body.byteLength, 800));
      const blockedByCloudflare = (response?.status() ?? 0) === 403 && /cloudflare|cf-mitigated|Just a moment/i.test(textPreview);

      return {
        probe: {
          url,
          transport: 'playwright',
          ok: response?.ok() ?? false,
          status: response?.status() ?? 0,
          statusText: response?.statusText() ?? '',
          contentType,
          byteLength: body.byteLength,
          blockedByCloudflare,
          bodyPreview: textPreview,
          pageTitle: await page.title(),
          finalUrl: page.url()
        },
        body
      };
    } catch (error: unknown) {
      return {
        probe: {
          url,
          transport: 'playwright',
          ok: false,
          status: 0,
          statusText: '',
          contentType: null,
          byteLength: 0,
          blockedByCloudflare: false,
          finalUrl: page.url(),
          pageTitle: await page.title().catch(() => ''),
          error: error instanceof Error ? error.message : String(error)
        },
        body: null
      };
    } finally {
      await browser.close();
    }
  } catch (error: unknown) {
    return {
      probe: {
        url,
        transport: 'playwright',
        ok: false,
        status: 0,
        statusText: '',
        contentType: null,
        byteLength: 0,
        blockedByCloudflare: false,
        error: error instanceof Error ? error.message : String(error)
      },
      body: null
    };
  }
}

async function probeUnesco(): Promise<{ probes: FetchProbe[]; rawFiles: string[]; parsedCount: number | null }> {
  const probes: FetchProbe[] = [];
  let parsedCount: number | null = null;
  const rawFiles: string[] = [];

  for (const url of unescoEndpoints) {
    const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
    const contentType = response.headers.get('content-type');
    const arrayBuffer = await response.arrayBuffer();
    const body = Buffer.from(arrayBuffer);
    const textPreview = body.toString('utf8', 0, Math.min(body.byteLength, 800));
    const blockedByCloudflare = response.status === 403 && /cloudflare|cf-mitigated|Just a moment/i.test(textPreview);
    const probe: FetchProbe = {
      url,
      transport: 'fetch',
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType,
      byteLength: body.byteLength,
      blockedByCloudflare,
      bodyPreview: textPreview
    };

    if (response.ok) {
      probe.savedAs = unescoRawFileName(url, contentType);
      await writeFile(path.join(outputDir, probe.savedAs), body);
      rawFiles.push(path.join(outputDir, probe.savedAs));

      if (isXmlContentType(contentType)) {
        const xml = body.toString('utf8');
        probe.parsedCount = parseUnescoXmlCount(xml) ?? undefined;
        parsedCount = probe.parsedCount ?? parsedCount;
        rawFiles.push(await writeJson('unesco-world-heritage-destinations.json', parseUnescoXmlDestinations(xml)));
      }
    }

    probes.push(probe);

    if (blockedByCloudflare) {
      const playwrightResult = await probeUnescoWithPlaywright(url);
      if (playwrightResult) {
        const { probe: playwrightProbe, body: playwrightBody } = playwrightResult;
        if (playwrightProbe.ok && playwrightBody) {
          playwrightProbe.savedAs = unescoRawFileName(url, playwrightProbe.contentType);
          await writeFile(path.join(outputDir, playwrightProbe.savedAs), playwrightBody);
          rawFiles.push(path.join(outputDir, playwrightProbe.savedAs));

          if (isXmlContentType(playwrightProbe.contentType)) {
            const xml = playwrightBody.toString('utf8');
            playwrightProbe.parsedCount = parseUnescoXmlCount(xml) ?? undefined;
            parsedCount = playwrightProbe.parsedCount ?? parsedCount;
            rawFiles.push(await writeJson('unesco-world-heritage-destinations.json', parseUnescoXmlDestinations(xml)));
          }
        }
        probes.push(playwrightProbe);
      }
    }
  }

  return {
    probes,
    rawFiles: [...rawFiles, await writeJson('unesco-probes.json', probes as unknown as JsonValue)],
    parsedCount
  };
}

function relativeFiles(files: string[]): string[] {
  return files.map((file) => path.relative(rootDir, file));
}

async function main(): Promise<void> {
  await mkdir(outputDir, { recursive: true });

  const wikivoyage = await extractWikivoyage();
  const untourism = await extractUntourism();
  const unesco = await probeUnesco();

  const summary: SourceSummary = {
    generatedAt,
    outputDir: path.relative(rootDir, outputDir),
    sources: [
      {
        source: 'Wikivoyage quality city categories',
        url: 'https://en.wikivoyage.org/w/api.php?action=query&list=categorymembers',
        extractable: 'yes',
        count: wikivoyage.destinations.length,
        fields: ['pageId', 'title', 'sourceCategories', 'sourceUrl'],
        risks: ['Wikivoyage category membership is community-maintained and can change without release versioning.'],
        rawFiles: relativeFiles(wikivoyage.rawFiles)
      },
      {
        source: 'UN Tourism Best Tourism Villages',
        url: 'https://tourism-villages.unwto.org/en/villages/',
        extractable: 'yes',
        count: untourism.destinations.length,
        fields: ['id', 'title', 'address', 'country', 'region', 'years', 'latitude', 'longitude', 'detailUrl', 'imageUrl'],
        risks: ['The machine-readable list is embedded in a WordPress map widget, so template/plugin changes can break extraction.'],
        rawFiles: relativeFiles(untourism.rawFiles)
      },
      {
        source: 'UNESCO World Heritage List',
        url: 'https://whc.unesco.org/en/list/xml/',
        extractable: unesco.parsedCount === null ? 'blocked' : 'yes',
        count: unesco.parsedCount,
        fields: ['id_number', 'unique_number', 'site', 'states', 'iso_code', 'regions', 'category', 'latitude', 'longitude'],
        risks: ['Current command-line probe can be blocked by Cloudflare managed challenge; respect UNESCO syndication terms before publishing derived raw data.'],
        rawFiles: relativeFiles(unesco.rawFiles)
      }
    ]
  };

  const summaryFile = await writeJson('summary.json', summary as unknown as JsonValue);

  console.log(JSON.stringify({ summary: path.relative(rootDir, summaryFile), ...summary }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
