/**
 * Crop a PDF down to its prose.
 *
 * The default corpus is Toyota's 統合報告書 2025: 168 pages of which most is
 * charts, tables, org diagrams, English mirror text, page furniture and a
 * contents list threaded with dot leaders. None of that is typeable Japanese,
 * and a typing app that fed it to the user would be unusable.
 *
 * So this keeps only paragraphs that look like someone wrote them as sentences:
 * mostly Japanese, long enough to be prose, ending in a full stop, and not
 * repeated on every page. Everything else goes. The filter is deliberately
 * strict - the cost of dropping a good paragraph is nothing, the cost of
 * keeping a table row is a token of gibberish in the middle of a session.
 *
 *   npm run crop:pdf -- [in.pdf] [out.json]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { joinPdfLines, normaliseWhitespace } from '../src/core/text/extract';
import type { SourceDocJson } from '../src/core/text/source';

const IN = process.argv[2] ?? 'src/data/default-source.pdf';
const OUT = process.argv[3] ?? 'src/data/default-source.json';

/** Ratio of the string that is kana, kanji or Japanese punctuation. */
function japaneseRatio(text: string): number {
  const stripped = text.replace(/\s/g, '');
  if (stripped.length === 0) return 0;
  let jp = 0;
  for (const ch of stripped) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x3000 && c <= 0x30ff) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0xff00 && c <= 0xffef)) {
      jp += 1;
    }
  }
  return jp / [...stripped].length;
}

/** Contents-page dot leaders, in every flavour this document uses. */
const DOT_LEADER = /[.．・…‥]{4,}|[─―ー]{6,}/;

const JP_CHAR = '[ぁ-ヿ㐀-鿿]';

/**
 * Drop the spaces a PDF sprinkles between Japanese glyphs while keeping the
 * ones that hold English words apart. Stripping all whitespace turns
 * "Japan as No.1" into "JapanasNo.1"; keeping all of it leaves kana strung out
 * one character per space.
 */
function squeezeSpaces(text: string): string {
  return text
    .replace(new RegExp(`(${JP_CHAR})[ \t]+(?=${JP_CHAR})`, 'g'), '$1')
    .replace(new RegExp(`(${JP_CHAR})[ \t]+(?=[A-Za-z0-9])`, 'g'), '$1')
    .replace(new RegExp(`([A-Za-z0-9])[ \t]+(?=${JP_CHAR})`, 'g'), '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * A block often starts with whatever furniture sat above it on the page: a
 * folio number, or a squashed English caption. Both are recognisable because
 * they sit immediately before the first Japanese character.
 */
function trimLeadingFurniture(text: string): string {
  return text
    .replace(new RegExp(`^[0-9０-９]{1,3}(?=${JP_CHAR}|[「『])`), '')
    .replace(new RegExp(`^[A-Za-z][A-Za-z.0-9]{5,}(?=${JP_CHAR}|[「『])`), '')
    .trim();
}

function isProse(text: string): boolean {
  if (text.length < 30) return false;
  if (DOT_LEADER.test(text)) return false;
  if (!/[。]/.test(text)) return false;
  if (japaneseRatio(text) < 0.7) return false;
  // A "paragraph" that is mostly digits is a table row that lost its grid.
  if ((text.match(/[0-9０-９]/g)?.length ?? 0) / text.length > 0.2) return false;
  // Runs of single characters separated by spaces are letter-spaced headings.
  if (/(?:\S {1,2}){6,}/.test(text)) return false;
  return true;
}

/**
 * Split on full stops, then regroup into paragraphs of a few sentences. PDF
 * extraction has already lost the real paragraph breaks, so rebuilding them at
 * a fixed size beats pretending the line breaks meant something.
 */
function toParagraphs(text: string, perParagraph = 3): string[] {
  const sentences = text.split(/(?<=。)/).map((s) => s.trim()).filter((s) => s !== '');
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += perParagraph) {
    out.push(sentences.slice(i, i + perParagraph).join(''));
  }
  return out;
}

async function main(): Promise<void> {
  // Node build: no worker, no DOM.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const bytes = new Uint8Array(await readFile(IN));

  const task = pdfjs.getDocument({ data: bytes, useSystemFonts: false });
  const doc = await task.promise;

  const seen = new Map<string, number>();
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let line = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = '';
      }
    }
    if (line !== '') lines.push(line);

    for (const block of joinPdfLines(lines).split('\n')) {
      const text = trimLeadingFurniture(squeezeSpaces(normaliseWhitespace(block)));
      if (text === '') continue;
      seen.set(text, (seen.get(text) ?? 0) + 1);
      pages.push(text);
    }
  }
  await task.destroy();

  // Anything printed on three or more pages is running furniture, not prose.
  const kept = pages.filter((text) => (seen.get(text) ?? 0) < 3 && isProse(text));
  const unique = [...new Set(kept)];
  const paragraphs = unique.flatMap((text) => toParagraphs(text));

  const chars = paragraphs.reduce((n, p) => n + p.length, 0);
  const doc_: SourceDocJson = {
    id: 'toyota-integrated-report-2025',
    title: 'トヨタ自動車 統合報告書 2025',
    origin: 'src/data/default-source.pdf (cropped to prose by scripts/crop-pdf.ts)',
    fetchedAt: new Date().toISOString(),
    paragraphs,
  };

  await writeFile(OUT, JSON.stringify(doc_, null, 2) + '\n', 'utf8');
  console.log(
    `crop-pdf: ${doc.numPages} pages -> ${pages.length} blocks -> ${paragraphs.length} paragraphs, ${chars} chars`,
  );
}

await main();
