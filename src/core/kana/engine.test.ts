import { describe, expect, it } from 'vitest';
import {
  BOARD_ROWS,
  DAKUTEN,
  engravingFor,
  HANDAKUTEN,
  KANA_KEYS,
  kanaFor,
  keyForKana,
  unreachableKana,
} from './layout';
import {
  buildKanaPlan,
  feedKana,
  kanaExpectation,
  startKanaMatch,
  startKanaMatch as start,
  unreachableInPlan,
  type KanaMatch,
  type KanaPlan,
} from './engine';

/** Type a whole string of emitted characters, returning the match and the rejections. */
function typeAll(plan: KanaPlan, input: string): { match: KanaMatch; rejectedAt: number[] } {
  let match = startKanaMatch(plan);
  const rejectedAt: number[] = [];
  const chars = [...input];
  for (let i = 0; i < chars.length; i++) {
    const r = feedKana(plan, match, chars[i]!);
    if (!r.accepted) rejectedAt.push(i);
    match = r.match;
  }
  return { match, rejectedAt };
}

describe('layout integrity', () => {
  it('never puts one kana on two different keys', () => {
    const seen = new Map<string, string>();
    const conflicts: string[] = [];
    for (const key of KANA_KEYS) {
      for (const kana of [key.plain, key.shifted]) {
        if (!kana) continue;
        const prev = seen.get(kana);
        if (prev !== undefined) conflicts.push(`${kana}: ${prev} / ${key.code}`);
        seen.set(kana, key.code);
      }
    }
    expect(conflicts).toEqual([]);
  });

  it('round-trips every kana back to the key that makes it', () => {
    for (const key of KANA_KEYS) {
      expect(keyForKana(key.plain)).toEqual({ code: key.code, shift: false });
      if (key.shifted) expect(keyForKana(key.shifted)).toEqual({ code: key.code, shift: true });
    }
  });

  it('reads keys off event.code, both layers', () => {
    expect(kanaFor('KeyT', false)).toBe('か');
    expect(kanaFor('KeyZ', false)).toBe('つ');
    expect(kanaFor('KeyZ', true)).toBe('っ');
    expect(kanaFor('Digit0', false)).toBe('わ');
    expect(kanaFor('Digit0', true)).toBe('を');
    expect(kanaFor('BracketLeft', false)).toBe(DAKUTEN);
    expect(kanaFor('BracketRight', false)).toBe(HANDAKUTEN);
    expect(kanaFor('BracketRight', true)).toBe('「');
    expect(kanaFor('Backslash', false)).toBe('む');
    expect(kanaFor('Backslash', true)).toBe('」');
    expect(kanaFor('IntlYen', false)).toBe('ー');
    expect(kanaFor('IntlRo', false)).toBe('ろ');
  });

  it('has no shift layer where JIS has none', () => {
    expect(kanaFor('Digit1', true)).toBeNull();
    expect(kanaFor('KeyT', true)).toBeNull();
  });

  it('loses exactly ー and ろ on a US-ANSI board', () => {
    expect(unreachableKana('jis')).toEqual([]);
    expect(unreachableKana('ansi')).toEqual(['ー', 'ろ']);
  });

  it('engraves the ANSI board in katakana and the JIS board in hiragana', () => {
    for (const key of KANA_KEYS) {
      for (const kana of [key.plain, key.shifted]) {
        if (!kana) continue;
        expect(engravingFor('jis', kana)).toBe(kana);
      }
    }
    expect(engravingFor('ansi', 'あ')).toBe('ア');
    expect(engravingFor('ansi', 'ヶ')).toBe('ヶ');
    // Marks and punctuation are script-neutral and must survive untouched.
    expect(engravingFor('ansi', DAKUTEN)).toBe(DAKUTEN);
    expect(engravingFor('ansi', HANDAKUTEN)).toBe(HANDAKUTEN);
    expect(engravingFor('ansi', '「」、。・ー')).toBe('「」、。・ー');
  });

  it('keeps every ANSI keycap distinct once folded to katakana', () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const key of KANA_KEYS) {
      for (const kana of [key.plain, key.shifted]) {
        if (!kana) continue;
        const cap = engravingFor('ansi', kana);
        const prev = seen.get(cap);
        if (prev !== undefined) collisions.push(`${cap}: ${prev} / ${key.code}`);
        seen.set(cap, key.code);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('draws every kana key on both boards, minus the two ANSI is missing', () => {
    const drawn = (board: 'jis' | 'ansi') => new Set(BOARD_ROWS[board].flat());
    const all = new Set(KANA_KEYS.map((k) => k.code));
    expect(drawn('jis')).toEqual(all);
    expect(drawn('ansi')).toEqual(new Set([...all].filter((c) => c !== 'IntlYen' && c !== 'IntlRo')));
  });
});

describe('keystroke sequences', () => {
  const table: readonly (readonly [string, string])[] = [
    // voicing is always a separate keystroke
    ['がっこう', 'か゛っこう'],
    ['ぱん', 'は゜ん'],
    ['ぢづ', 'ち゛つ゛'],
    ['ヴァイオリン', 'う゛ぁいおりん'],
    // katakana normalises, but ー stays a key of its own
    ['トヨタ', 'とよた'],
    ['コンピューター', 'こんひ゜ゅーたー'],
    ['じどうしゃ', 'し゛と゛うしゃ'],
    // punctuation lives on the shift layer
    ['「こんにちは」', '「こんにちは」'],
    ['、。・', '、。・'],
    // small kana
    ['ぁぃぅぇぉゃゅょっ', 'ぁぃぅぇぉゃゅょっ'],
  ];
  for (const [kana, keys] of table) {
    it(`${kana} → ${keys}`, () => expect(buildKanaPlan(kana).shortest).toBe(keys));
  }

  it('names the physical key for each step', () => {
    const plan = buildKanaPlan('が');
    expect(plan.steps.map((s) => s.press)).toEqual([
      { code: 'KeyT', shift: false },
      { code: 'BracketLeft', shift: false },
    ]);
  });

  it('folds ヵ and keeps ヶ, which has its own key', () => {
    expect(buildKanaPlan('ヶ').shortest).toBe('ヶ');
    expect(buildKanaPlan('ヵ').shortest).toBe('ヶ');
    expect(keyForKana('ヶ')).toEqual({ code: 'Quote', shift: true });
  });
});

describe('feeding keystrokes', () => {
  it('accepts the whole sequence and reports done only at the end', () => {
    const plan = buildKanaPlan('がっこう');
    const { match, rejectedAt } = typeAll(plan, 'か゛っこう');
    expect(rejectedAt).toEqual([]);
    expect(match.done).toBe(true);
  });

  it('rejects a keystroke without advancing the cursor', () => {
    const plan = buildKanaPlan('がっこう');
    let match = start(plan);
    match = feedKana(plan, match, 'か').match;
    const before = match;
    const bad = feedKana(plan, match, 'こ');
    expect(bad.accepted).toBe(false);
    expect(bad.match).toBe(before);
    expect(feedKana(plan, before, DAKUTEN).accepted).toBe(true);
  });

  it('will not accept a pre-composed kana in place of base + mark', () => {
    const plan = buildKanaPlan('がっこう');
    expect(feedKana(plan, start(plan), 'が').accepted).toBe(false);
  });

  it('holds the kana mid-composition between base and mark', () => {
    const plan = buildKanaPlan('がっこう');
    let match = start(plan);
    expect(match.settled).toBe(0);
    expect(match.reached).toBe(0);
    match = feedKana(plan, match, 'か').match;
    expect(match.settled).toBe(0); // が is not typed yet
    expect(match.reached).toBe(1); // ...but it is being composed
    match = feedKana(plan, match, DAKUTEN).match;
    expect(match.settled).toBe(1);
    expect(match.reached).toBe(1);
  });

  it('points at the next key, and at everything still owed', () => {
    const plan = buildKanaPlan('がっこう');
    let match = start(plan);
    let exp = kanaExpectation(plan, match);
    expect(exp.preferred).toBe('か');
    expect(exp.press).toEqual({ code: 'KeyT', shift: false });
    expect(exp.remaining).toBe('か゛っこう');
    match = feedKana(plan, match, 'か').match;
    exp = kanaExpectation(plan, match);
    expect(exp.preferred).toBe(DAKUTEN);
    expect(exp.press).toEqual({ code: 'BracketLeft', shift: false });
    expect(exp.remaining).toBe('゛っこう');
  });

  it('has nothing left to expect once done', () => {
    const plan = buildKanaPlan('こ');
    const { match } = typeAll(plan, 'こ');
    expect(kanaExpectation(plan, match).preferred).toBeNull();
    expect(kanaExpectation(plan, match).remaining).toBe('');
  });
});

describe('board reachability', () => {
  it('flags ー as untypable on a MacBook Air, but not on a JIS board', () => {
    const plan = buildKanaPlan('コーヒー');
    expect(unreachableInPlan(plan, 'ansi')).toEqual(['ー']);
    expect(unreachableInPlan(plan, 'jis')).toEqual([]);
  });

  it('flags ろ too', () => {
    const plan = buildKanaPlan('ろく');
    expect(unreachableInPlan(plan, 'ansi')).toEqual(['ろ']);
  });

  it('says nothing about kana both boards can type', () => {
    expect(unreachableInPlan(buildKanaPlan('がっこう'), 'ansi')).toEqual([]);
  });
});
