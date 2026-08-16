/**
 * Text -> paragraphs -> sentences -> typing tokens.
 *
 * kuromoji segments *morphemes*, and a morpheme is not always a unit anyone
 * would type as one breath. `4兆7,955億円` comes back as seven morphemes, three
 * of which are bare digits and one of which is a comma. The rules below glue
 * those back together - and nothing else. Everything kuromoji splits for real
 * grammatical reasons (上場 / し / て / いる) is left split, because typing a
 * long text one morpheme at a time is the whole point of the app.
 *
 * The merge rules are pure functions over morphemes, so they are tested with
 * hand-written fixtures and never need the dictionary.
 */

import type { Token } from '../session';
import type { Morpheme, Tokenize } from './tokenizer';

export interface Sentence {
  readonly text: string;
  readonly tokens: readonly Token[];
}

export interface Paragraph {
  readonly text: string;
  readonly sentences: readonly Sentence[];
}

export interface Segmented {
  readonly paragraphs: readonly Paragraph[];
  /** Every token in reading order - what a session is built from. */
  readonly tokens: readonly Token[];
}

/** A blank line starts a new paragraph; a lone newline does not. */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s*\n\s*/g, '').trim())
    .filter((p) => p !== '');
}

/**
 * Sentence-final punctuation ends a sentence, and any closing bracket or quote
 * that trails it belongs to the sentence it closes.
 */
const SENTENCE_END = /[。．！？!?…]+[」』）］】〉》”"’'\)\]]*/g;

export function splitSentences(paragraph: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (const m of paragraph.matchAll(SENTENCE_END)) {
    const end = m.index + m[0].length;
    const piece = paragraph.slice(start, end).trim();
    if (piece !== '') out.push(piece);
    start = end;
  }
  const rest = paragraph.slice(start).trim();
  if (rest !== '') out.push(rest);
  return out;
}

/** Katakana reading, falling back to the surface for digits, latin, symbols. */
function readingOf(m: Morpheme): string {
  const reading = m.reading;
  return reading === undefined || reading === '' || reading === '*' ? m.surface_form : reading;
}

const NUMERIC_SEPARATOR = new Set([',', '，', '.', '．', '・']);

function isNumber(m: Morpheme | undefined): boolean {
  return m !== undefined && m.pos === '名詞' && m.pos_detail_1 === '数';
}

function isPunctuation(m: Morpheme): boolean {
  return m.pos === '記号' && m.pos_detail_1 !== 'アルファベット';
}

/**
 * Is the token built so far a number? Not just its last morpheme: in 4兆7,955億
 * the counters sit *inside* the figure, so `7` has to look past 兆 to see that
 * it is continuing a number rather than starting one.
 */
function isNumberSoFar(chunk: readonly Morpheme[]): boolean {
  if (!isNumber(chunk[0])) return false;
  return chunk.every(
    (part) =>
      isNumber(part) || part.pos_detail_1 === '接尾' || NUMERIC_SEPARATOR.has(part.surface_form),
  );
}

/**
 * Should this morpheme be glued onto the token being built?
 *
 * `chunk` is every morpheme already in that token, never empty. `next` is
 * needed for one case only: a comma or period is part of a number when a
 * number stands on both sides of it, and is punctuation otherwise.
 */
export function joinsLeft(
  chunk: readonly Morpheme[],
  cur: Morpheme,
  next: Morpheme | undefined,
): boolean {
  const prev = chunk[chunk.length - 1];
  if (prev === undefined) return false;

  // 4 兆 7 , 955 億 -> one number. The comma of 7,955 is punctuation by part of
  // speech, so this has to run before the guard below or the figure splits
  // right after the separator it just absorbed.
  if (isNumber(cur) && isNumberSoFar(chunk)) return true;

  if (isPunctuation(prev)) return false;

  if (NUMERIC_SEPARATOR.has(cur.surface_form) && isNumberSoFar(chunk) && isNumber(next)) return true;

  // Counters and noun suffixes: 取引 + 所, 2025 + 年度, 億 + 円, 田中 + さん.
  if (cur.pos_detail_1 === '接尾') return true;

  // Prefixes bind rightwards: ご + 案内, 約 + 3000.
  if (prev.pos === '接頭詞') return true;

  return false;
}

/**
 * Morphemes -> typing tokens. Punctuation survives as its own token: it is a
 * real keystroke and skipping it would teach the wrong rhythm.
 */
export function toTokens(morphemes: readonly Morpheme[]): Token[] {
  const out: Token[] = [];
  let chunk: Morpheme[] = [];

  const flush = (): void => {
    if (chunk.length === 0) return;
    out.push({
      surface: chunk.map((part) => part.surface_form).join(''),
      reading: chunk.map(readingOf).join(''),
    });
    chunk = [];
  };

  for (let i = 0; i < morphemes.length; i++) {
    const cur = morphemes[i]!;
    if (cur.surface_form.trim() === '') continue; // stray spaces are not tokens
    if (!joinsLeft(chunk, cur, morphemes[i + 1])) flush();
    chunk.push(cur);
  }
  flush();
  return out;
}

/** Full pipeline. `tokenize` is injected so this stays testable. */
export function segment(text: string, tokenize: Tokenize): Segmented {
  const paragraphs: Paragraph[] = [];
  const all: Token[] = [];

  for (const body of splitParagraphs(text)) {
    const sentences: Sentence[] = [];
    for (const sentence of splitSentences(body)) {
      const tokens = toTokens(tokenize(sentence));
      if (tokens.length === 0) continue;
      sentences.push({ text: sentence, tokens });
      all.push(...tokens);
    }
    if (sentences.length > 0) paragraphs.push({ text: body, sentences });
  }

  return { paragraphs, tokens: all };
}

/** Sentences in reading order, flattened out of the paragraph structure. */
export function sentencesOf(segmented: Segmented): Sentence[] {
  return segmented.paragraphs.flatMap((p) => p.sentences);
}

/** Token offset where a paragraph begins - what the "start here" picker needs. */
export function paragraphTokenOffset(segmented: Segmented, paragraphIndex: number): number {
  let offset = 0;
  for (let i = 0; i < paragraphIndex && i < segmented.paragraphs.length; i++) {
    for (const sentence of segmented.paragraphs[i]!.sentences) offset += sentence.tokens.length;
  }
  return offset;
}

/**
 * A practice-sized slice. Sentences are kept whole - a session that starts
 * mid-sentence reads as broken Japanese - so the count is a floor, not an
 * exact length, and one very long sentence can overshoot it.
 */
export function takeTokens(segmented: Segmented, from: number, count: number): Token[] {
  const out: Token[] = [];
  let seen = 0;
  for (const sentence of sentencesOf(segmented)) {
    const end = seen + sentence.tokens.length;
    if (end > from && seen < from + count) out.push(...sentence.tokens);
    seen = end;
    if (seen >= from + count && out.length > 0) break;
  }
  return out;
}
