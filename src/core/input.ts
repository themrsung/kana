/**
 * Input dispatcher.
 *
 * The two engines - romaji (`core/romaji/matcher`) and kana (`core/kana/engine`)
 * - were written to the same shape on purpose: build a plan for a target, start
 * a match, feed one character at a time, ask what key comes next. This module is
 * the seam that lets the session and the UI hold a plan without knowing which
 * engine produced it.
 *
 * It also owns the keystroke -> character step, which is the one place the two
 * modes genuinely differ: romaji reads ASCII off the physical key, kana reads a
 * kana (or a voicing mark) off the same key through the JIS layout.
 */
import { asciiFor, keyForAscii } from './keycodes';
import {
  buildKanaPlan,
  feedKana,
  kanaExpectation,
  startKanaMatch,
  unreachableInPlan,
  type KanaMatch,
  type KanaPlan,
} from './kana/engine';
import { kanaFor, keyForKana, type Board, type KeyPress } from './kana/layout';
import {
  buildRomajiPlan,
  expectation,
  feed,
  startMatch,
  type RomajiMatch,
  type RomajiOptions,
  type RomajiPlan,
} from './romaji/matcher';

export type InputMode = 'romaji' | 'kana';

/** How the app is reading the keyboard right now. */
export type InputConfig =
  | { readonly mode: 'romaji'; readonly options?: RomajiOptions }
  | { readonly mode: 'kana'; readonly board: Board };

export const DEFAULT_CONFIG: InputConfig = { mode: 'romaji' };

/** Plans and matches are discriminated by `mode`, so they narrow together. */
export type Plan = RomajiPlan | KanaPlan;
export type Match = RomajiMatch | KanaMatch;

export interface Expectation {
  /** The one character that advances the match along the shortest path. */
  readonly preferred: string | null;
  /** Every character that would be accepted right now. */
  readonly accepted: ReadonlySet<string>;
  /** Everything still owed for this token, shortest spelling. */
  readonly remaining: string;
  /** The physical key to light up on the on-screen keyboard, if any. */
  readonly press: KeyPress | null;
}

export interface FeedOutcome {
  readonly match: Match;
  /** False if the keystroke was rejected; `match` is then unchanged. */
  readonly accepted: boolean;
}

/**
 * The character a physical key emits in this mode, or null if the key produces
 * nothing typeable (a dead key on the board, or a symbol the mode cannot use).
 */
export function charForKey(config: InputConfig, code: string, shift: boolean): string | null {
  return config.mode === 'kana' ? kanaFor(code, shift) : asciiFor(code, shift);
}

/**
 * The inverse of `charForKey`: which physical key produces this character?
 * Used to put the mistyped-key heatmap back onto the keyboard picture.
 */
export function pressForChar(config: InputConfig, char: string): KeyPress | null {
  return config.mode === 'kana' ? keyForKana(char) : keyForAscii(char);
}

export function buildPlan(target: string, config: InputConfig = DEFAULT_CONFIG): Plan {
  return config.mode === 'kana' ? buildKanaPlan(target) : buildRomajiPlan(target, config.options);
}

export function startPlan(plan: Plan): Match {
  return plan.mode === 'kana' ? startKanaMatch(plan) : startMatch(plan);
}

/** Feed one emitted character. Wrong keys leave the match untouched. */
export function feedPlan(plan: Plan, match: Match, char: string): FeedOutcome {
  if (plan.mode === 'kana' && match.mode === 'kana') return feedKana(plan, match, char);
  if (plan.mode === 'romaji' && match.mode === 'romaji') return feed(plan, match, char);
  throw new Error(`input: ${match.mode} match fed to a ${plan.mode} plan`);
}

export function planExpectation(plan: Plan, match: Match): Expectation {
  if (plan.mode === 'kana' && match.mode === 'kana') return kanaExpectation(plan, match);
  if (plan.mode === 'romaji' && match.mode === 'romaji') {
    const exp = expectation(plan, match);
    return { ...exp, press: exp.preferred === null ? null : keyForAscii(exp.preferred) };
  }
  throw new Error(`input: ${match.mode} match paired with a ${plan.mode} plan`);
}

/**
 * Characters in this plan that the configured board physically cannot type.
 * Always empty in romaji mode - every ASCII key exists on every board.
 */
export function unreachable(plan: Plan, config: InputConfig): readonly string[] {
  if (plan.mode !== 'kana' || config.mode !== 'kana') return [];
  return unreachableInPlan(plan, config.board);
}
