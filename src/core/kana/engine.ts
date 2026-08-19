/**
 * Kana input engine.
 *
 * Far simpler than the romaji engine, because kana input is unambiguous: every kana has
 * exactly one keystroke sequence. The only structural wrinkle is voicing - が is か then
 * the ゛ key, two keystrokes - and it is a wrinkle worth keeping, because that is what
 * the hands do and the accuracy figures should say so.
 *
 * Deliberately mirrors the romaji engine's shape (plan / start / feed / expectation) so
 * the typing loop and the UI stay engine-agnostic.
 */

import { toHiragana } from '../romaji/matcher';
import { decomposeKana, keyForKana, type Board, type KeyPress } from './layout';

export interface KanaStep {
  /** The kana or voicing mark this keystroke emits. */
  readonly char: string;
  /** Physical key, or `null` when no key on any board produces it. */
  readonly press: KeyPress | null;
  /** Which kana of the target this keystroke contributes to. */
  readonly kanaIndex: number;
}

export interface KanaPlan {
  /** Discriminant for the input dispatcher in `core/input.ts`. */
  readonly mode: 'kana';
  /** Hiragana-normalised target (ヶ excepted - it has its own key). */
  readonly kana: string;
  readonly steps: readonly KanaStep[];
  /** One character per keystroke: the kana-mode analogue of romaji's `shortest`. */
  readonly shortest: string;
}

/** ヶ has a key of its own, so it must survive katakana→hiragana folding. */
function normalise(input: string): string {
  let out = '';
  for (const ch of input) out += ch === 'ヶ' || ch === 'ヵ' ? 'ヶ' : toHiragana(ch);
  return out;
}

/**
 * Keystrokes never vary by board - only which key you press to make them does, so the
 * board reaches just `press`, the on-screen hint. Defaults to the full JIS board.
 */
export function buildKanaPlan(target: string, board: Board = 'jis'): KanaPlan {
  const kana = normalise(target);
  const steps: KanaStep[] = [];
  const chars = [...kana];
  for (let i = 0; i < chars.length; i++) {
    for (const part of decomposeKana(chars[i]!)) {
      steps.push({ char: part, press: keyForKana(board, part), kanaIndex: i });
    }
  }
  return { mode: 'kana', kana, steps, shortest: steps.map((s) => s.char).join('') };
}

export interface KanaMatch {
  /** Pairs with `KanaPlan.mode`, so a match can be dispatched on its own. */
  readonly mode: 'kana';
  /** Keystrokes consumed. */
  readonly index: number;
  /** Kana fully committed - what the UI paints as done. */
  readonly settled: number;
  /** Includes a kana that is mid-composition (か typed, ゛ still owed). */
  readonly reached: number;
  readonly typed: string;
  readonly done: boolean;
}

function summarise(plan: KanaPlan, index: number, typed: string): KanaMatch {
  const next = plan.steps[index];
  const prev = plan.steps[index - 1];
  const settled = index === 0 ? 0 : next ? next.kanaIndex : prev!.kanaIndex + 1;
  const composing = next !== undefined && prev !== undefined && next.kanaIndex === prev.kanaIndex;
  return {
    mode: 'kana',
    index,
    settled,
    reached: composing ? settled + 1 : settled,
    typed,
    done: index >= plan.steps.length,
  };
}

export function startKanaMatch(plan: KanaPlan): KanaMatch {
  return summarise(plan, 0, '');
}

export interface KanaFeedResult {
  readonly match: KanaMatch;
  /** False if the keystroke was rejected; `match` is then unchanged. */
  readonly accepted: boolean;
}

/** Feed one emitted character. Wrong keys leave the match untouched. */
export function feedKana(plan: KanaPlan, match: KanaMatch, char: string): KanaFeedResult {
  const step = plan.steps[match.index];
  if (!step || step.char !== char) return { match, accepted: false };
  return { match: summarise(plan, match.index + 1, match.typed + char), accepted: true };
}

export interface KanaExpectation {
  /** The one character that advances the match. */
  readonly preferred: string | null;
  /** Same thing as a set, so the UI can share the romaji code path. */
  readonly accepted: ReadonlySet<string>;
  /** Everything still owed, including voicing marks. */
  readonly remaining: string;
  readonly press: KeyPress | null;
}

export function kanaExpectation(plan: KanaPlan, match: KanaMatch): KanaExpectation {
  const step = plan.steps[match.index];
  return {
    preferred: step?.char ?? null,
    accepted: new Set(step ? [step.char] : []),
    remaining: plan.steps.slice(match.index).map((s) => s.char).join(''),
    press: step?.press ?? null,
  };
}

/**
 * Kana in this plan that the chosen board physically cannot type. Returned so the UI can
 * say so out loud - the alternative, silently dropping them, would teach the wrong
 * muscle memory.
 */
export function unreachableInPlan(plan: KanaPlan, board: Board): readonly string[] {
  const out = new Set<string>();
  for (const step of plan.steps) {
    // Resolved against the board rather than trusting `step.press`, so a plan built for
    // one board and asked about another still answers honestly.
    if (!keyForKana(board, step.char)) out.add(step.char);
  }
  return [...out];
}
