/**
 * The kuromoji dictionary, loaded once and shared.
 *
 * This is the only asynchronous, non-pure module in `core`. Everything that
 * consumes it takes a `Tokenize` function instead of importing from here, so
 * the segmentation rules can be tested with hand-written morphemes and no
 * 17 MB of IPADIC.
 */

import { builder, type IpadicFeatures } from '@sglkc/kuromoji';

/** The morpheme fields this app actually reads. */
export interface Morpheme {
  readonly surface_form: string;
  /** Katakana spelling. Absent for unknown words, digits and latin. */
  readonly reading?: string | undefined;
  /** 名詞 / 動詞 / 助詞 / 記号 ... */
  readonly pos: string;
  /** 固有名詞 / 接尾 / 数 / 句点 ... */
  readonly pos_detail_1: string;
}

export type Tokenize = (text: string) => readonly Morpheme[];

/**
 * Where the .dat.gz files live. In the browser they are served as static
 * assets (see `scripts/copy-dict.mjs`); in Node they are read straight out of
 * node_modules.
 */
export const DEFAULT_DIC_PATH =
  typeof window === 'undefined'
    ? 'node_modules/@sglkc/kuromoji/dict'
    : `${import.meta.env?.BASE_URL ?? '/'}dict`;

let pending: Promise<Tokenize> | null = null;

/**
 * Build the tokenizer. The dictionary is ~17 MB over the wire, so the promise
 * is cached: every caller after the first gets the same one.
 */
export function loadTokenizer(dicPath: string = DEFAULT_DIC_PATH): Promise<Tokenize> {
  pending ??= new Promise<Tokenize>((resolve, reject) => {
    builder({ dicPath }).build((err: Error | null, tokenizer: { tokenize: (t: string) => IpadicFeatures[] }) => {
      if (err) {
        pending = null; // Let a later attempt retry a failed download.
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      resolve((text: string) => tokenizer.tokenize(text));
    });
  });
  return pending;
}

/** True once the dictionary is in memory and segmentation will be instant. */
export function tokenizerReady(): boolean {
  return pending !== null;
}
