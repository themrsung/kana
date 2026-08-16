import { describe, expect, it } from 'vitest';
import { ROMAJI_TABLE } from './table';
import {
  allSpellings,
  buildRomajiPlan,
  expectation,
  feed,
  startMatch,
  toHiragana,
  type RomajiMatch,
  type RomajiPlan,
} from './matcher';

/** Type a whole string, returning the final match and the indices that were rejected. */
function typeAll(plan: RomajiPlan, input: string): { match: RomajiMatch; rejectedAt: number[] } {
  let match = startMatch(plan);
  const rejectedAt: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const r = feed(plan, match, input[i]!);
    if (!r.accepted) rejectedAt.push(i);
    match = r.match;
  }
  return { match, rejectedAt };
}

function accepts(kana: string, input: string): boolean {
  const plan = buildRomajiPlan(kana);
  const { match, rejectedAt } = typeAll(plan, input);
  return rejectedAt.length === 0 && match.done;
}

describe('table integrity', () => {
  it('never maps one spelling to two different kana', () => {
    const seen = new Map<string, string>();
    const conflicts: string[] = [];
    for (const { romaji, kana } of ROMAJI_TABLE) {
      const prev = seen.get(romaji);
      if (prev !== undefined && prev !== kana) conflicts.push(`${romaji} → ${prev} / ${kana}`);
      seen.set(romaji, kana);
    }
    expect(conflicts).toEqual([]);
  });

  it('only ever emits kana, never latin', () => {
    for (const { romaji, kana } of ROMAJI_TABLE) {
      expect(kana, romaji).not.toMatch(/[a-z]/i);
    }
  });
});

describe('toHiragana', () => {
  const table: readonly (readonly [string, string])[] = [
    ['トヨタ', 'とよた'],
    ['ヴィッツ', 'ゔぃっつ'],
    ['コーヒー', 'こーひー'],
    ['ジドウシャ', 'じどうしゃ'],
    ['もう混ざってる', 'もう混ざってる'],
    ['ABC 123', 'ABC 123'],
  ];
  for (const [input, want] of table) {
    it(`${input} → ${want}`, () => expect(toHiragana(input)).toBe(want));
  }
});

describe('shortest spelling', () => {
  const table: readonly (readonly [string, string])[] = [
    // basics
    ['あいうえお', 'aiueo'],
    ['かきくけこ', 'kakikukeko'],
    // Hepburn irregulars lose on length, but ji/fu win their same-length ties
    ['し', 'si'],
    ['ち', 'ti'],
    ['つ', 'tu'],
    ['じ', 'ji'],
    ['ふ', 'fu'],
    // 拗音
    ['きょ', 'kyo'],
    ['しゃ', 'sya'],
    ['じゅ', 'ju'],
    ['ちょ', 'tyo'],
    // 促音
    ['がっこう', 'gakkou'],
    ['きって', 'kitte'],
    ['あっ', 'axtu'],
    ['ざっし', 'zassi'],
    // 撥音
    ['しんぶん', 'sinbun'],
    ['こんにちは', 'konnitiha'],
    ['しんや', 'sinnya'],
    ['ほん', 'hon'],
    // long vowel + katakana normalisation
    ['コーヒー', 'ko-hi-'],
    ['トヨタ', 'toyota'],
    ['ヴィッツ', 'vittu'],
    // を and punctuation
    ['を', 'wo'],
    ['、', ','],
    ['。', '.'],
    ['「」', '[]'],
    // real tokens from the corpus
    ['じどうしゃ', 'jidousya'],
    ['とうきょう', 'toukyou'],
    ['かぶしきがいしゃ', 'kabusikigaisya'],
  ];
  for (const [kana, want] of table) {
    it(`${kana} → ${want}`, () => expect(buildRomajiPlan(kana).shortest).toBe(want));
  }
});

describe('accepts every valid spelling', () => {
  const table: readonly (readonly [string, readonly string[]])[] = [
    ['し', ['si', 'shi', 'ci']],
    ['ち', ['ti', 'chi']],
    ['つ', ['tu', 'tsu']],
    ['ふ', ['hu', 'fu']],
    ['じ', ['zi', 'ji']],
    ['しゃ', ['sya', 'sha', 'sixya', 'silya', 'shixya']],
    ['じゃ', ['ja', 'jya', 'zya', 'jixya']],
    ['きゃ', ['kya', 'kixya', 'kilya']],
    ['っ', ['xtu', 'ltu', 'xtsu', 'ltsu']],
    ['がっこう', ['gakkou', 'gaxtukou', 'galtukou']],
    ['ほん', ['hon', 'honn', "hon'", 'hoxn']],
    ['しんや', ['sinnya', "sin'ya", 'shinnya', 'sixnya']],
    ['ん', ['nn', "n'", 'xn', 'n']],
    ['を', ['wo']],
    ['ヴィッツ', ['vittu', 'vittsu', 'vixtutu', 'viltutsu']],
    ['ー', ['-']],
    ['ぁ', ['xa', 'la']],
  ];
  for (const [kana, spellings] of table) {
    for (const s of spellings) {
      it(`${kana} accepts ${s}`, () => expect(accepts(kana, s)).toBe(true));
    }
  }
});

describe('rejects invalid spellings', () => {
  const table: readonly (readonly [string, string])[] = [
    // bare n before a vowel would read as な行
    ['んあ', 'na'],
    ['んい', 'ni'],
    // …and before や行 it would read as にゃ
    ['んや', 'nya'],
    // 促音 never doubles n — `nna` is ん+な
    ['っな', 'nna'],
    // wrong vowel / wrong consonant
    ['き', 'ka'],
    ['さ', 'sha'],
    // し is not `su`
    ['し', 'su'],
    // ゃ is not や
    ['きゃ', 'kiya'],
  ];
  for (const [kana, input] of table) {
    it(`${kana} rejects ${input}`, () => expect(accepts(kana, input)).toBe(false));
  }
});

describe('bare n context rules', () => {
  it('allows bare n before a consonant', () => expect(accepts('しんぶん', 'sinbun')).toBe(true));
  it('allows bare n at the end', () => expect(accepts('ほん', 'hon')).toBe(true));
  it('allows bare n before な行 by default', () => expect(accepts('こんにちは', 'konnitiha')).toBe(true));
  it('also accepts the fully spelled form', () => expect(accepts('こんにちは', 'konnnitiha')).toBe(true));
  it('accepts the apostrophe form', () => expect(accepts('こんにちは', "kon'nitiha")).toBe(true));

  it('strictN forbids bare n before な行', () => {
    const plan = buildRomajiPlan('こんにちは', { strictN: true });
    expect(typeAll(plan, 'konnitiha').rejectedAt.length).toBeGreaterThan(0);
    expect(typeAll(plan, 'konnnitiha').rejectedAt).toEqual([]);
    expect(plan.shortest).toBe('konnnitiha');
  });
});

describe('incremental matching', () => {
  it('keeps ambiguous readings alive so both spellings survive', () => {
    // んか: `n` resolves ん immediately, but `nn` must also work.
    const plan = buildRomajiPlan('んか');
    expect(typeAll(plan, 'nka').rejectedAt).toEqual([]);
    expect(typeAll(plan, 'nnka').rejectedAt).toEqual([]);
    expect(typeAll(plan, 'nka').match.done).toBe(true);
    expect(typeAll(plan, 'nnka').match.done).toBe(true);
  });

  it('a rejected keystroke does not advance the cursor', () => {
    const plan = buildRomajiPlan('とうきょう');
    let match = startMatch(plan);
    match = feed(plan, match, 't').match;
    const before = feed(plan, match, 'o').match;
    const bad = feed(plan, before, 'z');
    expect(bad.accepted).toBe(false);
    expect(bad.match).toBe(before);
    expect(feed(plan, bad.match, 'u').accepted).toBe(true);
  });

  it('reports progress as kana are completed', () => {
    const plan = buildRomajiPlan('とうきょう');
    let match = startMatch(plan);
    expect(match.reached).toBe(0);
    for (const ch of 'to') match = feed(plan, match, ch).match;
    expect(match.reached).toBe(1);
    for (const ch of 'u') match = feed(plan, match, ch).match;
    expect(match.reached).toBe(2);
    for (const ch of 'kyo') match = feed(plan, match, ch).match;
    expect(match.reached).toBe(4); // きょ is two kana
    expect(match.done).toBe(false);
    match = feed(plan, match, 'u').match;
    expect(match.done).toBe(true);
  });

  it('does not report done until the last kana lands', () => {
    const plan = buildRomajiPlan('がっこう');
    let match = startMatch(plan);
    for (const ch of 'gakko') match = feed(plan, match, ch).match;
    expect(match.done).toBe(false);
    match = feed(plan, match, 'u').match;
    expect(match.done).toBe(true);
  });
});

describe('expectation', () => {
  it('points at the next key on the shortest path', () => {
    const plan = buildRomajiPlan('がっこう');
    let match = startMatch(plan);
    expect(expectation(plan, match).preferred).toBe('g');
    expect(expectation(plan, match).remaining).toBe('gakkou');
    for (const ch of 'ga') match = feed(plan, match, ch).match;
    const e = expectation(plan, match);
    expect(e.preferred).toBe('k'); // the doubled consonant, not `x`
    expect(e.remaining).toBe('kkou');
    expect(e.accepted.has('x')).toBe(true); // …but xtu is still allowed
    expect(e.accepted.has('l')).toBe(true);
  });

  it('offers every legal first key', () => {
    const plan = buildRomajiPlan('し');
    const e = expectation(plan, startMatch(plan));
    expect([...e.accepted].sort()).toEqual(['c', 's']);
  });
});

describe('allSpellings', () => {
  it('lists shortest first', () => {
    const plan = buildRomajiPlan('じゃ');
    const all = allSpellings(plan);
    expect(all[0]).toBe('ja');
    expect(all).toContain('zya');
    expect(all).toContain('jya');
  });
});

describe('non-kana passthrough', () => {
  it('types latin and digits literally', () => {
    const plan = buildRomajiPlan('GR86');
    expect(plan.shortest).toBe('GR86');
    expect(accepts('GR86', 'GR86')).toBe(true);
  });

  it('mixes latin into kana', () => {
    expect(buildRomajiPlan('EVとハイブリッド').shortest).toBe('EVtohaiburiddo');
  });
});
