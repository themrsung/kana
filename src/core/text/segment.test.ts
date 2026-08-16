import { describe, expect, it } from 'vitest';
import type { Morpheme, Tokenize } from './tokenizer';
import {
  joinsLeft,
  segment,
  sentencesOf,
  splitParagraphs,
  splitSentences,
  takeTokens,
  toTokens,
} from './segment';

/**
 * Hand-written morphemes in kuromoji's shape. Every fixture below is what
 * IPADIC actually returns for that string - checked against the real
 * tokenizer once, then frozen here so these tests never load the dictionary.
 */
function m(surface: string, pos: string, detail = '*', reading?: string): Morpheme {
  return { surface_form: surface, pos, pos_detail_1: detail, reading };
}

const noun = (s: string, r?: string) => m(s, '名詞', '一般', r);
const digit = (s: string) => m(s, '名詞', '数', s);
const suffix = (s: string, r?: string) => m(s, '名詞', '接尾', r);
const prefix = (s: string, r?: string) => m(s, '接頭詞', '名詞接続', r);
const mark = (s: string) => m(s, '記号', '句点', s);

describe('paragraphs', () => {
  it('starts a new paragraph on a blank line', () => {
    expect(splitParagraphs('一段落目。\n\n二段落目。')).toEqual(['一段落目。', '二段落目。']);
  });

  it('joins a lone newline without inserting a space', () => {
    expect(splitParagraphs('折り返された\n一つの段落')).toEqual(['折り返された一つの段落']);
  });

  it('ignores blank runs and surrounding space', () => {
    expect(splitParagraphs('  あ  \n \n\n  い  ')).toEqual(['あ', 'い']);
    expect(splitParagraphs('\n\n')).toEqual([]);
  });
});

describe('sentences', () => {
  it('ends a sentence on Japanese and ASCII final punctuation', () => {
    expect(splitSentences('一文目です。二文目です！三文目です?')).toEqual([
      '一文目です。',
      '二文目です！',
      '三文目です?',
    ]);
  });

  it('keeps a closing bracket with the sentence it closes', () => {
    expect(splitSentences('「本当？」と言った。')).toEqual(['「本当？」', 'と言った。']);
  });

  it('treats a run of marks as one ending', () => {
    expect(splitSentences('えっ！？そうですか……はい。')).toEqual([
      'えっ！？',
      'そうですか……',
      'はい。',
    ]);
  });

  it('keeps a trailing fragment that never ends', () => {
    expect(splitSentences('見出しに句点はない')).toEqual(['見出しに句点はない']);
    expect(splitSentences('本文です。続きの断片')).toEqual(['本文です。', '続きの断片']);
  });

  it('does not split on a decimal point inside a number', () => {
    // 3.5% - the period is surrounded by digits, so it is not sentence-final.
    expect(splitSentences('前年比3.5%増です。')).toEqual(['前年比3.5%増です。']);
  });
});

describe('token merging', () => {
  it('glues a written-out number back into one token', () => {
    // 4兆7,955億円 comes back from IPADIC as seven morphemes.
    const tokens = toTokens([
      digit('4'),
      suffix('兆', 'チョウ'),
      digit('7'),
      m(',', '記号', '読点', ','),
      digit('955'),
      suffix('億', 'オク'),
      suffix('円', 'エン'),
    ]);
    expect(tokens).toEqual([{ surface: '4兆7,955億円', reading: '4チョウ7,955オクエン' }]);
  });

  it('only swallows a comma with numbers on both sides', () => {
    const tokens = toTokens([noun('東京', 'トウキョウ'), m('、', '記号', '読点', '、'), noun('大阪', 'オオサカ')]);
    expect(tokens.map((t) => t.surface)).toEqual(['東京', '、', '大阪']);
  });

  it('attaches counters and noun suffixes', () => {
    expect(toTokens([digit('2025'), suffix('年度', 'ネンド')])[0]!.surface).toBe('2025年度');
    expect(toTokens([noun('取引', 'トリヒキ'), suffix('所', 'ジョ')])[0]!.surface).toBe('取引所');
    expect(toTokens([noun('田中', 'タナカ'), suffix('さん', 'サン')])[0]!.surface).toBe('田中さん');
  });

  it('attaches a prefix to what follows it', () => {
    expect(toTokens([prefix('ご', 'ゴ'), noun('案内', 'アンナイ')])).toEqual([
      { surface: 'ご案内', reading: 'ゴアンナイ' },
    ]);
    expect(toTokens([prefix('約', 'ヤク'), digit('3000')])[0]!.surface).toBe('約3000');
  });

  it('leaves grammar alone - one morpheme is one token', () => {
    // 上場している: kuromoji splits this four ways and so does the app.
    const tokens = toTokens([
      noun('上場', 'ジョウジョウ'),
      m('し', '動詞', '自立', 'シ'),
      m('て', '助詞', '接続助詞', 'テ'),
      m('いる', '動詞', '非自立', 'イル'),
    ]);
    expect(tokens.map((t) => t.surface)).toEqual(['上場', 'し', 'て', 'いる']);
  });

  it('keeps punctuation as its own token - it is a real keystroke', () => {
    const tokens = toTokens([noun('です', 'デス'), mark('。'), noun('次', 'ツギ')]);
    expect(tokens.map((t) => t.surface)).toEqual(['です', '。', '次']);
  });

  it('never glues anything onto punctuation', () => {
    // A suffix right after a mark would otherwise join leftwards.
    const tokens = toTokens([mark('。'), suffix('円', 'エン')]);
    expect(tokens.map((t) => t.surface)).toEqual(['。', '円']);
  });

  it('falls back to the surface when there is no reading', () => {
    expect(toTokens([noun('GR86')])).toEqual([{ surface: 'GR86', reading: 'GR86' }]);
    expect(toTokens([noun('謎', '*')])).toEqual([{ surface: '謎', reading: '謎' }]);
  });

  it('drops stray whitespace morphemes', () => {
    expect(toTokens([noun('あ', 'ア'), m(' ', '記号', '空白', ' '), noun('い', 'イ')])).toEqual([
      { surface: 'あ', reading: 'ア' },
      { surface: 'い', reading: 'イ' },
    ]);
  });

  it('is empty for empty input', () => {
    expect(toTokens([])).toEqual([]);
  });
});

describe('joinsLeft', () => {
  it('has nothing to join at the start of a sentence', () => {
    expect(joinsLeft([], suffix('円'), undefined)).toBe(false);
  });

  it('needs numbers on both sides of a separator', () => {
    expect(joinsLeft([digit('7')], m(',', '記号', '読点', ','), digit('955'))).toBe(true);
    expect(joinsLeft([digit('7')], m(',', '記号', '読点', ','), noun('円'))).toBe(false);
  });

  it('sees a number through the counters inside it', () => {
    // The 7 of 4兆7,955億: prev is 兆, but the token so far is still a number.
    expect(joinsLeft([digit('4'), suffix('兆')], digit('7'), undefined)).toBe(true);
    // The same suffix after a word is not a number, so a digit starts fresh.
    expect(joinsLeft([noun('取引'), suffix('所')], digit('7'), undefined)).toBe(false);
  });
});

/** Every character is its own morpheme - enough to count tokens with. */
const charTokenize: Tokenize = (text) => [...text].map((ch) => noun(ch, ch));

describe('the whole pipeline', () => {
  const text = '一文目です。二文目です。\n\n二段落目です。';
  const out = segment(text, charTokenize);

  it('keeps paragraphs, sentences and a flat reading order', () => {
    expect(out.paragraphs).toHaveLength(2);
    expect(out.paragraphs[0]!.sentences.map((s) => s.text)).toEqual(['一文目です。', '二文目です。']);
    expect(sentencesOf(out)).toHaveLength(3);
    expect(out.tokens.map((t) => t.surface).join('')).toBe('一文目です。二文目です。二段落目です。');
  });

  it('drops a paragraph that holds no tokens', () => {
    expect(segment('   \n\n   ', charTokenize).paragraphs).toEqual([]);
  });
});

describe('practice slices', () => {
  // Three sentences of 6, 6 and 7 tokens.
  const out = segment('一文目です。二文目です。\n\n二段落目です。', charTokenize);

  it('keeps sentences whole and overshoots rather than cutting one', () => {
    const slice = takeTokens(out, 0, 2);
    expect(slice.map((t) => t.surface).join('')).toBe('一文目です。');
  });

  it('starts at the sentence the offset lands in', () => {
    expect(takeTokens(out, 6, 1).map((t) => t.surface).join('')).toBe('二文目です。');
    expect(takeTokens(out, 7, 1).map((t) => t.surface).join('')).toBe('二文目です。');
  });

  it('runs across sentences and paragraphs to fill the count', () => {
    expect(takeTokens(out, 0, 12).map((t) => t.surface).join('')).toBe('一文目です。二文目です。');
    expect(takeTokens(out, 0, 100)).toHaveLength(out.tokens.length);
  });

  it('is empty past the end', () => {
    expect(takeTokens(out, 999, 10)).toEqual([]);
  });
});
