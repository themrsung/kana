/**
 * Japanese -> US-neutral English pronunciation respelling.
 *
 * Output is hyphenated one chunk per syllable, which is what English
 * respelling keys do (`toh-yoh-tah`) and which also happens to make ん and っ
 * legible: ん closes its chunk as `n`, っ doubles the next chunk's opening
 * consonant across the hyphen, exactly where an English reader expects a
 * held stop.
 *
 *   とよた       -> toh-yoh-tah
 *   がっこう     -> gahk-kohh
 *   せんせい     -> sehn-seh-ee
 *
 * Vowel length is the one thing English orthography cannot express, and
 * length is phonemic in Japanese (おじさん / おじいさん). Rather than drop it,
 * long vowels double the vowel letter inside the digraph: ah/aah, oh/ohh,
 * eh/ehh, ee/eee, oo/ooo. `eee` and `ooo` do look odd; the alternative was
 * silently merging a contrast that changes the word, which seemed worse.
 *
 * Japanese ら行 is a flap, closest to the American tt in "butter" - no English
 * spelling produces it, so `r` is used and the README explains it.
 */

import type { Mora, Onset, Vowel } from './mora';
import { decompose } from './mora';

const SHORT: Readonly<Record<Vowel, string>> = {
  a: 'ah', i: 'ee', u: 'oo', e: 'eh', o: 'oh',
};

const LONG: Readonly<Record<Vowel, string>> = {
  a: 'aah', i: 'eee', u: 'ooo', e: 'ehh', o: 'ohh',
};

const ONSETS: Readonly<Record<Onset, string>> = {
  '': '', 'k': 'k', 'g': 'g', 's': 's', 'sh': 'sh', 'z': 'z', 'j': 'j',
  't': 't', 'ch': 'ch', 'ts': 'ts', 'd': 'd', 'n': 'n', 'h': 'h', 'f': 'f',
  'b': 'b', 'p': 'p', 'm': 'm', 'y': 'y', 'r': 'r', 'w': 'w', 'v': 'v',
};

/**
 * The consonant that closes the *previous* chunk when っ is present.
 * English spells a held affricate as `tch` (match, kitchen), so ch takes t.
 */
function codaFor(onset: Onset): string {
  if (onset === 'ch') return 't';
  if (onset === 'sh') return 's';
  if (onset === 'ts') return 't';
  if (onset === '') return '';
  return onset;
}

export function toEnglish(reading: string): string {
  return renderEnglish(decompose(reading));
}

export function renderEnglish(list: readonly Mora[]): string {
  const chunks: string[] = [];

  for (const mora of list) {
    if (mora.kind === 'literal') { chunks.push(mora.kana); continue; }
    if (mora.kind === 'standalone') { chunks.push(mora.sound === 'n' ? 'n' : ''); continue; }

    const onset = ONSETS[mora.onset];

    // っ closes the previous chunk rather than opening this one.
    if (mora.geminate) {
      const coda = codaFor(mora.onset);
      if (chunks.length > 0 && coda !== '') chunks[chunks.length - 1] += coda;
    }

    const glide = mora.glide ? 'y' : '';
    const vowel = mora.long ? LONG[mora.vowel] : SHORT[mora.vowel];

    chunks.push(onset + glide + vowel + (mora.coda ? 'n' : ''));
  }

  return chunks.filter((c) => c !== '').join('-');
}
