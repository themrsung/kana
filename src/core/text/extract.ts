/**
 * File -> plain Japanese prose.
 *
 * Every branch here is a *strip*, not a parse. The goal is not to understand
 * markdown or HTML, it is to throw away everything that is not prose so the
 * segmenter never has to type a `<div>` or a `|---|`. When in doubt the rule is
 * "drop it": a dropped line costs the user nothing, a kept line of markup costs
 * them a whole token of nonsense.
 */

import { decodeBytes, type Encoding } from './decode';

export interface Extracted {
  readonly text: string;
  readonly kind: 'txt' | 'md' | 'html' | 'json' | 'pdf';
  /** Null for PDF, which is decoded by the PDF reader rather than by us. */
  readonly encoding: Encoding | null;
}

/** Everything this app knows how to open. */
export const ACCEPTED = '.txt,.md,.markdown,.json,.html,.htm,.pdf,text/plain,application/pdf';

function kindOf(name: string): Extracted['kind'] {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'html' || ext === 'htm' || ext === 'xhtml') return 'html';
  if (ext === 'json') return 'json';
  if (ext === 'pdf') return 'pdf';
  return 'txt';
}

export async function extractFile(name: string, bytes: Uint8Array): Promise<Extracted> {
  const kind = kindOf(name);
  if (kind === 'pdf') return { text: await fromPdf(bytes), kind, encoding: null };

  const { text, encoding } = decodeBytes(bytes);
  if (kind === 'md') return { text: fromMarkdown(text), kind, encoding };
  if (kind === 'html') return { text: fromHtml(text), kind, encoding };
  if (kind === 'json') return { text: fromJson(text), kind, encoding };
  return { text: normaliseWhitespace(text), kind, encoding };
}

/**
 * Collapse the whitespace a typist should never have to reproduce, while
 * keeping the paragraph breaks the segmenter needs.
 */
export function normaliseWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u3000]/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Markdown -> prose. Fenced code goes first, because everything inside a fence
 * must survive none of the later rules.
 */
export function fromMarkdown(md: string): string {
  const text = md
    .replace(/\r\n?/g, '\n')
    .replace(/^---\n[\s\S]*?\n---\n/, '') // YAML front matter
    .replace(/```[\s\S]*?```/g, '\n')
    .replace(/~~~[\s\S]*?~~~/g, '\n')
    .replace(/^ {4,}\S.*$/gm, '') // indented code blocks
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images carry no prose
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links keep their label
    .replace(/^\s*>+\s?/gm, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^\s*([-*_])\s*(\1\s*){2,}$/gm, '') // horizontal rules
    .replace(/^\s*\|.*\|\s*$/gm, '') // tables are data, not prose
    .replace(/\*\*|__|\*|_|~~/g, '')
    .replace(/<[^>]+>/g, '');
  return normaliseWhitespace(text);
}

/** Tags that hold text nobody wants to type. */
const HTML_DROP = /<(script|style|noscript|svg|head|template)\b[^>]*>[\s\S]*?<\/\1>/gi;
/** Tags that mean "paragraph break" when they open or close. */
const HTML_BREAK = /<\/?(p|div|br|li|tr|h[1-6]|section|article|blockquote|pre|table)\b[^>]*>/gi;

export function fromHtml(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(HTML_DROP, '')
    .replace(HTML_BREAK, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n[ \t]+/g, '\n');
  return normaliseWhitespace(decodeEntities(text));
}

const NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

/**
 * JSON -> prose. Values only: keys are field names, not sentences. Strings that
 * carry no Japanese at all are dropped, which is what removes the ids, dates,
 * URLs and enum values that make up most of a typical document dump.
 */
export function fromJson(json: string): string {
  let root: unknown;
  try {
    root = JSON.parse(json);
  } catch {
    return normaliseWhitespace(json);
  }
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      if (hasJapanese(node)) out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === 'object') {
      for (const value of Object.values(node)) walk(value);
    }
  };
  walk(root);
  return normaliseWhitespace(out.join('\n\n'));
}

/** Kana or kanji anywhere in the string. */
export function hasJapanese(text: string): boolean {
  return /[぀-ヿ㐀-鿿]/.test(text);
}

/**
 * PDF -> prose, by way of pdf.js. Imported lazily: it is the single largest
 * dependency in the app and most sessions never open a PDF.
 */
async function fromPdf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  // pdf.js takes ownership of the buffer, so hand it a copy.
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    const lines: string[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = '';
      }
    }
    if (line) lines.push(line);
    pages.push(joinPdfLines(lines));
  }
  await task.destroy();
  return normaliseWhitespace(pages.join('\n\n'));
}

/**
 * PDF text comes out one visual line at a time, so a sentence that wrapped
 * arrives pre-broken. Japanese does not use spaces, so the lines can simply be
 * concatenated - except where a line ends on sentence-final punctuation, which
 * is a real break.
 */
export function joinPdfLines(lines: readonly string[]): string {
  const out: string[] = [];
  let buf = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      if (buf) out.push(buf);
      buf = '';
      continue;
    }
    buf += buf && needsSpace(buf, line) ? ' ' : '';
    buf += line;
    if (/[。．！？!?]$/.test(line)) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf) out.push(buf);
  return out.join('\n');
}

/** Latin words that wrapped need their space back; Japanese never does. */
function needsSpace(left: string, right: string): boolean {
  return /[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right);
}
