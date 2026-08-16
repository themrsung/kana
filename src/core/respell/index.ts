/**
 * Pronunciation respelling schemes.
 *
 * A scheme answers one question: "how do I say this, written in an alphabet I
 * already read?" It is a *hint*, never a typing target - what the user types is
 * always decided by the input engine, so a scheme can approximate freely
 * without ever making the app unfair.
 *
 * Romaji is the odd one out: it reuses the input engine's own shortest
 * spelling rather than a table here, so the hint a romaji-mode typist reads is
 * literally the keystrokes they are about to press.
 */

import { buildRomajiPlan } from '../romaji/matcher';
import { toEnglish } from './english';
import { toHangul } from './hangul';
import { toSpanish } from './spanish';

export type SchemeId = 'romaji' | 'hangul' | 'english' | 'spanish';

export interface Scheme {
  readonly id: SchemeId;
  /** Shown on the picker, in the language of the reader it serves. */
  readonly label: string;
  /** One line, shown under the picker, in that same language. */
  readonly note: string;
  readonly respell: (reading: string) => string;
}

export const SCHEMES: readonly Scheme[] = [
  {
    id: 'romaji',
    label: 'romaji',
    note: 'Hepburn-ish, matching the keys you press.',
    respell: (reading) => buildRomajiPlan(reading).shortest,
  },
  {
    id: 'hangul',
    label: '한글',
    note: '국립국어원 외래어 표기법. 장음은 적지 않고, っ은 ㅅ 받침.',
    respell: toHangul,
  },
  {
    id: 'english',
    label: 'EN',
    note: 'Syllable-by-syllable; doubled vowels are long.',
    respell: toEnglish,
  },
  {
    id: 'spanish',
    label: 'ES',
    note: 'Léelo con reglas españolas. La h japonesa se escribe j.',
    respell: toSpanish,
  },
];

const BY_ID = new Map<SchemeId, Scheme>(SCHEMES.map((s) => [s.id, s]));

export function schemeById(id: SchemeId): Scheme {
  const scheme = BY_ID.get(id);
  if (!scheme) throw new Error(`respell: unknown scheme ${id}`);
  return scheme;
}

export { toEnglish, toHangul, toSpanish };
export { decompose, moras, toHiragana } from './mora';
export type { Mora, Onset, Syllable, Vowel } from './mora';
