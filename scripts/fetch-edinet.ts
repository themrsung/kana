/**
 * Fetch Toyota's 有価証券報告書 from EDINET and crop it to narrative prose.
 *
 * This is a build-time script, not app code, for two reasons: EDINET v2 needs a
 * subscription key that must not ship to a browser, and the API sends no CORS
 * headers, so a browser could not call it even with a key. The app reads what
 * this writes.
 *
 *   EDINET_API_KEY=... npm run fetch:edinet
 *   npm run fetch:edinet -- --year 2025 --out src/data/toyota-yuho.json
 *
 * With no key the script exits without touching anything, and the app keeps
 * using the committed fallback - see README.
 */

import { writeFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { decodeBytes } from '../src/core/text/decode';
import { normaliseWhitespace } from '../src/core/text/extract';
import type { SourceDocJson } from '../src/core/text/source';

const API = 'https://api.edinet-fsa.go.jp/api/v2';

/** Toyota Motor Corporation. */
const EDINET_CODE = 'E02144';
const SEC_CODE = '72030';
/** 企業内容等の開示に関する内閣府令 / 有価証券報告書. */
const ORDINANCE_CODE = '010';
const FORM_CODE = '030000';

/** The narrative sections worth typing. Everything else is tables of numbers. */
const NARRATIVE = [
  '経営方針',
  '経営環境',
  '事業の状況',
  '対処すべき課題',
  '事業等のリスク',
  '経営者による財政状態',
  '研究開発活動',
  '設備の状況',
  'サステナビリティ',
];

interface Args {
  readonly year: number;
  readonly out: string;
}

function parseArgs(argv: readonly string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  return {
    year: Number(get('--year') ?? new Date().getFullYear()),
    out: get('--out') ?? 'src/data/toyota-yuho.json',
  };
}

interface DocumentListItem {
  readonly docID: string | null;
  readonly edinetCode: string | null;
  readonly secCode: string | null;
  readonly ordinanceCode: string | null;
  readonly formCode: string | null;
  readonly docDescription: string | null;
  readonly periodEnd: string | null;
  readonly csvFlag: string | null;
}

async function edinet(path: string, key: string, params: Record<string, string>): Promise<Response> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('Subscription-Key', key);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`EDINET ${path} -> ${res.status} ${res.statusText}`);
  return res;
}

/**
 * EDINET answers a bad key with **HTTP 200** and a JSON body carrying
 * `StatusCode: 401`, so `res.ok` says nothing about whether the call worked.
 * Without this check an expired key looks exactly like "Toyota filed nothing
 * this year", which is a miserable thing to debug.
 */
async function edinetJson<T>(path: string, key: string, params: Record<string, string>): Promise<T> {
  const res = await edinet(path, key, params);
  const body = (await res.json()) as T & {
    StatusCode?: number;
    message?: string;
    metadata?: { status?: string; message?: string };
  };
  const status = body.StatusCode ?? Number(body.metadata?.status ?? 200);
  if (status !== 200) {
    throw new Error(
      `EDINET ${path} -> ${status}: ${body.message ?? body.metadata?.message ?? 'request rejected'}`,
    );
  }
  return body;
}

/** Every date in the June filing window, when March-year-end filers report. */
function filingWindow(year: number): string[] {
  const days: string[] = [];
  for (let day = 1; day <= 30; day++) {
    days.push(`${year}-06-${String(day).padStart(2, '0')}`);
  }
  return days;
}

async function findFiling(key: string, year: number): Promise<DocumentListItem> {
  for (const date of filingWindow(year)) {
    const body = await edinetJson<{ results?: DocumentListItem[] }>('/documents.json', key, {
      date,
      type: '2',
    });
    const hit = body.results?.find(
      (d) =>
        d.edinetCode === EDINET_CODE &&
        d.ordinanceCode === ORDINANCE_CODE &&
        d.formCode === FORM_CODE,
    );
    if (hit) {
      console.log(`fetch-edinet: ${date} ${hit.docID} ${hit.docDescription ?? ''}`);
      return hit;
    }
    // EDINET asks for one request per second; be a good citizen.
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `No 有価証券報告書 for ${EDINET_CODE} (sec ${SEC_CODE}) in the ${year} June window.`,
  );
}

/** XBRL-flavoured CSV: tab separated, UTF-16LE, one fact per row. */
function factsFromCsv(text: string): { element: string; value: string }[] {
  const rows = text.split(/\r?\n/).filter((line) => line !== '');
  const out: { element: string; value: string }[] = [];
  for (const row of rows.slice(1)) {
    const cells = row.split('\t').map((c) => c.replace(/^"|"$/g, ''));
    const element = cells[0] ?? '';
    const value = cells[cells.length - 1] ?? '';
    if (element !== '' && value !== '') out.push({ element, value });
  }
  return out;
}

/** Strip the inline XBRL/HTML a narrative block is wrapped in. */
function stripMarkup(value: string): string {
  return normaliseWhitespace(
    value
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&'),
  );
}

function isNarrative(text: string): boolean {
  if (text.length < 40) return false;
  if (!/[。]/.test(text)) return false;
  // Reject anything that is mostly figures - those are the tables.
  const digits = (text.match(/[0-9０-９,，.]/g) ?? []).length;
  return digits / text.length < 0.2;
}

async function main(): Promise<void> {
  const key = process.env.EDINET_API_KEY;
  if (!key) {
    console.log(
      'fetch-edinet: EDINET_API_KEY is not set - leaving the committed fallback in place.\n' +
        '             See .env.example and the README for how to get a key.',
    );
    return;
  }

  const { year, out } = parseArgs(process.argv.slice(2));
  const filing = await findFiling(key, year);
  const docID = filing.docID!;

  // type=5 is the CSV bundle: a zip of tab-separated, UTF-16LE files.
  const res = await edinet(`/documents/${docID}`, key, { type: '5' });
  const zip = unzipSync(new Uint8Array(await res.arrayBuffer()));

  const paragraphs: string[] = [];
  for (const [name, bytes] of Object.entries(zip)) {
    if (!name.toLowerCase().endsWith('.csv')) continue;
    const { text } = decodeBytes(bytes);
    for (const fact of factsFromCsv(text)) {
      if (!NARRATIVE.some((section) => fact.element.includes(section) || fact.value.includes(section))) {
        continue;
      }
      for (const block of stripMarkup(fact.value).split('\n')) {
        const clean = block.trim();
        if (isNarrative(clean)) paragraphs.push(clean);
      }
    }
  }

  const unique = [...new Set(paragraphs)];
  if (unique.length === 0) throw new Error(`No narrative sections found in ${docID}.`);

  const doc: SourceDocJson = {
    id: 'edinet-toyota-yuho',
    title: `トヨタ自動車 有価証券報告書 ${filing.periodEnd ?? year}`,
    origin: `EDINET v2 · ${docID}`,
    fetchedAt: new Date().toISOString(),
    docID,
    fiscalYear: String(year),
    paragraphs: unique,
  };

  await writeFile(out, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log(`fetch-edinet: wrote ${unique.length} paragraphs to ${out}`);
}

await main();
