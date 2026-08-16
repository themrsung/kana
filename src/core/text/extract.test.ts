import { describe, expect, it } from 'vitest';
import { decodeBytes } from './decode';
import {
  decodeEntities,
  fromHtml,
  fromJson,
  fromMarkdown,
  hasJapanese,
  joinPdfLines,
  normaliseWhitespace,
} from './extract';

/** 日本語 in each encoding this app claims to read. */
const SHIFT_JIS = new Uint8Array([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]);
const EUC_JP = new Uint8Array([0xc6, 0xfc, 0xcb, 0xdc, 0xb8, 0xec]);
const UTF8 = new Uint8Array([0xe6, 0x97, 0xa5, 0xe6, 0x9c, 0xac, 0xe8, 0xaa, 0x9e]);

describe('encoding detection', () => {
  it('reads UTF-8 without a BOM', () => {
    expect(decodeBytes(UTF8)).toEqual({ text: '日本語', encoding: 'utf-8', fromBom: false });
  });

  it('honours a UTF-8 BOM and strips it', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...UTF8]);
    expect(decodeBytes(withBom)).toEqual({ text: '日本語', encoding: 'utf-8', fromBom: true });
  });

  it('honours a UTF-16LE BOM', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0xe5, 0x65, 0x2c, 0x67, 0x9e, 0x8a]);
    const out = decodeBytes(bytes);
    expect(out.text).toBe('日本語');
    expect(out.encoding).toBe('utf-16le');
  });

  it('falls back to Shift_JIS when the bytes are not valid UTF-8', () => {
    expect(decodeBytes(SHIFT_JIS)).toMatchObject({ text: '日本語', encoding: 'shift_jis' });
  });

  it('picks EUC-JP over Shift_JIS when it produces better Japanese', () => {
    expect(decodeBytes(EUC_JP)).toMatchObject({ text: '日本語', encoding: 'euc-jp' });
  });

  it('scores real prose, not one lucky character', () => {
    // Shift_JIS for トヨタ自動車 - EUC-JP would decode it as mojibake.
    const bytes = new Uint8Array([
      0x83, 0x67, 0x83, 0x88, 0x83, 0x5e, 0x8e, 0xa9, 0x93, 0xae, 0x8e, 0xd4,
    ]);
    expect(decodeBytes(bytes)).toMatchObject({ text: 'トヨタ自動車', encoding: 'shift_jis' });
  });

  it('leaves ASCII alone', () => {
    expect(decodeBytes(new TextEncoder().encode('GR86'))).toMatchObject({
      text: 'GR86',
      encoding: 'utf-8',
    });
  });

  it('never throws on an empty file', () => {
    expect(decodeBytes(new Uint8Array())).toMatchObject({ text: '' });
  });
});

describe('whitespace', () => {
  it('collapses blank runs but keeps paragraph breaks', () => {
    expect(normaliseWhitespace('あ\r\n\r\n\r\n い  \n\n\nう')).toBe('あ\n\n い\n\nう');
  });

  it('turns ideographic spaces into ordinary ones', () => {
    expect(normaliseWhitespace('あ　い')).toBe('あ い');
  });
});

describe('markdown', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['# 見出し', '見出し'],
    ['**強調**された', '強調された'],
    ['[トヨタ](https://toyota.jp)は', 'トヨタは'],
    ['![図](/a.png)キャプション', 'キャプション'],
    ['- 一つ目\n- 二つ目', '一つ目\n二つ目'],
    ['1. 一つ目', '一つ目'],
    ['> 引用です', '引用です'],
    ['`コード`です', 'コードです'],
    ['本文\n\n---\n\nつづき', '本文\n\nつづき'],
  ];
  for (const [input, want] of cases) {
    it(`${input.split('\n')[0]} -> ${want.split('\n')[0]}`, () => {
      expect(fromMarkdown(input)).toBe(want);
    });
  }

  it('drops fenced code entirely', () => {
    expect(fromMarkdown('前\n\n```ts\nconst x = 1;\n```\n\n後')).toBe('前\n\n後');
  });

  it('drops tables, which are data rather than prose', () => {
    expect(fromMarkdown('本文\n\n| 年 | 額 |\n|---|---|\n| 2025 | 1兆 |\n\n後')).toBe('本文\n\n後');
  });

  it('drops YAML front matter', () => {
    expect(fromMarkdown('---\ntitle: あ\n---\n本文')).toBe('本文');
  });
});

describe('html', () => {
  it('drops scripts, styles and tags but keeps text', () => {
    const html =
      '<html><head><style>p{color:red}</style></head><body>' +
      '<p>トヨタ自動車は<b>東証</b>に上場</p><script>alert(1)</script>' +
      '<p>している。</p></body></html>';
    expect(fromHtml(html)).toBe('トヨタ自動車は東証に上場\n\nしている。');
  });

  it('turns block tags into breaks and inline tags into nothing', () => {
    expect(fromHtml('<li>あ</li><li>い</li>')).toBe('あ\n\nい');
    expect(fromHtml('あ<span>い</span>う')).toBe('あいう');
    // A lone <br> is a line break inside a paragraph, not a paragraph break.
    expect(fromHtml('あ<br>い')).toBe('あ\nい');
  });

  it('drops comments', () => {
    expect(fromHtml('あ<!-- 注釈 -->い')).toBe('あい');
  });

  it('decodes entities', () => {
    expect(decodeEntities('A&amp;B &lt;C&gt; &#26085; &#x672C; &nbsp;')).toBe('A&B <C> 日 本  ');
  });

  it('leaves an unknown entity alone rather than mangling it', () => {
    expect(decodeEntities('&nosuch; &#xZZ;')).toBe('&nosuch; &#xZZ;');
  });
});

describe('json', () => {
  it('keeps Japanese values and drops keys, ids and latin', () => {
    const json = JSON.stringify({
      docID: 'S100ABCD',
      filerName: 'トヨタ自動車株式会社',
      updated: '2025-06-24T09:00:00+09:00',
      sections: [{ title: '経営方針', body: 'モビリティ・カンパニーへ。' }],
    });
    expect(fromJson(json)).toBe('トヨタ自動車株式会社\n\n経営方針\n\nモビリティ・カンパニーへ。');
  });

  it('falls back to the raw text when the file is not JSON', () => {
    expect(fromJson('これはJSONではない')).toBe('これはJSONではない');
  });

  it('knows what counts as Japanese', () => {
    expect(hasJapanese('あ')).toBe(true);
    expect(hasJapanese('ア')).toBe(true);
    expect(hasJapanese('日')).toBe(true);
    expect(hasJapanese('S100ABCD')).toBe(false);
    expect(hasJapanese('2025-06-24')).toBe(false);
  });
});

describe('pdf line joining', () => {
  it('rejoins a sentence that the layout wrapped', () => {
    expect(joinPdfLines(['当社は、モビリティ・カンパニーへの', '変革を進めています。'])).toBe(
      '当社は、モビリティ・カンパニーへの変革を進めています。',
    );
  });

  it('breaks where the text really ended', () => {
    expect(joinPdfLines(['一文目です。', '二文目です。'])).toBe('一文目です。\n二文目です。');
  });

  it('gives latin words back the space the wrap ate', () => {
    expect(joinPdfLines(['Toyota', 'Woven City'])).toBe('Toyota Woven City');
  });

  it('does not insert spaces into Japanese', () => {
    expect(joinPdfLines(['自動', '車'])).toBe('自動車');
  });

  it('treats a blank line as a break', () => {
    expect(joinPdfLines(['見出し', '   ', '本文'])).toBe('見出し\n本文');
  });
});
