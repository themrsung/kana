import type { Token } from '../core/session';

/**
 * Hardcoded warm-up sentence, hand-segmented with hand-checked readings.
 *
 * This is the fixture the typing loop is built against, before kuromoji and
 * EDINET are wired up. It is deliberately full of the hard cases: 拗音 (キョ),
 * 促音 (カブシキ→ガイシャ rendaku, 取引所), long vowels (ジドウシャ, ジョウジョウ),
 * and punctuation that has to be typed as a key rather than skipped.
 */
export const SAMPLE_TOKENS: readonly Token[] = [
  { surface: 'トヨタ', reading: 'トヨタ' },
  { surface: '自動車', reading: 'ジドウシャ' },
  { surface: '株式会社', reading: 'カブシキガイシャ' },
  { surface: 'は', reading: 'ハ' },
  { surface: '、', reading: '、' },
  { surface: '東京', reading: 'トウキョウ' },
  { surface: '証券', reading: 'ショウケン' },
  { surface: '取引所', reading: 'トリヒキジョ' },
  { surface: 'に', reading: 'ニ' },
  { surface: '上場', reading: 'ジョウジョウ' },
  { surface: 'し', reading: 'シ' },
  { surface: 'て', reading: 'テ' },
  { surface: 'いる', reading: 'イル' },
  { surface: '。', reading: '。' },
];

export const SAMPLE_TITLE = 'ウォームアップ';
