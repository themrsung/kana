/**
 * JIS kana layout (JIS X 6002), addressed by `event.code`.
 *
 * The app never reads `event.key`. With the OS IME off - which is the entire point of
 * this project - `event.key` reports latin, and on a Korean or US system layout it
 * reports the *wrong* latin. `event.code` names the physical switch, which is what a
 * kana typist's muscle memory is actually indexed on.
 *
 * Physical wiring note, because it trips everyone up: on a JIS board the keycap
 * engraved `@` reports `BracketLeft`, `[` reports `BracketRight`, `:` reports `Quote`,
 * and `]` reports `Backslash`. A JIS board also carries two keys a US-ANSI board simply
 * does not have - `¥` (IntlYen) and `ろ` (IntlRo) - which is why ー and ろ are
 * unreachable on a MacBook Air and must be flagged rather than silently dropped.
 */

/** Standalone (spacing) voicing marks, as engraved on the keycaps. */
export const DAKUTEN = '゛'; // ゛
export const HANDAKUTEN = '゜'; // ゜

export type Board = 'jis' | 'ansi';

export interface KanaKey {
  readonly code: string;
  /** Kana produced unshifted. */
  readonly plain: string;
  /** Kana produced with shift held, if any. */
  readonly shifted?: string;
  /** Latin/symbol engraving on a JIS keycap. */
  readonly jis: string;
  /** Latin/symbol engraving on a US-ANSI keycap; `null` when the key is absent. */
  readonly ansi: string | null;
  /** Outside JIS X 6002 - see the ヶ note below. */
  readonly nonStandard?: boolean;
}

/**
 * ヶ is not on a real JIS kana board. The spec asks for it in the shift layer, so it
 * sits on Shift+け (the physical `:` key) as a documented extension, flagged so the
 * on-screen keyboard can mark it and the README can explain it.
 */
export const KANA_KEYS: readonly KanaKey[] = [
  // --- number row ------------------------------------------------------------
  { code: 'Digit1', plain: 'ぬ', jis: '1', ansi: '1' },
  { code: 'Digit2', plain: 'ふ', jis: '2', ansi: '2' },
  { code: 'Digit3', plain: 'あ', shifted: 'ぁ', jis: '3', ansi: '3' },
  { code: 'Digit4', plain: 'う', shifted: 'ぅ', jis: '4', ansi: '4' },
  { code: 'Digit5', plain: 'え', shifted: 'ぇ', jis: '5', ansi: '5' },
  { code: 'Digit6', plain: 'お', shifted: 'ぉ', jis: '6', ansi: '6' },
  { code: 'Digit7', plain: 'や', shifted: 'ゃ', jis: '7', ansi: '7' },
  { code: 'Digit8', plain: 'ゆ', shifted: 'ゅ', jis: '8', ansi: '8' },
  { code: 'Digit9', plain: 'よ', shifted: 'ょ', jis: '9', ansi: '9' },
  { code: 'Digit0', plain: 'わ', shifted: 'を', jis: '0', ansi: '0' },
  { code: 'Minus', plain: 'ほ', jis: '-', ansi: '-' },
  { code: 'Equal', plain: 'へ', jis: '^', ansi: '=' },
  { code: 'IntlYen', plain: 'ー', jis: '¥', ansi: null },

  // --- upper row -------------------------------------------------------------
  { code: 'KeyQ', plain: 'た', jis: 'Q', ansi: 'Q' },
  { code: 'KeyW', plain: 'て', jis: 'W', ansi: 'W' },
  { code: 'KeyE', plain: 'い', shifted: 'ぃ', jis: 'E', ansi: 'E' },
  { code: 'KeyR', plain: 'す', jis: 'R', ansi: 'R' },
  { code: 'KeyT', plain: 'か', jis: 'T', ansi: 'T' },
  { code: 'KeyY', plain: 'ん', jis: 'Y', ansi: 'Y' },
  { code: 'KeyU', plain: 'な', jis: 'U', ansi: 'U' },
  { code: 'KeyI', plain: 'に', jis: 'I', ansi: 'I' },
  { code: 'KeyO', plain: 'ら', jis: 'O', ansi: 'O' },
  { code: 'KeyP', plain: 'せ', jis: 'P', ansi: 'P' },
  { code: 'BracketLeft', plain: DAKUTEN, jis: '@', ansi: '[' },
  { code: 'BracketRight', plain: HANDAKUTEN, shifted: '「', jis: '[', ansi: ']' },

  // --- home row --------------------------------------------------------------
  { code: 'KeyA', plain: 'ち', jis: 'A', ansi: 'A' },
  { code: 'KeyS', plain: 'と', jis: 'S', ansi: 'S' },
  { code: 'KeyD', plain: 'し', jis: 'D', ansi: 'D' },
  { code: 'KeyF', plain: 'は', jis: 'F', ansi: 'F' },
  { code: 'KeyG', plain: 'き', jis: 'G', ansi: 'G' },
  { code: 'KeyH', plain: 'く', jis: 'H', ansi: 'H' },
  { code: 'KeyJ', plain: 'ま', jis: 'J', ansi: 'J' },
  { code: 'KeyK', plain: 'の', jis: 'K', ansi: 'K' },
  { code: 'KeyL', plain: 'り', jis: 'L', ansi: 'L' },
  { code: 'Semicolon', plain: 'れ', jis: ';', ansi: ';' },
  { code: 'Quote', plain: 'け', shifted: 'ヶ', jis: ':', ansi: "'", nonStandard: true },
  { code: 'Backslash', plain: 'む', shifted: '」', jis: ']', ansi: '\\' },

  // --- lower row -------------------------------------------------------------
  { code: 'KeyZ', plain: 'つ', shifted: 'っ', jis: 'Z', ansi: 'Z' },
  { code: 'KeyX', plain: 'さ', jis: 'X', ansi: 'X' },
  { code: 'KeyC', plain: 'そ', jis: 'C', ansi: 'C' },
  { code: 'KeyV', plain: 'ひ', jis: 'V', ansi: 'V' },
  { code: 'KeyB', plain: 'こ', jis: 'B', ansi: 'B' },
  { code: 'KeyN', plain: 'み', jis: 'N', ansi: 'N' },
  { code: 'KeyM', plain: 'も', jis: 'M', ansi: 'M' },
  { code: 'Comma', plain: 'ね', shifted: '、', jis: ',', ansi: ',' },
  { code: 'Period', plain: 'る', shifted: '。', jis: '.', ansi: '.' },
  { code: 'Slash', plain: 'め', shifted: '・', jis: '/', ansi: '/' },
  { code: 'IntlRo', plain: 'ろ', jis: 'ろ', ansi: null },
];

/** Physical rows, per engraving. The two boards differ in shape, not just in legends. */
export const BOARD_ROWS: Record<Board, readonly (readonly string[])[]> = {
  jis: [
    ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'IntlYen'],
    ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'],
    ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Backslash'],
    ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'IntlRo'],
  ],
  ansi: [
    ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
    ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
    ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'],
    ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
  ],
};

/** Decorative thumb-row keys. They produce no kana; they exist so the board looks right. */
export const BOARD_THUMBS: Record<Board, readonly string[]> = {
  jis: ['無変換', 'Space', '変換', 'かな'],
  ansi: ['Command', 'Space', 'Command'],
};

const BY_CODE = new Map(KANA_KEYS.map((k) => [k.code, k]));

export function keyByCode(code: string): KanaKey | null {
  return BY_CODE.get(code) ?? null;
}

/** The kana (or voicing mark) a physical key produces. */
export function kanaFor(code: string, shift: boolean): string | null {
  const key = BY_CODE.get(code);
  if (!key) return null;
  if (shift) return key.shifted ?? null;
  return key.plain;
}

export interface KeyPress {
  readonly code: string;
  readonly shift: boolean;
}

const BY_KANA = new Map<string, KeyPress>();
for (const key of KANA_KEYS) {
  if (!BY_KANA.has(key.plain)) BY_KANA.set(key.plain, { code: key.code, shift: false });
  if (key.shifted && !BY_KANA.has(key.shifted)) BY_KANA.set(key.shifted, { code: key.code, shift: true });
}

/** Which physical key produces this kana, if any. */
export function keyForKana(kana: string): KeyPress | null {
  return BY_KANA.get(kana) ?? null;
}

export function boardHasCode(board: Board, code: string): boolean {
  const key = BY_CODE.get(code);
  if (!key) return false;
  return board === 'jis' ? true : key.ansi !== null;
}

/** Kana that simply cannot be produced on this board. Surfaced in the UI, never hidden. */
export function unreachableKana(board: Board): readonly string[] {
  const out: string[] = [];
  for (const key of KANA_KEYS) {
    if (boardHasCode(board, key.code)) continue;
    out.push(key.plain);
    if (key.shifted) out.push(key.shifted);
  }
  return out;
}

// --- engravings -------------------------------------------------------------

const HIRAGANA_START = 0x3041; // ぁ
const HIRAGANA_END = 0x3096; // ゖ

/** ぁ-ゖ → ァ-ヶ. Voicing marks, 、。「」・ and ー are script-neutral and pass through. */
function toKatakana(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    out += code >= HIRAGANA_START && code <= HIRAGANA_END ? String.fromCodePoint(code + 0x60) : ch;
  }
  return out;
}

/**
 * The kana as printed on this board's keycaps: hiragana on JIS, which is what a real
 * JIS X 6002 board is engraved with, and katakana on US-ANSI, which has no kana
 * printing of its own to be faithful to.
 *
 * Drawing only. `kanaFor` emits hiragana on both boards and the engine, the prompt and
 * the scoring all stay in hiragana - the keystrokes are identical either way, so the
 * script on the cap is a legend, not a mode.
 */
export function engravingFor(board: Board, kana: string): string {
  return board === 'ansi' ? toKatakana(kana) : kana;
}

// --- voicing ----------------------------------------------------------------
// が is not a key. It is か followed by the ゛ key, and the app scores it as two
// keystrokes because that is what the typist's hands actually do.

const VOICED_PAIRS = 'がかぎきぐくげけごこざさじしずすぜせぞそだたぢちづつでてどとばはびひぶふべへぼほゔう';
const SEMI_PAIRS = 'ぱはぴひぷふぺへぽほ';

const BASE_OF = new Map<string, readonly [string, string]>();
for (let i = 0; i < VOICED_PAIRS.length; i += 2) {
  BASE_OF.set(VOICED_PAIRS[i]!, [VOICED_PAIRS[i + 1]!, DAKUTEN]);
}
for (let i = 0; i < SEMI_PAIRS.length; i += 2) {
  BASE_OF.set(SEMI_PAIRS[i]!, [SEMI_PAIRS[i + 1]!, HANDAKUTEN]);
}

/** `が` → `['か', '゛']`. Anything undecorated returns itself alone. */
export function decomposeKana(char: string): readonly string[] {
  const pair = BASE_OF.get(char);
  return pair ? [pair[0], pair[1]] : [char];
}
