/**
 * Japanese -> Spanish (Spain) pronunciation respelling.
 *
 * The goal is not transliteration: it is that a Spaniard reading the output
 * with ordinary Spanish spelling rules lands as close to the Japanese as the
 * orthography allows. That premise decides every awkward case, and Spanish
 * happens to win several of them outright:
 *
 *   - vowels a i u e o are a near-exact match, the best of the three schemes
 *   - にゃ にゅ にょ -> ña ñu ño, since ñ *is* [ɲ]
 *   - ちゃ -> cha, because Spanish ch is already [tʃ]
 *   - ら行 intervocalically: single r is a flap, exactly like Japanese
 *   - が行 needs gue/gui before front vowels to stay [g], so ぎ is `gui`,
 *     not `gi` (which Spanish reads [xi])
 *   - the glide is written `i`, not `y`: きょ is `kio` [kjo]. Spanish y is
 *     [ʝ], so `kyo` would come out [kʝo].
 *   - わ is `ua`, the native Spanish spelling for [wa] (agua, cuando, and
 *     Uagadugú word-initially). Loan-spelling `wa` invites [gwa] or [ba].
 *
 * Three approximations are unavoidable and are surfaced in the README:
 *
 *   - は行 -> j. Spanish h is silent, so `ha` would produce nothing at all.
 *     j is [x], harsher than Japanese [h], but present beats absent.
 *   - ざ行 -> s. Spanish has no /z/, and Castilian z is [θ] - a different
 *     place of articulation, and worse than simply losing the voicing.
 *     さ and ざ therefore merge here. This is the one real information loss.
 *   - word-initial ら. Spanish initial r is trilled [r] and there is no way
 *     to spell a word-initial flap in Spanish at all.
 */

import type { Mora, Onset, Vowel } from './mora';
import { decompose } from './mora';

const VOWELS: Readonly<Record<Vowel, string>> = {
  a: 'a', i: 'i', u: 'u', e: 'e', o: 'o',
};

/**
 * Onset spellings, by the vowel that follows, because Spanish orthography is
 * position-sensitive in exactly the places Japanese needs.
 */
const ONSETS: Readonly<Record<Onset, (vowel: Vowel, glide: boolean) => string>> = {
  '':   () => '',
  'k':  () => 'k',                                     // k is unambiguous in loans
  'g':  (v, glide) => (v === 'e' || v === 'i' || glide ? 'gu' : 'g'),
  's':  () => 's',
  'sh': () => 'sh',
  'z':  () => 's',                                     // merged: see header
  'j':  () => 'y',                                     // じゃ -> ya, [ʝ] ~ [dʑ]
  't':  () => 't',
  'ch': () => 'ch',
  'ts': () => 'ts',
  'd':  () => 'd',
  'n':  (_v, glide) => (glide ? 'ñ' : 'n'),            // にゃ -> ña
  'h':  () => 'j',                                     // approximated: see header
  'f':  () => 'f',
  'b':  () => 'b',
  'p':  () => 'p',
  'm':  () => 'm',
  'y':  () => 'y',
  'r':  () => 'r',
  'w':  () => 'u',                                     // agua, cuando - see header
  'v':  () => 'v',
};

/** ñ already carries the palatal, so it must not also take a glide vowel. */
const ABSORBS_GLIDE: ReadonlySet<Onset> = new Set<Onset>(['n']);

/** Doubling for っ. Spanish cannot hold a stop, so the letter is just doubled. */
function geminateOf(spelling: string): string {
  if (spelling === 'ch') return 'c';   // -cch- reads closer than -chch-
  if (spelling === 'sh') return 's';
  if (spelling === 'ts') return 't';
  if (spelling === 'gu') return 'g';
  return spelling.slice(0, 1);
}

export function toSpanish(reading: string): string {
  return renderSpanish(decompose(reading));
}

export function renderSpanish(list: readonly Mora[]): string {
  const out: string[] = [];

  for (const mora of list) {
    if (mora.kind === 'literal') { out.push(mora.kana); continue; }
    if (mora.kind === 'standalone') { out.push(mora.sound === 'n' ? 'n' : ''); continue; }

    const onset = ONSETS[mora.onset](mora.vowel, mora.glide);
    if (mora.geminate && onset !== '') out.push(geminateOf(onset));

    const glide = mora.glide && !ABSORBS_GLIDE.has(mora.onset) ? 'i' : '';
    const vowel = VOWELS[mora.vowel];

    out.push(onset + glide + vowel + (mora.long ? vowel : ''));
    if (mora.coda) out.push('n');
  }

  return out.join('');
}
