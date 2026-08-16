/**
 * Getting text into the app: a dropped file, a picked file, or a paste.
 *
 * Thin on purpose. The interesting work is in `extract` (format stripping) and
 * `decode` (encoding guessing); this only names the result and reports what it
 * had to guess, because a user who dropped a Shift_JIS file and got mojibake
 * deserves to be told which encoding was tried rather than left wondering.
 */

import { extractFile, normaliseWhitespace, type Extracted } from './extract';
import { splitParagraphs } from './segment';
import type { SourceDoc } from './source';

export interface Ingested extends Extracted {
  readonly title: string;
  /** Set when the text was read as something other than plain UTF-8. */
  readonly notice: string | null;
}

const ENCODING_LABEL: Readonly<Record<string, string>> = {
  'shift_jis': 'Shift_JIS',
  'euc-jp': 'EUC-JP',
  'utf-16le': 'UTF-16LE',
  'utf-16be': 'UTF-16BE',
};

export async function ingestFile(file: File): Promise<Ingested> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extracted = await extractFile(file.name, bytes);
  const label = extracted.encoding ? ENCODING_LABEL[extracted.encoding] : undefined;
  return {
    ...extracted,
    title: file.name,
    notice: label ? `Decoded as ${label}, not UTF-8.` : null,
  };
}

export function ingestPaste(text: string): Ingested {
  return {
    text: normaliseWhitespace(text),
    kind: 'txt',
    encoding: 'utf-8',
    title: 'ペースト',
    notice: null,
  };
}

/** Wrap ingested text as a document the rest of the app can hold. */
export function toDocument(ingested: Ingested): SourceDoc {
  return {
    id: `local:${ingested.title}`,
    title: ingested.title,
    origin: `${ingested.kind.toUpperCase()} · ${ingested.encoding ?? 'binary'}`,
    fetchedAt: new Date().toISOString(),
    paragraphs: splitParagraphs(ingested.text),
    isFallback: false,
  };
}
