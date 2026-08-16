/**
 * Japanese -> hangul, following 국립국어원 외래어 표기법 (일본어).
 *
 * The three rules that actually shape the output:
 *
 *   제1항  촉음 っ is always written as a ㅅ 받침.        がっこう -> 갓코
 *   제2항  장모음 is not written at all.                 とうきょう -> 도쿄
 *   제3항  か行 and た行 are 평음 (ㄱ/ㄷ) word-initially
 *          and 격음 (ㅋ/ㅌ) elsewhere.                    かたかな -> 가타카나
 *
 * The word-initial rule is why this module needs whole words rather than
 * single morae, and why the segmenter's token boundaries matter: 「たかた」
 * as one word is 다카타, but as two words it is 다타 + 가타.
 *
 * Palatalised syllables are derived by shifting the hangul medial rather than
 * carried in a second table (ㅏ->ㅑ, ㅜ->ㅠ, ㅗ->ㅛ), which is exactly the
 * relationship 갸/규/교 have to 가/구/고.
 */

import type { Mora, Onset, Vowel } from './mora';
import { decompose } from './mora';

const BASE = 0xac00;
const MEDIALS = 21;
const FINALS = 28;

const FINAL_N = 4;   // ㄴ
const FINAL_S = 19;  // ㅅ

/** Medial index -> its y-glide counterpart. ㅣ has none and stays put. */
const GLIDE_MEDIAL: Readonly<Record<number, number>> = {
  0: 2,   // ㅏ -> ㅑ
  5: 7,   // ㅔ -> ㅖ
  8: 12,  // ㅗ -> ㅛ
  13: 17, // ㅜ -> ㅠ
  20: 20, // ㅣ -> ㅣ
};

type Row = Readonly<Record<Vowel, string>>;

/** Onsets whose row is unconditional. */
const ROWS: Readonly<Record<Exclude<Onset, 'k' | 't' | 'ch'>, Row>> = {
  '':   { a: '아', i: '이', u: '우', e: '에', o: '오' },
  'g':  { a: '가', i: '기', u: '구', e: '게', o: '고' },
  's':  { a: '사', i: '시', u: '스', e: '세', o: '소' },
  'sh': { a: '샤', i: '시', u: '슈', e: '셰', o: '쇼' },
  'z':  { a: '자', i: '지', u: '즈', e: '제', o: '조' },
  'j':  { a: '자', i: '지', u: '주', e: '제', o: '조' },
  'd':  { a: '다', i: '디', u: '두', e: '데', o: '도' },
  'n':  { a: '나', i: '니', u: '누', e: '네', o: '노' },
  'h':  { a: '하', i: '히', u: '후', e: '헤', o: '호' },
  'b':  { a: '바', i: '비', u: '부', e: '베', o: '보' },
  'p':  { a: '파', i: '피', u: '푸', e: '페', o: '포' },
  'm':  { a: '마', i: '미', u: '무', e: '메', o: '모' },
  'y':  { a: '야', i: '이', u: '유', e: '예', o: '요' },
  'r':  { a: '라', i: '리', u: '루', e: '레', o: '로' },
  'w':  { a: '와', i: '위', u: '우', e: '웨', o: '워' },
  // Beyond the standard, which has no rows for these. ふ is 후 by the table,
  // so the ふぁ series follows it to 화/휘/훼/훠 rather than borrowing ㅍ.
  'f':  { a: '화', i: '휘', u: '후', e: '훼', o: '훠' },
  'ts': { a: '차', i: '치', u: '쓰', e: '체', o: '초' },
  'v':  { a: '바', i: '비', u: '부', e: '베', o: '보' },
};

/** か行 and た行: 평음 word-initially, 격음 elsewhere. ち/つ keep their own forms. */
const INITIAL: Readonly<Record<'k' | 't' | 'ch', Row>> = {
  'k':  { a: '가', i: '기', u: '구', e: '게', o: '고' },
  't':  { a: '다', i: '디', u: '두', e: '데', o: '도' },
  'ch': { a: '자', i: '지', u: '주', e: '제', o: '조' },
};

const MEDIAL: Readonly<Record<'k' | 't' | 'ch', Row>> = {
  'k':  { a: '카', i: '키', u: '쿠', e: '케', o: '코' },
  't':  { a: '타', i: '티', u: '투', e: '테', o: '토' },
  'ch': { a: '차', i: '치', u: '추', e: '체', o: '초' },
};

function isPositional(onset: Onset): onset is 'k' | 't' | 'ch' {
  return onset === 'k' || onset === 't' || onset === 'ch';
}

function syllableFor(onset: Onset, vowel: Vowel, wordInitial: boolean): string {
  if (isPositional(onset)) return (wordInitial ? INITIAL : MEDIAL)[onset][vowel];
  return ROWS[onset][vowel];
}

/** Apply a y-glide by shifting the medial: 기 -> 갸 for きゃ. */
function palatalise(syllable: string): string {
  const index = syllable.codePointAt(0)! - BASE;
  const lead = Math.floor(index / (MEDIALS * FINALS));
  const medial = Math.floor((index % (MEDIALS * FINALS)) / FINALS);
  const shifted = GLIDE_MEDIAL[medial];
  if (shifted === undefined) return syllable;
  return String.fromCodePoint(BASE + (lead * MEDIALS + shifted) * FINALS);
}

/** Attach a 받침. Silently declines if the block already carries one. */
function withFinal(syllable: string, final: number): string {
  const index = syllable.codePointAt(0)! - BASE;
  if (index < 0 || index >= 11172 || index % FINALS !== 0) return syllable;
  return String.fromCodePoint(BASE + index + final);
}

export function toHangul(reading: string): string {
  return renderHangul(decompose(reading));
}

export function renderHangul(list: readonly Mora[]): string {
  const out: string[] = [];
  // Resets on every literal, so 「トヨタ・自動車」 treats both halves as words.
  let wordInitial = true;

  for (const mora of list) {
    if (mora.kind === 'literal') {
      out.push(mora.kana);
      wordInitial = true;
      continue;
    }

    if (mora.kind === 'standalone') {
      out.push(mora.sound === 'n' ? '응' : '쓰');
      wordInitial = false;
      continue;
    }

    let block = syllableFor(mora.onset, mora.vowel, wordInitial);
    if (mora.glide) block = palatalise(block);

    // 제1항: っ becomes a ㅅ 받침 on the *previous* block.
    if (mora.geminate) {
      const prev = out.pop();
      if (prev !== undefined) out.push(withFinal(prev, FINAL_S));
    }

    // 제3항: 장모음 is simply not written, so `long` contributes nothing.
    if (mora.coda) block = withFinal(block, FINAL_N);

    out.push(block);
    wordInitial = false;
  }

  return out.join('');
}
