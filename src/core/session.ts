/**
 * Typing session state. Deliberately a pure reducer: every transition is
 * `(session, keystroke, timestamp) → session`, so the whole scoring model is
 * testable without a DOM.
 */

import {
  DEFAULT_CONFIG,
  buildPlan,
  feedPlan,
  startPlan,
  type InputConfig,
  type Match,
  type Plan,
} from './input';

export interface Token {
  /** As it appears in the source text. */
  readonly surface: string;
  /** Katakana reading from the segmenter. */
  readonly reading: string;
}

export interface TokenStat {
  readonly keystrokes: number;
  readonly errors: number;
  /** Wall-clock ms from first keystroke on this token to completion. */
  readonly ms: number;
  readonly done: boolean;
}

export interface Session {
  readonly tokens: readonly Token[];
  /** How the plans were built - the UI needs it to read the keyboard the same way. */
  readonly config: InputConfig;
  readonly plans: readonly Plan[];
  readonly index: number;
  readonly match: Match;
  readonly stats: readonly TokenStat[];
  /** Mistyped key → count. Keyed by the character that was wrongly pressed. */
  readonly heatmap: Readonly<Record<string, number>>;
  readonly startedAt: number | null;
  readonly tokenStartedAt: number | null;
  readonly finishedAt: number | null;
  readonly paused: boolean;
  /** Total ms spent paused, subtracted from elapsed time. */
  readonly pausedMs: number;
  readonly pausedAt: number | null;
}

const EMPTY_STAT: TokenStat = { keystrokes: 0, errors: 0, ms: 0, done: false };

export function createSession(
  tokens: readonly Token[],
  config: InputConfig = DEFAULT_CONFIG,
): Session {
  const plans = tokens.map((t) => buildPlan(t.reading || t.surface, config));
  return {
    tokens,
    config,
    plans,
    index: 0,
    match: startPlan(plans[0] ?? buildPlan('', config)),
    stats: tokens.map(() => EMPTY_STAT),
    heatmap: {},
    startedAt: null,
    tokenStartedAt: null,
    finishedAt: null,
    paused: false,
    pausedMs: 0,
    pausedAt: null,
  };
}

export function currentPlan(session: Session): Plan | undefined {
  return session.plans[session.index];
}

export function isFinished(session: Session): boolean {
  return session.index >= session.tokens.length;
}

/**
 * Apply one keystroke. Wrong keys are counted and land on the heatmap but never
 * move the cursor — the user has to produce a legal spelling to advance.
 */
export function applyKey(session: Session, char: string, now: number): Session {
  if (session.paused || isFinished(session)) return session;
  const plan = currentPlan(session);
  if (!plan) return session;

  const startedAt = session.startedAt ?? now;
  const tokenStartedAt = session.tokenStartedAt ?? now;
  const result = feedPlan(plan, session.match, char);
  const stat = session.stats[session.index] ?? EMPTY_STAT;

  if (!result.accepted) {
    return {
      ...session,
      startedAt,
      tokenStartedAt,
      heatmap: { ...session.heatmap, [char]: (session.heatmap[char] ?? 0) + 1 },
      stats: replace(session.stats, session.index, {
        ...stat,
        keystrokes: stat.keystrokes + 1,
        errors: stat.errors + 1,
      }),
    };
  }

  const nextStat: TokenStat = {
    ...stat,
    keystrokes: stat.keystrokes + 1,
    done: result.match.done,
    ms: result.match.done ? now - tokenStartedAt : stat.ms,
  };
  const stats = replace(session.stats, session.index, nextStat);

  if (!result.match.done) {
    return { ...session, startedAt, tokenStartedAt, match: result.match, stats };
  }

  const index = session.index + 1;
  const nextPlan = session.plans[index];
  return {
    ...session,
    startedAt,
    tokenStartedAt: null,
    index,
    match: nextPlan ? startPlan(nextPlan) : result.match,
    stats,
    finishedAt: nextPlan ? null : now,
  };
}

/** Give up on the current token and move on. Counts as an error, not a completion. */
export function skipToken(session: Session, now: number): Session {
  if (isFinished(session)) return session;
  const index = session.index + 1;
  const nextPlan = session.plans[index];
  return {
    ...session,
    index,
    tokenStartedAt: null,
    match: nextPlan ? startPlan(nextPlan) : session.match,
    finishedAt: nextPlan ? null : now,
  };
}

export function setPaused(session: Session, paused: boolean, now: number): Session {
  if (paused === session.paused) return session;
  if (paused) return { ...session, paused: true, pausedAt: now };
  return {
    ...session,
    paused: false,
    pausedAt: null,
    pausedMs: session.pausedMs + (session.pausedAt === null ? 0 : now - session.pausedAt),
  };
}

function replace<T>(list: readonly T[], index: number, value: T): T[] {
  const copy = list.slice();
  copy[index] = value;
  return copy;
}

// ─── scoring ─────────────────────────────────────────────────────────────────

export interface Metrics {
  readonly elapsedMs: number;
  readonly keystrokes: number;
  readonly errors: number;
  /** Share of keystrokes that were legal, 0–1. */
  readonly accuracy: number;
  /** Kana per minute — how fast the kana stream is being produced. */
  readonly kanaPerMinute: number;
  /**
   * Characters per minute over the original text (原文字数/分), the figure the
   * Japanese typing exams quote. Counts source characters, so kanji-dense text
   * scores higher per keystroke than kana-dense text.
   */
  readonly charsPerMinute: number;
  /** Keystrokes per minute, for comparison with latin-alphabet WPM figures. */
  readonly keysPerMinute: number;
  readonly tokensDone: number;
}

export function metrics(session: Session, now: number): Metrics {
  const end = session.finishedAt ?? (session.paused ? (session.pausedAt ?? now) : now);
  const elapsedMs = session.startedAt === null ? 0 : Math.max(0, end - session.startedAt - session.pausedMs);
  const minutes = elapsedMs / 60000;

  let keystrokes = 0;
  let errors = 0;
  let kana = 0;
  let chars = 0;
  let tokensDone = 0;
  for (let i = 0; i < session.stats.length; i++) {
    const s = session.stats[i]!;
    keystrokes += s.keystrokes;
    errors += s.errors;
    if (s.done) {
      tokensDone++;
      kana += session.plans[i]?.kana.length ?? 0;
      chars += session.tokens[i]?.surface.length ?? 0;
    }
  }

  return {
    elapsedMs,
    keystrokes,
    errors,
    accuracy: keystrokes === 0 ? 1 : (keystrokes - errors) / keystrokes,
    kanaPerMinute: minutes > 0 ? kana / minutes : 0,
    charsPerMinute: minutes > 0 ? chars / minutes : 0,
    keysPerMinute: minutes > 0 ? keystrokes / minutes : 0,
    tokensDone,
  };
}
