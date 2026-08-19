import { describe, expect, it } from 'vitest';
import {
  BOARD_ROWS,
  boardHasCode,
  DAKUTEN,
  engravingFor,
  HANDAKUTEN,
  KANA_KEYS,
  kanaFor,
  keyForKana,
  unreachableKana,
  type Board,
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
  // Per board, not globally: ー and ろ are deliberately on two keys across the pair,
  // the real JIS ones and the ANSI overflow key. Only a clash *within* one board is a bug.
  it('never puts one kana on two different keys of the same board', () => {
    const conflicts: string[] = [];
    for (const board of ['jis', 'ansi'] as const) {
      const seen = new Map<string, string>();
      for (const key of KANA_KEYS) {
        if (!boardHasCode(board, key.code)) continue;
        for (const kana of [key.plain, key.shifted]) {
          if (!kana) continue;
          const prev = seen.get(kana);
          if (prev !== undefined) conflicts.push(`${board} ${kana}: ${prev} / ${key.code}`);
          seen.set(kana, key.code);
        }
      }
    }
    expect(conflicts).toEqual([]);
  });

  it('round-trips every kana back to the key that makes it', () => {
    for (const board of ['jis', 'ansi'] as const) {
      for (const key of KANA_KEYS) {
        if (!boardHasCode(board, key.code)) continue;
        expect(keyForKana(board, key.plain)).toEqual({ code: key.code, shift: false });
        if (key.shifted) {
          expect(keyForKana(board, key.shifted)).toEqual({ code: key.code, shift: true });
        }
      }
    }
  });

  it('reads keys off event.code, both layers', () => {
    expect(kanaFor('jis', 'KeyT', false)).toBe('か');
    expect(kanaFor('jis', 'KeyZ', false)).toBe('つ');
    expect(kanaFor('jis', 'KeyZ', true)).toBe('っ');
    expect(kanaFor('jis', 'Digit0', false)).toBe('わ');
    expect(kanaFor('jis', 'Digit0', true)).toBe('を');
    expect(kanaFor('jis', 'BracketLeft', false)).toBe(DAKUTEN);
    expect(kanaFor('jis', 'BracketRight', false)).toBe(HANDAKUTEN);
    expect(kanaFor('jis', 'BracketRight', true)).toBe('「');
    expect(kanaFor('jis', 'Backslash', false)).toBe('む');
    expect(kanaFor('jis', 'Backslash', true)).toBe('」');
    expect(kanaFor('jis', 'IntlYen', false)).toBe('ー');
    expect(kanaFor('jis', 'IntlRo', false)).toBe('ろ');
  });

  it('has no shift layer where JIS has none', () => {
    expect(kanaFor('jis', 'Digit1', true)).toBeNull();
    expect(kanaFor('jis', 'KeyT', true)).toBeNull();
  });

  it('leaves neither board missing a kana', () => {
    expect(unreachableKana('jis')).toEqual([]);
    expect(unreachableKana('ansi')).toEqual([]);
  });

  // The whole point of the backtick: ー and ろ are on keys ANSI does not have, so they
  // fold onto the one key in its alphanumeric block that carries no kana.
  it('reaches ー and ろ on ANSI through the overflow key, and on JIS through the real ones', () => {
    expect(keyForKana('ansi', 'ー')).toEqual({ code: 'Backquote', shift: false });
    expect(keyForKana('ansi', 'ろ')).toEqual({ code: 'Backquote', shift: true });
    expect(keyForKana('jis', 'ー')).toEqual({ code: 'IntlYen', shift: false });
    expect(keyForKana('jis', 'ろ')).toEqual({ code: 'IntlRo', shift: false });

    expect(kanaFor('ansi', 'Backquote', false)).toBe('ー');
    expect(kanaFor('ansi', 'Backquote', true)).toBe('ろ');
  });

  // A board only answers for switches it actually has, in both directions.
  it('is deaf to keys the board does not have', () => {
    expect(kanaFor('ansi', 'IntlYen', false)).toBeNull();
    expect(kanaFor('ansi', 'IntlRo', false)).toBeNull();
    // 半角/全角 sits here on a real JIS board, and it is not a kana key.
    expect(kanaFor('jis', 'Backquote', false)).toBeNull();
    expect(kanaFor('jis', 'Backquote', true)).toBeNull();
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
      if (!boardHasCode('ansi', key.code)) continue;
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

  // Each board draws exactly the keys it has - no more, so nothing unreachable is
  // painted, and no fewer, so nothing typeable is missing from the picture.
  it('draws exactly the keys each board has', () => {
    for (const board of ['jis', 'ansi'] as const) {
      const drawn = new Set(BOARD_ROWS[board].flat());
      const has = new Set(KANA_KEYS.filter((k) => boardHasCode(board, k.code)).map((k) => k.code));
      expect(drawn).toEqual(has);
    }
    expect(new Set(BOARD_ROWS.jis.flat())).not.toContain('Backquote');
    expect(new Set(BOARD_ROWS.ansi.flat())).toContain('Backquote');
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
    expect(keyForKana('jis', 'ヶ')).toEqual({ code: 'Quote', shift: true });
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
  // These two used to assert that ー and ろ were untypable on a MacBook Air. The
  // backtick overflow key is precisely the fix for that, so the assertions inverted:
  // what is worth pinning now is that the kana arrives on a *different key*.
  it('types ー on both boards, from different keys', () => {
    expect(unreachableInPlan(buildKanaPlan('コーヒー', 'ansi'), 'ansi')).toEqual([]);
    expect(unreachableInPlan(buildKanaPlan('コーヒー', 'jis'), 'jis')).toEqual([]);

    const press = (board: Board) =>
      buildKanaPlan('コーヒー', board).steps.find((s) => s.char === 'ー')?.press;
    expect(press('ansi')).toEqual({ code: 'Backquote', shift: false });
    expect(press('jis')).toEqual({ code: 'IntlYen', shift: false });
  });

  it('types ろ on both boards, from different keys', () => {
    expect(unreachableInPlan(buildKanaPlan('ろく', 'ansi'), 'ansi')).toEqual([]);
    expect(buildKanaPlan('ろく', 'ansi').steps[0]!.press).toEqual({
      code: 'Backquote',
      shift: true,
    });
    expect(buildKanaPlan('ろく', 'jis').steps[0]!.press).toEqual({
      code: 'IntlRo',
      shift: false,
    });
  });

  it('says nothing about kana both boards can type', () => {
    expect(unreachableInPlan(buildKanaPlan('がっこう', 'ansi'), 'ansi')).toEqual([]);
  });

  // The guard still has to resolve against the board rather than trust the key already
  // baked into the plan - otherwise a JIS plan carrying IntlRo would look broken on ANSI.
  it('re-resolves a plan built for the other board instead of trusting its keys', () => {
    const jisPlan = buildKanaPlan('ろく', 'jis');
    expect(jisPlan.steps[0]!.press).toEqual({ code: 'IntlRo', shift: false });
    expect(unreachableInPlan(jisPlan, 'ansi')).toEqual([]);
  });
});
