/**
 * Google-IME-style romaji → kana table.
 *
 * Everything here is expressed in HIRAGANA. Katakana targets are normalised to
 * hiragana before matching (the keystrokes are identical either way), so the
 * table only ever needs one casing of the syllabary.
 *
 * Rule order breaks ties when we pick the spelling to *display*. Length is the
 * primary key (the spec asks for the shortest), so order only decides between
 * equal-length alternatives — which is why the Hepburn block sits first and
 * `ji`/`fu` win over `zi`/`hu`.
 */

export interface RomajiRule {
  /** ASCII the user types. */
  readonly romaji: string;
  /** Hiragana it produces. May be more than one character (e.g. `kya` → きゃ). */
  readonly kana: string;
}

const rules: RomajiRule[] = [];

function add(romaji: string, kana: string): void {
  rules.push({ romaji, kana });
}

/** Cross a set of consonant prefixes with the five vowels. */
function row(kana: readonly [string, string, string, string, string], prefixes: readonly string[]): void {
  const vowels = ['a', 'i', 'u', 'e', 'o'] as const;
  for (const p of prefixes) {
    for (let i = 0; i < 5; i++) add(p + vowels[i], kana[i]!);
  }
}

/**
 * Palatalised (拗音) syllables: a base kana ending in -i plus a small ya/yu/yo,
 * plus the -yi/-ye variants Google IME also accepts.
 *
 * `skipI` drops the bare -i form, which is needed for the digraph prefixes:
 * `shi`/`chi`/`ji` are the plain syllables し/ち/じ, not しぃ/ちぃ/じぃ (those
 * are `syi`/`cyi`/`jyi`).
 */
function yoon(base: string, prefixes: readonly string[], skipI = false): void {
  const combos: readonly (readonly [string, string])[] = [
    ['a', 'ゃ'],
    ['u', 'ゅ'],
    ['o', 'ょ'],
    ['i', 'ぃ'],
    ['e', 'ぇ'],
  ];
  for (const p of prefixes) {
    for (const [v, small] of combos) {
      if (skipI && v === 'i') continue;
      add(p + v, base + small);
    }
  }
}

/** Foreign-sound clusters: a base kana plus a small **vowel** (not a small ya). */
function cluster(base: string, prefix: string, plain?: string): void {
  const combos: readonly (readonly [string, string])[] = [
    ['a', 'ぁ'],
    ['i', 'ぃ'],
    ['u', 'ぅ'],
    ['e', 'ぇ'],
    ['o', 'ぉ'],
  ];
  for (const [v, small] of combos) {
    if (plain !== undefined && v === plain) add(prefix + v, base);
    else add(prefix + v, base + small);
  }
}

// ─── Hepburn forms that must win same-length ties ────────────────────────────
add('ji', 'じ');
add('fu', 'ふ');

// ─── 直音 ────────────────────────────────────────────────────────────────────
row(['あ', 'い', 'う', 'え', 'お'], ['']);
row(['か', 'き', 'く', 'け', 'こ'], ['k']);
row(['さ', 'し', 'す', 'せ', 'そ'], ['s']);
row(['た', 'ち', 'つ', 'て', 'と'], ['t']);
row(['な', 'に', 'ぬ', 'ね', 'の'], ['n']);
row(['は', 'ひ', 'ふ', 'へ', 'ほ'], ['h']);
row(['ま', 'み', 'む', 'め', 'も'], ['m']);
row(['ら', 'り', 'る', 'れ', 'ろ'], ['r']);
row(['が', 'ぎ', 'ぐ', 'げ', 'ご'], ['g']);
row(['ざ', 'じ', 'ず', 'ぜ', 'ぞ'], ['z']);
row(['だ', 'ぢ', 'づ', 'で', 'ど'], ['d']);
row(['ば', 'び', 'ぶ', 'べ', 'ぼ'], ['b']);
row(['ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ'], ['p']);

// Longer Hepburn spellings — never the shortest, but always accepted.
add('shi', 'し');
add('chi', 'ち');
add('tsu', 'つ');
add('dzu', 'づ');

// c-row, as in the classic IME tables.
add('ca', 'か');
add('ci', 'し');
add('cu', 'く');
add('ce', 'せ');
add('co', 'こ');

// や行 / わ行
add('ya', 'や');
add('yu', 'ゆ');
add('yo', 'よ');
add('yi', 'い');
add('ye', 'いぇ');
add('wa', 'わ');
add('wo', 'を');
add('wu', 'う');
add('wi', 'うぃ');
add('we', 'うぇ');
add('wha', 'うぁ');
add('whi', 'うぃ');
add('whe', 'うぇ');
add('who', 'うぉ');
// Historical kana, reachable only through their dedicated spellings.
add('wyi', 'ゐ');
add('wye', 'ゑ');

// ─── 拗音 ────────────────────────────────────────────────────────────────────
yoon('き', ['ky']);
yoon('し', ['sy']);
yoon('し', ['sh'], true);
yoon('ち', ['ty', 'cy']);
yoon('ち', ['ch'], true);
yoon('に', ['ny']);
yoon('ひ', ['hy']);
yoon('み', ['my']);
yoon('り', ['ry']);
yoon('ぎ', ['gy']);
yoon('じ', ['zy', 'jy']);
yoon('じ', ['j'], true);
yoon('ぢ', ['dy']);
yoon('び', ['by']);
yoon('ぴ', ['py']);
yoon('く', ['qy']);
yoon('ふ', ['fy']);
yoon('ゔ', ['vy']);

// ─── 外来音 ──────────────────────────────────────────────────────────────────
cluster('ふ', 'f', 'u'); // fa fi fu fe fo
cluster('ゔ', 'v', 'u'); // va vi vu ve vo
cluster('く', 'q', 'u'); // qa qi qu qe qo
cluster('つ', 'ts', 'u'); // tsa tsi tsu tse tso
add('the', 'てぇ');
add('thi', 'てぃ');
add('tha', 'てゃ');
add('thu', 'てゅ');
add('tho', 'てょ');
add('dhi', 'でぃ');
add('dha', 'でゃ');
add('dhu', 'でゅ');
add('dho', 'でょ');
add('dhe', 'でぇ');
add('twu', 'とぅ');
add('dwu', 'どぅ');
add('kwa', 'くぁ');
add('gwa', 'ぐぁ');

// ─── 撥音 ん ─────────────────────────────────────────────────────────────────
// The bare `n` is context-dependent; the matcher decides when it is legal.
add('n', 'ん');
add('nn', 'ん');
add("n'", 'ん');
add('xn', 'ん');

// ─── 小書き (捨て仮名) ───────────────────────────────────────────────────────
const SMALL: readonly (readonly [string, string])[] = [
  ['a', 'ぁ'],
  ['i', 'ぃ'],
  ['u', 'ぅ'],
  ['e', 'ぇ'],
  ['o', 'ぉ'],
  ['ya', 'ゃ'],
  ['yu', 'ゅ'],
  ['yo', 'ょ'],
  ['wa', 'ゎ'],
  ['ka', 'ゕ'],
  ['ke', 'ゖ'],
  ['tu', 'っ'],
  ['tsu', 'っ'],
];
for (const [suffix, kana] of SMALL) {
  add('x' + suffix, kana);
  add('l' + suffix, kana);
}

// ─── 記号 ────────────────────────────────────────────────────────────────────
add('-', 'ー');
add(',', '、');
add('.', '。');
add('/', '・');
add('[', '「');
add(']', '」');
add('z-', '〜');
add('z.', '…');
add('z,', '‥');
add('z[', '『');
add('z]', '』');

export const ROMAJI_TABLE: readonly RomajiRule[] = rules;

/** Consonants that may be doubled to write 促音 っ. `n` is excluded: `nn` is ん. */
export const SOKUON_EXCLUDED_HEADS: ReadonlySet<string> = new Set([
  'n',
  'a',
  'i',
  'u',
  'e',
  'o',
  '-',
  ',',
  '.',
  '/',
  '[',
  ']',
]);

/** After a bare `n`, these heads would be swallowed into a な-row or ん spelling. */
export const BARE_N_UNSAFE_HEADS: ReadonlySet<string> = new Set(['a', 'i', 'u', 'e', 'o', 'y']);
