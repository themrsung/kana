import { beforeAll, describe, expect, it } from 'vitest';
import { loadTokenizer, type Tokenize } from './tokenizer';
import { segment, toTokens } from './segment';

/**
 * The one test that loads the real 17 MB dictionary.
 *
 * Everything else in this directory runs against hand-written morphemes, which
 * is only honest if those fixtures match what IPADIC actually returns. This is
 * the test that keeps them honest - if kuromoji's segmentation shifts under us,
 * this fails and the frozen fixtures get re-checked.
 */
describe('kuromoji integration', () => {
  let tokenize: Tokenize;

  beforeAll(async () => {
    tokenize = await loadTokenizer();
  }, 60_000);

  it('reads the corpus sentence the way the fixtures say it does', () => {
    const tokens = toTokens(tokenize('トヨタ自動車株式会社は、東京証券取引所に上場している。'));
    expect(tokens).toEqual([
      { surface: 'トヨタ自動車', reading: 'トヨタジドウシャ' },
      { surface: '株式会社', reading: 'カブシキガイシャ' },
      { surface: 'は', reading: 'ハ' },
      { surface: '、', reading: '、' },
      { surface: '東京', reading: 'トウキョウ' },
      { surface: '証券', reading: 'ショウケン' },
      { surface: '取引所', reading: 'トリヒキショ' },
      { surface: 'に', reading: 'ニ' },
      { surface: '上場', reading: 'ジョウジョウ' },
      { surface: 'し', reading: 'シ' },
      { surface: 'て', reading: 'テ' },
      { surface: 'いる', reading: 'イル' },
      { surface: '。', reading: '。' },
    ]);
  });

  it('glues a real figure back into one token', () => {
    const tokens = toTokens(tokenize('営業利益は4兆7,955億円だった。'));
    const surfaces = tokens.map((t) => t.surface);
    expect(surfaces).toContain('4兆7,955億円');
    // …and the reading stays typeable: digits literal, counters in kana.
    const figure = tokens.find((t) => t.surface === '4兆7,955億円')!;
    expect(figure.reading).toBe('4チョウ7,955オクエン');
  });

  it('gives every token a reading that is katakana, digits or punctuation', () => {
    const { tokens } = segment(
      '当社は、モビリティ・カンパニーへの変革を進めています。\n\n2025年度の売上高は48兆円でした。',
      tokenize,
    );
    expect(tokens.length).toBeGreaterThan(10);
    for (const token of tokens) {
      expect(token.reading, token.surface).not.toBe('');
      // No hiragana and no kanji should survive into a reading.
      expect(token.reading, token.surface).not.toMatch(/[ぁ-ゖ㐀-鿿]/);
    }
  });

  it('keeps latin runs as themselves rather than inventing kana', () => {
    const tokens = toTokens(tokenize('Toyota Woven Cityを開発する。'));
    expect(tokens.map((t) => t.surface)).toContain('Toyota');
    for (const token of tokens) {
      if (/^[A-Za-z]+$/.test(token.surface)) expect(token.reading).toBe(token.surface);
    }
  });
});
