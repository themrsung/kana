/**
 * Hiragana -> phonetic morae.
 *
 * Every respelling scheme in this app reads from this one decomposition, so the
 * schemes stay small tables and stay comparable with each other.
 *
 * The onsets here are **phonetic**, not phonemic: し is `sh`, not `s`; ち is
 * `ch`; つ is `ts`; ふ is `f`; じ is `j`. That costs a few extra rows but it
 * means no scheme has to re-derive Japanese allophony for itself, and it lets
 * てぃ (`t` + `i`) stay distinct from ち (`ch` + `i`) - a contrast that a
 * phonemic /t/ + /i/ analysis throws away.
 *
 * Length, gemination and moraic n are folded into the syllable that carries
 * them rather than left as separate list entries. They are still separate
 * morae for counting - `moras()` reports the real count - but every scheme
 * wants them attached, so attaching them once here beats doing it three times.
 */

export type Vowel = 'a' | 'i' | 'u' | 'e' | 'o';

export type Onset =
  | '' | 'k' | 'g' | 's' | 'sh' | 'z' | 'j' | 't' | 'ch' | 'ts' | 'd'
  | 'n' | 'h' | 'f' | 'b' | 'p' | 'm' | 'y' | 'r' | 'w' | 'v';

export interface Syllable {
  readonly kind: 'syllable';
  /** The source kana that produced it, including っ / ん / ー that folded in. */
  readonly kana: string;
  readonly onset: Onset;
  readonly vowel: Vowel;
  /** Palatalised: きゃ is `k` + `a` + glide, distinct from か. */
  readonly glide: boolean;
  /** Preceded by っ. */
  readonly geminate: boolean;
  /** Vowel lengthened by a following ー or lengthening vowel kana. */
  readonly long: boolean;
  /** Followed by ん. */
  readonly coda: boolean;
}

/** Anything with no Japanese phonology to respell: punctuation, digits, latin. */
export interface Literal {
  readonly kind: 'literal';
  readonly kana: string;
}

/** A moraic ん or っ with nothing to attach to (word-initial, or after a literal). */
export interface Standalone {
  readonly kind: 'standalone';
  readonly kana: string;
  readonly sound: 'n' | 'q';
}

export type Mora = Syllable | Literal | Standalone;

const SMALL_VOWEL: Readonly<Record<string, Vowel>> = {
  'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o',
};

const YOON: Readonly<Record<string, Vowel>> = { 'ゃ': 'a', 'ゅ': 'u', 'ょ': 'o' };

/** Base kana -> (onset, vowel). Everything else is derived. */
const KANA: Readonly<Record<string, readonly [Onset, Vowel]>> = {
  'あ': ['', 'a'], 'い': ['', 'i'], 'う': ['', 'u'], 'え': ['', 'e'], 'お': ['', 'o'],
  'か': ['k', 'a'], 'き': ['k', 'i'], 'く': ['k', 'u'], 'け': ['k', 'e'], 'こ': ['k', 'o'],
  'が': ['g', 'a'], 'ぎ': ['g', 'i'], 'ぐ': ['g', 'u'], 'げ': ['g', 'e'], 'ご': ['g', 'o'],
  'さ': ['s', 'a'], 'し': ['sh', 'i'], 'す': ['s', 'u'], 'せ': ['s', 'e'], 'そ': ['s', 'o'],
  'ざ': ['z', 'a'], 'じ': ['j', 'i'], 'ず': ['z', 'u'], 'ぜ': ['z', 'e'], 'ぞ': ['z', 'o'],
  'た': ['t', 'a'], 'ち': ['ch', 'i'], 'つ': ['ts', 'u'], 'て': ['t', 'e'], 'と': ['t', 'o'],
  // ぢ / づ merged into じ / ず: they are homophones in standard Japanese.
  'だ': ['d', 'a'], 'ぢ': ['j', 'i'], 'づ': ['z', 'u'], 'で': ['d', 'e'], 'ど': ['d', 'o'],
  'な': ['n', 'a'], 'に': ['n', 'i'], 'ぬ': ['n', 'u'], 'ね': ['n', 'e'], 'の': ['n', 'o'],
  'は': ['h', 'a'], 'ひ': ['h', 'i'], 'ふ': ['f', 'u'], 'へ': ['h', 'e'], 'ほ': ['h', 'o'],
  'ば': ['b', 'a'], 'び': ['b', 'i'], 'ぶ': ['b', 'u'], 'べ': ['b', 'e'], 'ぼ': ['b', 'o'],
  'ぱ': ['p', 'a'], 'ぴ': ['p', 'i'], 'ぷ': ['p', 'u'], 'ぺ': ['p', 'e'], 'ぽ': ['p', 'o'],
  'ま': ['m', 'a'], 'み': ['m', 'i'], 'む': ['m', 'u'], 'め': ['m', 'e'], 'も': ['m', 'o'],
  'や': ['y', 'a'], 'ゆ': ['y', 'u'], 'よ': ['y', 'o'],
  'ら': ['r', 'a'], 'り': ['r', 'i'], 'る': ['r', 'u'], 'れ': ['r', 'e'], 'ろ': ['r', 'o'],
  // を is [o] in modern speech; ゐ / ゑ likewise lost their glide.
  'わ': ['w', 'a'], 'を': ['', 'o'], 'ゐ': ['', 'i'], 'ゑ': ['', 'e'],
  'ゔ': ['v', 'u'],
  // Small vowels standing alone (no base to attach to).
  'ぁ': ['', 'a'], 'ぃ': ['', 'i'], 'ぅ': ['', 'u'], 'ぇ': ['', 'e'], 'ぉ': ['', 'o'],
  'ゃ': ['y', 'a'], 'ゅ': ['y', 'u'], 'ょ': ['y', 'o'], 'ゎ': ['w', 'a'],
};

/**
 * base + small vowel clusters, for the foreign sounds that modern Japanese
 * genuinely uses. Anything not listed here simply does not merge, and the
 * small vowel becomes its own bare-vowel mora.
 */
const CLUSTER: Readonly<Record<string, readonly [Onset, Vowel]>> = {
  'ふぁ': ['f', 'a'], 'ふぃ': ['f', 'i'], 'ふぇ': ['f', 'e'], 'ふぉ': ['f', 'o'],
  'ゔぁ': ['v', 'a'], 'ゔぃ': ['v', 'i'], 'ゔぇ': ['v', 'e'], 'ゔぉ': ['v', 'o'],
  'うぃ': ['w', 'i'], 'うぇ': ['w', 'e'], 'うぉ': ['w', 'o'],
  'つぁ': ['ts', 'a'], 'つぃ': ['ts', 'i'], 'つぇ': ['ts', 'e'], 'つぉ': ['ts', 'o'],
  'しぇ': ['sh', 'e'], 'ちぇ': ['ch', 'e'], 'じぇ': ['j', 'e'],
  'てぃ': ['t', 'i'], 'でぃ': ['d', 'i'], 'とぅ': ['t', 'u'], 'どぅ': ['d', 'u'],
  'ずぃ': ['z', 'i'], 'すぃ': ['s', 'i'],
};

/** Onsets that take a y-glide from ゃゅょ. Everything else drops the small kana. */
const GLIDING: ReadonlySet<Onset> = new Set<Onset>(['k', 'g', 'n', 'h', 'b', 'p', 'm', 'r', 'v']);

/** しゃ ちゃ じゃ: the palatal is already in the onset, so no glide flag. */
const PALATAL: ReadonlySet<Onset> = new Set<Onset>(['sh', 'ch', 'j']);

/** てゅ / でゅ / ふゅ: the small kana changes the vowel and adds a glide. */
const YOON_EXTRA: ReadonlySet<string> = new Set(['て', 'で', 'ふ', 'ゔ']);

const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;

/** Katakana -> hiragana. Readings arrive as katakana; the tables are hiragana. */
export function toHiragana(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    out += code >= KATAKANA_START && code <= KATAKANA_END
      ? String.fromCodePoint(code - 0x60)
      : ch;
  }
  return out;
}

/** Does `next` lengthen a preceding `vowel`, rather than being its own mora? */
function lengthens(vowel: Vowel, next: string): boolean {
  if (next === 'ー') return true;
  if (next === 'う') return vowel === 'u' || vowel === 'o';
  if (next === 'あ') return vowel === 'a';
  if (next === 'い') return vowel === 'i';
  if (next === 'え') return vowel === 'e';
  if (next === 'お') return vowel === 'o';
  return false;
}

/**
 * Note that えい is deliberately *not* long: it is two morae here, spelled out
 * as e + i. Tokyo speech does flatten it to [eː], but every transcription
 * standard this app targets writes both vowels (せんせい -> 센세이 / sensei),
 * so flattening it would put us out of step with all three schemes at once.
 */
export function decompose(input: string): Mora[] {
  const src = toHiragana(input);
  const out: Mora[] = [];
  let pendingGeminate = false;

  for (let i = 0; i < src.length; ) {
    const ch = src[i]!;

    if (ch === 'っ') {
      // Only counts as gemination if a syllable actually follows it.
      if (pendingGeminate) out.push({ kind: 'standalone', kana: 'っ', sound: 'q' });
      pendingGeminate = true;
      i += 1;
      continue;
    }

    if (ch === 'ん') {
      const prev = out[out.length - 1];
      if (prev?.kind === 'syllable' && !prev.coda && !pendingGeminate) {
        out[out.length - 1] = { ...prev, kana: prev.kana + 'ん', coda: true };
      } else {
        out.push({ kind: 'standalone', kana: 'ん', sound: 'n' });
      }
      i += 1;
      continue;
    }

    const pair = src.slice(i, i + 2);
    let onset: Onset;
    let vowel: Vowel;
    let glide = false;
    let width: number;

    const cluster = CLUSTER[pair];
    const base = KANA[ch];

    if (cluster) {
      [onset, vowel] = cluster;
      width = 2;
    } else if (base && src[i + 1] !== undefined && YOON[src[i + 1]!] !== undefined) {
      const [bOnset, bVowel] = base;
      const small = YOON[src[i + 1]!]!;
      if (PALATAL.has(bOnset) && bVowel === 'i') {
        onset = bOnset; vowel = small; width = 2;
      } else if (GLIDING.has(bOnset) && bVowel === 'i') {
        onset = bOnset; vowel = small; glide = true; width = 2;
      } else if (YOON_EXTRA.has(ch)) {
        onset = bOnset; vowel = small; glide = true; width = 2;
      } else {
        // e.g. あゃ - no such syllable; let the small kana stand alone.
        onset = bOnset; vowel = bVowel; width = 1;
      }
    } else if (base && src[i + 1] !== undefined && SMALL_VOWEL[src[i + 1]!] !== undefined) {
      [onset, vowel] = base; width = 1; // unmerged small vowel becomes its own mora
    } else if (base) {
      [onset, vowel] = base; width = 1;
    } else {
      out.push({ kind: 'literal', kana: ch });
      pendingGeminate = false;
      i += 1;
      continue;
    }

    let kana = src.slice(i, i + width);
    i += width;

    let long = false;
    if (src[i] !== undefined && lengthens(vowel, src[i]!)) {
      long = true;
      kana += src[i];
      i += 1;
    }

    out.push({
      kind: 'syllable', kana, onset, vowel, glide,
      geminate: pendingGeminate, long, coda: false,
    });
    pendingGeminate = false;
  }

  if (pendingGeminate) out.push({ kind: 'standalone', kana: 'っ', sound: 'q' });
  return out;
}

/** True mora count - length, gemination and ん each count as one of their own. */
export function moras(list: readonly Mora[]): number {
  let n = 0;
  for (const m of list) {
    n += 1;
    if (m.kind !== 'syllable') continue;
    if (m.long) n += 1;
    if (m.geminate) n += 1;
    if (m.coda) n += 1;
  }
  return n;
}
