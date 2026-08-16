/**
 * Bytes -> string, for Japanese text files that arrive in whatever encoding the
 * machine that wrote them happened to use.
 *
 * Japanese plain text in the wild is UTF-8, Shift_JIS (still the default of
 * Windows-era tooling and most .txt exported from Excel), or UTF-16LE (anything
 * that went through Notepad "Unicode"). EUC-JP is rare enough now that it only
 * gets a look after the other three fail.
 *
 * The chain is: BOM if there is one, then strict UTF-8, then the legacy
 * encodings scored against each other. Strict UTF-8 first is the important
 * part - UTF-8 is a self-validating encoding, so a file that decodes without
 * throwing is essentially never a mis-read Shift_JIS file. The reverse is not
 * true: Shift_JIS never fails, it just produces garbage, which is why the
 * legacy candidates need scoring rather than a try/catch.
 */

export type Encoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'shift_jis' | 'euc-jp';

export interface Decoded {
  readonly text: string;
  readonly encoding: Encoding;
  /** True when the encoding was named by a BOM rather than guessed. */
  readonly fromBom: boolean;
}

/** Legacy candidates, in the order they win ties. */
const LEGACY: readonly Encoding[] = ['shift_jis', 'euc-jp', 'utf-16le'];

function bom(bytes: Uint8Array): Encoding | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  return null;
}

function tryDecode(bytes: Uint8Array, encoding: Encoding, fatal: boolean): string | null {
  try {
    // A decoder the platform does not know about throws on construction.
    return new TextDecoder(encoding, { fatal, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * How much does this look like real Japanese prose?
 *
 * Mojibake from a wrong legacy decode is not random: it lands overwhelmingly in
 * the CJK ideograph block as rare characters and in the half-width/private-use
 * ranges, and it almost never produces kana. Kana is therefore the signal - any
 * genuine Japanese text has kana running through it at a steady rate, and a
 * wrong decoding of that same text does not.
 */
export function scoreJapanese(text: string): number {
  if (text.length === 0) return 0;
  let good = 0;
  let bad = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c === 0xfffd) bad += 4; // replacement char - a decode that gave up
    else if (c >= 0x3040 && c <= 0x30ff) good += 2; // kana, the strong signal
    else if (c >= 0x4e00 && c <= 0x9fff) good += 1; // kanji
    else if (c >= 0x3000 && c <= 0x303f) good += 1; // Japanese punctuation
    else if (c >= 0xff00 && c <= 0xffef) good += 0; // full/half-width forms: neutral
    else if (c < 0x80) good += c === 0 ? 0 : 1; // ASCII is fine, NUL is not
    else if (c >= 0xe000 && c <= 0xf8ff) bad += 2; // private use - always mojibake
    else bad += 1;
    if (c === 0) bad += 4;
  }
  const total = good + bad;
  return total === 0 ? 0 : good / total;
}

/**
 * Decode a file's bytes. Never throws: the worst case is a lossy UTF-8 read,
 * which is still better than refusing to open the file.
 */
export function decodeBytes(bytes: Uint8Array): Decoded {
  const marked = bom(bytes);
  if (marked) {
    const text = tryDecode(bytes, marked, false);
    if (text !== null) return { text: stripBom(text), encoding: marked, fromBom: true };
  }

  const strict = tryDecode(bytes, 'utf-8', true);
  if (strict !== null) return { text: stripBom(strict), encoding: 'utf-8', fromBom: false };

  let best: Decoded | null = null;
  let bestScore = -1;
  for (const encoding of LEGACY) {
    const text = tryDecode(bytes, encoding, false);
    if (text === null) continue;
    const score = scoreJapanese(text);
    if (score > bestScore) {
      bestScore = score;
      best = { text: stripBom(text), encoding, fromBom: false };
    }
  }
  if (best) return best;

  // Nothing worked - take UTF-8 with replacement characters and move on.
  return {
    text: stripBom(tryDecode(bytes, 'utf-8', false) ?? ''),
    encoding: 'utf-8',
    fromBom: false,
  };
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
