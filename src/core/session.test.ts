import { describe, expect, it } from 'vitest';
import { applyKey, createSession, isFinished, metrics, setPaused, skipToken, type Session, type Token } from './session';

const TOKENS: readonly Token[] = [
  { surface: '東京', reading: 'トウキョウ' },
  { surface: 'は', reading: 'ハ' },
  { surface: '晴れ', reading: 'ハレ' },
];

/** Type a string into a session, one keystroke per millisecond. */
function type(session: Session, input: string, startAt = 1000): Session {
  let s = session;
  for (let i = 0; i < input.length; i++) s = applyKey(s, input[i]!, startAt + i);
  return s;
}

describe('session progression', () => {
  it('advances token by token', () => {
    let s = createSession(TOKENS);
    expect(s.index).toBe(0);
    s = type(s, 'toukyou');
    expect(s.index).toBe(1);
    s = type(s, 'ha', 2000);
    expect(s.index).toBe(2);
    s = type(s, 'hare', 3000);
    expect(isFinished(s)).toBe(true);
    expect(s.finishedAt).toBe(3003);
  });

  it('accepts any valid spelling per token', () => {
    let s = createSession(TOKENS);
    s = type(s, 'toukilyou'); // きょ spelled out longhand
    expect(s.index).toBe(1);
    expect(s.stats[0]!.errors).toBe(0);
  });

  it('counts wrong keys without advancing', () => {
    let s = createSession(TOKENS);
    s = type(s, 'tqqou');
    expect(s.stats[0]!.errors).toBe(2);
    expect(s.stats[0]!.keystrokes).toBe(5);
    expect(s.index).toBe(0);
    expect(s.heatmap).toEqual({ q: 2 });
  });

  it('records per-token time from first keystroke to completion', () => {
    let s = createSession(TOKENS);
    s = type(s, 'toukyou', 1000); // 7 keys at 1ms apart → completes at 1006
    expect(s.stats[0]!.ms).toBe(6);
    expect(s.stats[0]!.done).toBe(true);
  });

  it('ignores input once finished', () => {
    let s = createSession(TOKENS);
    s = type(s, 'toukyou');
    s = type(s, 'ha', 2000);
    s = type(s, 'hare', 3000);
    const after = applyKey(s, 'x', 9999);
    expect(after).toBe(s);
  });
});

describe('skip and pause', () => {
  it('skips a token without marking it done', () => {
    let s = createSession(TOKENS);
    s = skipToken(s, 500);
    expect(s.index).toBe(1);
    expect(s.stats[0]!.done).toBe(false);
    expect(metrics(s, 500).tokensDone).toBe(0);
  });

  it('drops keystrokes while paused', () => {
    let s = createSession(TOKENS);
    s = type(s, 'to');
    s = setPaused(s, true, 2000);
    const during = applyKey(s, 'u', 2500);
    expect(during).toBe(s);
    s = setPaused(s, false, 5000);
    expect(s.pausedMs).toBe(3000);
    s = type(s, 'ukyou', 5000);
    expect(s.index).toBe(1);
  });

  it('excludes paused time from elapsed', () => {
    let s = createSession(TOKENS);
    s = type(s, 'toukyou', 1000); // starts at 1000, ends 1006
    s = setPaused(s, true, 2000);
    s = setPaused(s, false, 12000);
    expect(metrics(s, 13000).elapsedMs).toBe(13000 - 1000 - 10000);
  });
});

describe('metrics', () => {
  it('is empty before the first keystroke', () => {
    const m = metrics(createSession(TOKENS), 1000);
    expect(m).toMatchObject({ elapsedMs: 0, keystrokes: 0, errors: 0, accuracy: 1, kanaPerMinute: 0 });
  });

  it('scores accuracy over all keystrokes', () => {
    let s = createSession(TOKENS);
    s = type(s, 'tqoukyou'); // 1 bad key out of 8
    expect(s.index).toBe(1);
    expect(metrics(s, 2000).accuracy).toBeCloseTo(7 / 8);
  });

  it('counts kana and source characters separately', () => {
    let s = createSession(TOKENS);
    // 東京 = 2 source chars, トウキョウ = 5 kana. Finish it in exactly 6 seconds.
    s = applyKey(s, 't', 0);
    for (const [i, ch] of [...'oukyou'].entries()) s = applyKey(s, ch, 1000 * (i + 1));
    const m = metrics(s, 6000);
    expect(m.elapsedMs).toBe(6000);
    expect(m.kanaPerMinute).toBeCloseTo(50); // 5 kana in 0.1 min
    expect(m.charsPerMinute).toBeCloseTo(20); // 2 chars in 0.1 min
    expect(m.keysPerMinute).toBeCloseTo(70); // 7 keys in 0.1 min
  });

  it('does not credit an unfinished token', () => {
    let s = createSession(TOKENS);
    s = type(s, 'touk');
    expect(metrics(s, 2000).tokensDone).toBe(0);
    expect(metrics(s, 2000).kanaPerMinute).toBe(0);
  });
});
