/**
 * Physical key → ASCII, resolved from `event.code` only.
 *
 * The app never reads `event.key`: on a Korean/Japanese OS layout, or with the
 * OS IME half-awake, `event.key` lies. `event.code` names the physical switch,
 * so the same finger movement always produces the same character here.
 *
 * This is the US-ANSI engraving, which is what romaji input is defined against.
 * The JIS kana layout maps the same codes to entirely different kana - see
 * `core/kana/layout.ts`.
 */

/** [unshifted, shifted] ASCII for every code we accept. */
const ASCII: Readonly<Record<string, readonly [string, string]>> = {
  KeyA: ['a', 'A'], KeyB: ['b', 'B'], KeyC: ['c', 'C'], KeyD: ['d', 'D'],
  KeyE: ['e', 'E'], KeyF: ['f', 'F'], KeyG: ['g', 'G'], KeyH: ['h', 'H'],
  KeyI: ['i', 'I'], KeyJ: ['j', 'J'], KeyK: ['k', 'K'], KeyL: ['l', 'L'],
  KeyM: ['m', 'M'], KeyN: ['n', 'N'], KeyO: ['o', 'O'], KeyP: ['p', 'P'],
  KeyQ: ['q', 'Q'], KeyR: ['r', 'R'], KeyS: ['s', 'S'], KeyT: ['t', 'T'],
  KeyU: ['u', 'U'], KeyV: ['v', 'V'], KeyW: ['w', 'W'], KeyX: ['x', 'X'],
  KeyY: ['y', 'Y'], KeyZ: ['z', 'Z'],

  Digit1: ['1', '!'], Digit2: ['2', '@'], Digit3: ['3', '#'], Digit4: ['4', '$'],
  Digit5: ['5', '%'], Digit6: ['6', '^'], Digit7: ['7', '&'], Digit8: ['8', '*'],
  Digit9: ['9', '('], Digit0: ['0', ')'],

  Minus: ['-', '_'], Equal: ['=', '+'],
  BracketLeft: ['[', '{'], BracketRight: [']', '}'], Backslash: ['\\', '|'],
  Semicolon: [';', ':'], Quote: ["'", '"'],
  Comma: [',', '<'], Period: ['.', '>'], Slash: ['/', '?'],
  Backquote: ['`', '~'], Space: [' ', ' '],

  /** JIS-only keys, present on a full JIS board and absent on a MacBook Air. */
  IntlYen: ['\\', '|'],
  IntlRo: ['\\', '_'],
};

/** ASCII for a physical key, or null if we do not accept that key at all. */
export function asciiFor(code: string, shift: boolean): string | null {
  const pair = ASCII[code];
  if (!pair) return null;
  return shift ? pair[1] : pair[0];
}

/** Every code this app can see. Used by the on-screen keyboard renderers. */
export const KNOWN_CODES: readonly string[] = Object.keys(ASCII);

/** Reverse lookup: which physical key produces this ASCII character? */
const BY_CHAR = new Map<string, { code: string; shift: boolean }>();
for (const [code, [plain, shifted]] of Object.entries(ASCII)) {
  // First writer wins, so `\` resolves to Backslash rather than IntlYen/IntlRo.
  if (!BY_CHAR.has(plain)) BY_CHAR.set(plain, { code, shift: false });
  if (!BY_CHAR.has(shifted)) BY_CHAR.set(shifted, { code, shift: true });
}

export function keyForAscii(char: string): { code: string; shift: boolean } | null {
  return BY_CHAR.get(char) ?? null;
}

/**
 * True for keys the browser gives us that are not text input - we must let
 * these through to the page (or to our own shortcut handling) untouched.
 */
export function isEditingKey(code: string): boolean {
  return code === 'Backspace' || code === 'Delete' || code === 'Tab' || code === 'Escape'
    || code === 'Enter' || code === 'NumpadEnter' || code.startsWith('Arrow');
}
