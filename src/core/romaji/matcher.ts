/**
 * Romaji input engine.
 *
 * Rather than converting keystrokes → kana and comparing (which is ambiguous —
 * `nn` alone could be ん, or ん-in-progress, or the start of んな), we compile the
 * *target* kana into a small graph of every legal spelling, then walk it as an
 * NFA while the user types.
 *
 * This gives us the three properties the app needs:
 *   - accept **every** valid spelling (`si` and `shi`, `jya`/`zya`/`ja`, …)
 *   - display the **shortest** one as the key hint
 *   - decide "is this keystroke correct?" with zero lookahead and no heuristics
 */

import { BARE_N_UNSAFE_HEADS, ROMAJI_TABLE, SOKUON_EXCLUDED_HEADS } from './table';

export interface RomajiEdge {
  /** ASCII to type to traverse this edge. */
  readonly romaji: string;
  /** Kana index this edge lands on. */
  readonly to: number;
}

export interface RomajiSegment {
  readonly kana: string;
  readonly romaji: string;
  readonly start: number;
  readonly end: number;
}

export interface RomajiPlan {
  /** Discriminant for the input dispatcher in `core/input.ts`. */
  readonly mode: 'romaji';
  /** Hiragana-normalised target. */
  readonly kana: string;
  /** `edges[i]` = every spelling that can be typed starting at kana index `i`. */
  readonly edges: readonly (readonly RomajiEdge[])[];
  /** `cost[i]` = keystrokes in the shortest completion from index `i`. */
  readonly cost: readonly number[];
  /** Shortest full spelling of the whole target. */
  readonly shortest: string;
  /** Shortest spelling, split so each chunk lines up with the kana it types. */
  readonly segments: readonly RomajiSegment[];
}

export interface RomajiOptions {
  /**
   * When true, a bare `n` may only be used where no ambiguity is possible at
   * all — i.e. not before the な row either, so こんにちは must be typed
   * `konnnichiha` / `kon'nichiha`. Default (false) also accepts `konnichiha`,
   * matching the muscle memory most typists actually have.
   */
  readonly strictN?: boolean;
}

const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;

/** Katakana → hiragana. Keystrokes are identical, so the matcher works in one script. */
export function toHiragana(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    out += code >= KATAKANA_START && code <= KATAKANA_END ? String.fromCodePoint(code - 0x60) : ch;
  }
  return out;
}

export function buildRomajiPlan(target: string, options: RomajiOptions = {}): RomajiPlan {
  const kana = toHiragana(target);
  const n = kana.length;
  const edges: RomajiEdge[][] = Array.from({ length: n }, () => []);

  // Walk backwards so that when we reach a っ, the edges of the syllable it
  // doubles are already known.
  for (let i = n - 1; i >= 0; i--) {
    const here = edges[i]!;

    for (const rule of ROMAJI_TABLE) {
      if (!kana.startsWith(rule.kana, i)) continue;
      if (rule.romaji === 'n' && !bareNAllowed(kana, edges, i, n, options)) continue;
      here.push({ romaji: rule.romaji, to: i + rule.kana.length });
    }

    // 促音: っ can be typed by doubling the next syllable's leading consonant.
    if (kana[i] === 'っ' && i + 1 < n) {
      const heads = new Set<string>();
      for (const e of edges[i + 1]!) {
        const head = e.romaji[0]!;
        if (!SOKUON_EXCLUDED_HEADS.has(head)) heads.add(head);
      }
      for (const head of heads) here.push({ romaji: head, to: i + 1 });
    }

    // Anything the table does not cover (latin, digits, stray punctuation) is
    // typed literally. Better than declaring the token untypeable.
    if (here.length === 0) here.push({ romaji: kana[i]!, to: i + 1 });
  }

  const { cost, best } = shortestPaths(edges, n);
  const segments = tracePath(kana, best, n);
  return { mode: 'romaji', kana, edges, cost, shortest: segments.map((s) => s.romaji).join(''), segments };
}

/**
 * A bare `n` is only ん if the following sound cannot absorb it. Before a vowel
 * or `y` it would read as な/に/にゃ…, so ん must be spelled `nn`, `n'` or `xn`.
 */
function bareNAllowed(
  kana: string,
  edges: readonly RomajiEdge[][],
  i: number,
  n: number,
  options: RomajiOptions,
): boolean {
  if (kana[i] !== 'ん') return false;
  if (i + 1 >= n) return true;
  const unsafe = options.strictN ? new Set([...BARE_N_UNSAFE_HEADS, 'n']) : BARE_N_UNSAFE_HEADS;
  for (const e of edges[i + 1]!) {
    if (unsafe.has(e.romaji[0]!)) return false;
  }
  return true;
}

function shortestPaths(edges: readonly (readonly RomajiEdge[])[], n: number) {
  const cost = new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY);
  const best = new Array<RomajiEdge | null>(n + 1).fill(null);
  cost[n] = 0;
  for (let i = n - 1; i >= 0; i--) {
    for (const e of edges[i]!) {
      const c = e.romaji.length + cost[e.to]!;
      if (c < cost[i]!) {
        cost[i] = c;
        best[i] = e;
      }
    }
  }
  return { cost, best };
}

function tracePath(kana: string, best: readonly (RomajiEdge | null)[], n: number): RomajiSegment[] {
  const segments: RomajiSegment[] = [];
  let i = 0;
  while (i < n) {
    const e = best[i];
    if (!e) break;
    segments.push({ kana: kana.slice(i, e.to), romaji: e.romaji, start: i, end: e.to });
    i = e.to;
  }
  return segments;
}

// ─── incremental matching ────────────────────────────────────────────────────

export interface RomajiCursor {
  /** Kana index reached so far. */
  readonly index: number;
  /** Keystrokes typed toward the next kana but not yet resolved. */
  readonly pending: string;
}

export interface RomajiMatch {
  /** Pairs with `RomajiPlan.mode`, so a match can be dispatched on its own. */
  readonly mode: 'romaji';
  /** Every interpretation of the input so far that is still viable. */
  readonly cursors: readonly RomajiCursor[];
  /** Kana confirmed under *every* interpretation. Never moves backwards. */
  readonly settled: number;
  /** Furthest kana index any interpretation has reached — what the UI highlights. */
  readonly reached: number;
  /** Raw ASCII accepted so far. */
  readonly typed: string;
  readonly done: boolean;
}

export function startMatch(plan: RomajiPlan): RomajiMatch {
  return summarise(plan, [{ index: 0, pending: '' }], '');
}

export interface FeedResult {
  readonly match: RomajiMatch;
  /** False if the keystroke was rejected; `match` is then unchanged. */
  readonly accepted: boolean;
}

/** Feed one ASCII character. Rejected keystrokes leave the match untouched. */
export function feed(plan: RomajiPlan, match: RomajiMatch, char: string): FeedResult {
  const next: RomajiCursor[] = [];
  const seen = new Set<string>();

  for (const cursor of match.cursors) {
    if (cursor.index >= plan.kana.length) continue;
    const probe = cursor.pending + char;
    for (const e of plan.edges[cursor.index]!) {
      if (e.romaji === probe) push(next, seen, { index: e.to, pending: '' });
      else if (e.romaji.startsWith(probe)) push(next, seen, { index: cursor.index, pending: probe });
    }
  }

  if (next.length === 0) return { match, accepted: false };
  return { match: summarise(plan, next, match.typed + char), accepted: true };
}

function push(list: RomajiCursor[], seen: Set<string>, cursor: RomajiCursor): void {
  const key = `${cursor.index}:${cursor.pending}`;
  if (seen.has(key)) return;
  seen.add(key);
  list.push(cursor);
}

function summarise(plan: RomajiPlan, cursors: readonly RomajiCursor[], typed: string): RomajiMatch {
  let settled = Number.POSITIVE_INFINITY;
  let reached = 0;
  let done = false;
  for (const c of cursors) {
    settled = Math.min(settled, c.index);
    reached = Math.max(reached, c.index);
    if (c.index === plan.kana.length && c.pending === '') done = true;
  }
  return { mode: 'romaji', cursors, settled: Number.isFinite(settled) ? settled : 0, reached, typed, done };
}

/**
 * The keystroke that keeps the user on the shortest remaining spelling, plus
 * every other keystroke that would also be accepted.
 */
export function expectation(plan: RomajiPlan, match: RomajiMatch): {
  preferred: string | null;
  accepted: Set<string>;
  remaining: string;
} {
  const accepted = new Set<string>();
  let bestCost = Number.POSITIVE_INFINITY;
  let preferred: string | null = null;
  let remaining = '';

  for (const cursor of match.cursors) {
    if (cursor.index >= plan.kana.length) continue;
    for (const e of plan.edges[cursor.index]!) {
      if (!e.romaji.startsWith(cursor.pending) || e.romaji.length === cursor.pending.length) continue;
      const nextChar = e.romaji[cursor.pending.length]!;
      accepted.add(nextChar);
      const c = e.romaji.length - cursor.pending.length + plan.cost[e.to]!;
      if (c < bestCost) {
        bestCost = c;
        preferred = nextChar;
        remaining = e.romaji.slice(cursor.pending.length) + completionFrom(plan, e.to);
      }
    }
  }
  return { preferred, accepted, remaining };
}

/** Shortest remaining spelling from a kana index. */
export function completionFrom(plan: RomajiPlan, index: number): string {
  let out = '';
  let i = index;
  while (i < plan.kana.length) {
    let bestEdge: RomajiEdge | null = null;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const e of plan.edges[i]!) {
      const c = e.romaji.length + plan.cost[e.to]!;
      if (c < bestCost) {
        bestCost = c;
        bestEdge = e;
      }
    }
    if (!bestEdge) break;
    out += bestEdge.romaji;
    i = bestEdge.to;
  }
  return out;
}

/** Every distinct spelling of a target, shortest first. Used by tests and the UI's "other spellings" hint. */
export function allSpellings(plan: RomajiPlan, limit = 64): string[] {
  const out: string[] = [];
  const walk = (i: number, acc: string): void => {
    if (out.length >= limit) return;
    if (i === plan.kana.length) {
      out.push(acc);
      return;
    }
    for (const e of plan.edges[i]!) walk(e.to, acc + e.romaji);
  };
  walk(0, '');
  return [...new Set(out)].sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
}
