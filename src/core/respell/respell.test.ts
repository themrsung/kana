import { describe, expect, it } from 'vitest';
import { decompose, moras } from './mora';
import { toEnglish } from './english';
import { toHangul } from './hangul';
import { toSpanish } from './spanish';
import { SCHEMES, schemeById } from './index';

describe('mora decomposition', () => {
  it('folds length, gemination and ん into the syllable that carries them', () => {
    expect(decompose('がっこう')).toEqual([
      { kind: 'syllable', kana: 'が', onset: 'g', vowel: 'a', glide: false, geminate: false, long: false, coda: false },
      { kind: 'syllable', kana: 'こう', onset: 'k', vowel: 'o', glide: false, geminate: true, long: true, coda: false },
    ]);
    expect(decompose('せんせい').map((m) => m.kana)).toEqual(['せん', 'せ', 'い']);
  });

  it('still counts them as real morae', () => {
    expect(moras(decompose('がっこう'))).toBe(4);   // が っ こ う
    expect(moras(decompose('とうきょう'))).toBe(4); // と う きょ う - きょ is one mora
    expect(moras(decompose('せんせい'))).toBe(4);
    expect(moras(decompose('とよた'))).toBe(3);
  });

  it('keeps a phonetic onset, so てぃ and ち stay apart', () => {
    const [chi] = decompose('ち');
    const [ti] = decompose('てぃ');
    expect(chi).toMatchObject({ onset: 'ch', vowel: 'i' });
    expect(ti).toMatchObject({ onset: 't', vowel: 'i' });
  });

  it('marks the y-glide only where the palatal is not already in the onset', () => {
    expect(decompose('きゃ')[0]).toMatchObject({ onset: 'k', vowel: 'a', glide: true });
    expect(decompose('しゃ')[0]).toMatchObject({ onset: 'sh', vowel: 'a', glide: false });
    expect(decompose('ちゃ')[0]).toMatchObject({ onset: 'ch', vowel: 'a', glide: false });
    expect(decompose('じゃ')[0]).toMatchObject({ onset: 'j', vowel: 'a', glide: false });
  });

  it('merges ぢ into じ and づ into ず', () => {
    expect(decompose('ぢ')[0]).toMatchObject({ onset: 'j', vowel: 'i' });
    expect(decompose('づ')[0]).toMatchObject({ onset: 'z', vowel: 'u' });
  });

  it('lengthens only where the following vowel really is length', () => {
    const long = (s: string) => decompose(s)[0]!;
    expect(long('こう')).toMatchObject({ long: true });   // ou
    expect(long('くう')).toMatchObject({ long: true });   // uu
    expect(long('こお')).toMatchObject({ long: true });   // oo
    expect(long('かあ')).toMatchObject({ long: true });
    expect(long('かー')).toMatchObject({ long: true });
    // ei is two morae, not a long e - every scheme here writes both vowels.
    expect(decompose('せい').map((m) => m.kana)).toEqual(['せ', 'い']);
    // and a vowel that does not lengthen just starts its own mora
    expect(decompose('かい').map((m) => m.kana)).toEqual(['か', 'い']);
  });

  it('normalises katakana readings before doing anything else', () => {
    expect(decompose('トヨタ')).toEqual(decompose('とよた'));
    expect(toHangul('トヨタ')).toBe(toHangul('とよた'));
  });

  it('accepts the foreign-sound clusters that real readings contain', () => {
    expect(decompose('ふぉ')[0]).toMatchObject({ onset: 'f', vowel: 'o' });
    expect(decompose('ゔぃ')[0]).toMatchObject({ onset: 'v', vowel: 'i' });
    expect(decompose('つぁ')[0]).toMatchObject({ onset: 'ts', vowel: 'a' });
    expect(decompose('じぇ')[0]).toMatchObject({ onset: 'j', vowel: 'e' });
  });

  it('passes non-kana through untouched', () => {
    expect(decompose('、')).toEqual([{ kind: 'literal', kana: '、' }]);
    expect(decompose('GR86').map((m) => m.kana).join('')).toBe('GR86');
  });

  it('handles ん and っ with nothing to attach to', () => {
    expect(decompose('ん')).toEqual([{ kind: 'standalone', kana: 'ん', sound: 'n' }]);
    expect(decompose('あっ').map((m) => m.kind)).toEqual(['syllable', 'standalone']);
  });
});

describe('hangul (외래어 표기법)', () => {
  it('제1항: っ is a ㅅ 받침', () => {
    const table: readonly (readonly [string, string])[] = [
      ['がっこう', '갓코'],
      ['にっぽん', '닛폰'],
      ['きって', '깃테'],
      ['さっぽろ', '삿포로'],
    ];
    for (const [kana, want] of table) it0(kana, want);
  });

  it('제2항: long vowels are not written', () => {
    const table: readonly (readonly [string, string])[] = [
      ['とうきょう', '도쿄'],
      ['おおさか', '오사카'],
      ['きゅうしゅう', '규슈'],
      ['ゆうびん', '유빈'],
    ];
    for (const [kana, want] of table) it0(kana, want);
  });

  it('제3항: か行 and た行 are 평음 initially, 격음 elsewhere', () => {
    const table: readonly (readonly [string, string])[] = [
      ['かたかな', '가타카나'],
      ['たなか', '다나카'],
      ['きたきゅうしゅう', '기타큐슈'],
      ['ちば', '지바'],
      ['こうち', '고치'],
    ];
    for (const [kana, want] of table) it0(kana, want);
  });

  it('が行 and ぱ行 do not alternate by position', () => {
    it0('ぎふ', '기후');
    it0('なごや', '나고야');
    it0('ぱん', '판');
  });

  it('writes ん as a ㄴ 받침', () => {
    it0('せんせい', '센세이');
    it0('しんぶん', '신분');
    it0('あんない', '안나이');
  });

  it('respells the corpus tokens', () => {
    it0('とよた', '도요타');
    it0('じどうしゃ', '지도샤');
    it0('かぶしきがいしゃ', '가부시키가이샤');
    it0('しょうけん', '쇼켄');
    it0('とりひきじょ', '도리히키조');
    it0('じょうじょう', '조조');
  });

  it('keeps punctuation and restarts the word-initial rule after it', () => {
    expect(toHangul('とうきょう、きょうと')).toBe('도쿄、교토');
  });
});

/** Local helper so each hangul row reports its own kana on failure. */
function it0(kana: string, want: string): void {
  expect(toHangul(kana), `${kana} -> ${want}`).toBe(want);
}

describe('english respelling', () => {
  const table: readonly (readonly [string, string])[] = [
    ['とよた', 'toh-yoh-tah'],
    ['じどうしゃ', 'jee-dohh-shah'],
    ['がっこう', 'gahk-kohh'],
    ['せんせい', 'sehn-seh-ee'],
    ['とうきょう', 'tohh-kyohh'],
    ['きって', 'keet-teh'],
    ['まっちゃ', 'maht-chah'],   // English spells a held affricate -tch-
    ['にほん', 'nee-hohn'],
    ['ふじさん', 'foo-jee-sahn'],
    ['おじさん', 'oh-jee-sahn'],
    ['おじいさん', 'oh-jeee-sahn'], // length is phonemic: a different word
  ];
  for (const [kana, want] of table) {
    it(`${kana} -> ${want}`, () => expect(toEnglish(kana)).toBe(want));
  }

  it('keeps the length contrast that the short forms would lose', () => {
    expect(toEnglish('おじさん')).not.toBe(toEnglish('おじいさん'));
    expect(toEnglish('こうこう')).not.toBe(toEnglish('ここ'));
  });
});

describe('spanish respelling', () => {
  const table: readonly (readonly [string, string])[] = [
    ['とよた', 'toyota'],
    ['じどうしゃ', 'yidoosha'],
    ['かぶしきがいしゃ', 'kabushikigaisha'],
    ['とうきょう', 'tookioo'],
    ['がっこう', 'gakkoo'],
    ['にほん', 'nijon'],           // は行 -> j, since Spanish h is silent
    ['にゃんこ', 'ñanko'],          // ñ is exactly [ɲ]
    ['ぎんこう', 'guinkoo'],        // gu keeps [g] before a front vowel
    ['ちゃわん', 'chauan'],
    ['きょうと', 'kiooto'],         // glide is i, not y
  ];
  for (const [kana, want] of table) {
    it(`${kana} -> ${want}`, () => expect(toSpanish(kana)).toBe(want));
  }

  it('spells が行 so Spanish reads it as [g] throughout', () => {
    expect(toSpanish('ぎ')).toBe('gui');
    expect(toSpanish('げ')).toBe('gue');
    expect(toSpanish('ぐ')).toBe('gu');
    expect(toSpanish('ぎゃ')).toBe('guia');
  });

  it('merges ざ行 into さ行, the one contrast Spanish cannot hold', () => {
    expect(toSpanish('ざ')).toBe(toSpanish('さ'));
  });
});

describe('scheme registry', () => {
  it('romaji reuses the input engine, so the hint is the keystrokes', () => {
    expect(schemeById('romaji').respell('とうきょう')).toBe('toukyou');
    expect(schemeById('romaji').respell('がっこう')).toBe('gakkou');
  });

  it('every scheme is total over the corpus and never returns empty', () => {
    const readings = [
      'とよた', 'じどうしゃ', 'かぶしきがいしゃ', 'は', 'とうきょう', 'しょうけん',
      'とりひきじょ', 'に', 'じょうじょう', 'し', 'て', 'いる',
    ];
    for (const scheme of SCHEMES) {
      for (const reading of readings) {
        const out = scheme.respell(reading);
        expect(out, `${scheme.id} / ${reading}`).toBeTruthy();
      }
    }
  });

  it('never leaks raw kana into a respelling', () => {
    for (const scheme of SCHEMES) {
      if (scheme.id === 'hangul') continue; // hangul is not latin by design
      expect(scheme.respell('かぶしきがいしゃ')).not.toMatch(/[぀-ヿ]/);
    }
    expect(toHangul('かぶしきがいしゃ')).not.toMatch(/[぀-ヿ]/);
  });
});
