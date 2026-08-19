# kana

Japanese typing practice, morpheme by morpheme. Load a text, and type it through
one word at a time — seeing the kana you owe, the physical keys that produce it,
and how the word sounds in an alphabet you already read.

Both input methods are implemented **in the app**. The OS IME stays off: every
keystroke is read from `event.code` and converted by code in this repo, so
behaviour is identical on a Japanese, US or Korean system layout, and every rule
is unit-testable.

```
npm install
npm run dev      # http://localhost:5173
npm test         # 259 tests
npm run build
```

`predev`/`prebuild` stage the kuromoji dictionary into `public/dict` (~17 MB,
gitignored — it is a build input, not source).

## What it does

- **Two input modes.** Google-IME-style romaji, and the JIS kana layout with
  the shift layer and 濁点/半濁点 as separate keystrokes (が = か + `@`).
- **Two physical keyboards**, side by side and switchable: a full JIS board, and
  a US-ANSI MacBook Air. The Air is missing the `¥` and `ろ` keys that carry ー
  and ろ, so on that board **both fold onto the backtick** — the one key in its
  alphanumeric block that a JIS board spends on 半角/全角 and that produces no
  kana. It is drawn dashed, and marked "extension, not on a real JIS board",
  because that is exactly what it is: every other key is where JIS puts it, and
  ANSI runs buy their ー on a key a real JIS typist never presses.
  The JIS board is drawn in hiragana, as it is really engraved; the ANSI board,
  which has no kana printing of its own to copy, is drawn in katakana. That is a
  legend, not a mode — the two boards differ in one key, not in what they send.
- **Four pronunciation respellings** under each token, individually switchable:
  romaji, 한글, English, Spanish.
- **Any UTF-8-decodable text**: `.txt` `.md` `.pdf` `.json` `.html`, or a paste.
- **Scoring**: per-token accuracy, a mistyped-key heatmap painted onto the
  keyboard, and speed in kana/min, 文字/min (the figure Japanese typing exams
  quote) and keys/min.

## How the input engines work

The romaji engine does **not** convert keystrokes to kana and compare. That is
ambiguous mid-word — after `s`, the target could still be さ, し or しゃ — and it
forces guesswork about when to commit a pending `n`.

Instead it compiles the *target* kana into a small graph of every legal spelling
and walks it as an NFA while you type. Three properties fall out of one
structure:

- every valid spelling is accepted (`si` and `shi`, `ja`/`jya`/`zya`, `kya` and
  `kilya`),
- the **shortest** spelling is what gets displayed as the key hint,
- "is this keystroke correct?" needs no lookahead and no heuristics.

`っ` is an edge that consumes the doubled consonant; `ん` is an edge whose bare
`n` form is only legal where the following sound cannot absorb it.

Two calls worth knowing about:

- **Same-length ties prefer the row-consistent spelling.** しゃ displays `sya`,
  not `sha` — both are three keys, and し already displays `si` (genuinely
  shortest at two), so the hints keep one consonant per row. `sha` is still
  accepted.
- **`n` before な行 is accepted by default.** こんにちは takes `konnitiha` as well
  as `konnnitiha` and `kon'nitiha`. Pass `{ strictN: true }` to require the
  unambiguous forms.

The kana engine mirrors the same shape (`plan / start / feed / expectation`), so
`core/input.ts` can dispatch between them and the UI never knows which is live.

## Respelling schemes

All four are pure functions over a katakana reading, each with its own fixture
table in `src/core/respell/respell.test.ts`. They share one phonetic mora
decomposition (`mora.ts`), where onsets are phonetic rather than phonemic — し is
`sh`, ち is `ch`, つ is `ts` — so no scheme re-derives Japanese allophony, and
てぃ stays distinct from ち.

A respelling is only ever a **hint**. What you type is decided by the input
engine, so a scheme can approximate freely without making the app unfair.

| | rule | example |
|---|---|---|
| **romaji** | the input engine's own shortest spelling | とうきょう → `toukyou` |
| **한글** | 국립국어원 외래어 표기법: っ → ㅅ 받침, long vowels unwritten, か/た行 평음 initially and 격음 elsewhere | がっこう → 갓코, かたかな → 가타카나 |
| **EN** | hyphenated syllables; doubled vowels are long | がっこう → `gahk-kohh` |
| **ES** | read with Spanish rules | ぎんこう → `guinkoo`, にゃんこ → `ñanko` |

Spanish gets several details exactly right — `ñ` *is* [ɲ], `ch` *is* [tʃ], and
intervocalic `r` *is* a flap — and three things it cannot:

- **は行 → `j`.** Spanish `h` is silent, so `ha` would produce nothing at all.
  `j` is [x], harsher than [h], but present beats absent.
- **ざ行 → `s`.** Spanish has no /z/, and Castilian `z` is [θ] — a different
  place of articulation, and worse than losing the voicing. さ and ざ merge.
  This is the one real information loss in any of the four schemes.
- **Word-initial ら.** Spanish initial `r` is trilled, and there is no way to
  spell a word-initial flap in Spanish.

English cannot express vowel length, which is phonemic in Japanese
(おじさん / おじいさん), so long vowels double the vowel letter: `ah`/`aah`,
`oh`/`ohh`, `ee`/`eee`. `eee` looks odd; silently merging a contrast that
changes the word seemed worse.

`ヶ` is not on a real JIS board. The spec asked for it in the shift layer, so it
sits on Shift+`:` (the け key), drawn with a dashed border and flagged in the
layout as non-standard.

## The default corpus

Toyota's 統合報告書 2025 — 168 pages, of which most is charts, org diagrams,
English mirror text and a contents list threaded with dot leaders. None of that
is typeable Japanese.

```
npm run crop:pdf         # src/data/default-source.pdf -> src/data/default-source.json
```

`scripts/crop-pdf.ts` keeps only blocks that read as prose: mostly Japanese,
long enough, ending in 。, not repeated across pages, not mostly digits. 168
pages reduce to ~11k characters. The filter is deliberately strict — a dropped
paragraph costs nothing, a kept table row costs a token of gibberish mid-session.

The PDF itself is gitignored (35 MB); the cropped JSON is committed, so the app
runs with no network and no key.

## EDINET

`scripts/fetch-edinet.ts` pulls Toyota's 有価証券報告書 (`E02144`, ordinance
`010`, form `030000`) across the June filing window, extracts the narrative
sections from the CSV bundle, strips the XBRL markup, and writes the same JSON
shape.

It is a build-time script because EDINET v2 needs a subscription key that must
not ship to a browser — and sends no CORS headers, so a browser could not call
it anyway.

**Getting a key:** register at <https://api.edinet-fsa.go.jp/>, confirm the
email, then 「API キー発行」. Copy it into `.env`:

```
cp .env.example .env    # then paste the key
npm run fetch:edinet
```

Without a key the script exits without touching anything and the app keeps using
the committed fallback, with a quiet banner saying so.

One trap worth knowing: **EDINET answers a bad key with HTTP 200** and a JSON
body carrying `StatusCode: 401`, so `res.ok` tells you nothing. The script checks
the body; without that check an expired key looks exactly like "Toyota filed
nothing this year".

## Adding a text source

A source is anything that returns paragraphs of Japanese. Implement `TextSource`
in `src/core/text/source.ts` and add it to `SOURCES` — nothing else changes.

```ts
export const aozoraSource: TextSource = {
  id: 'aozora',
  label: '青空文庫',
  description: 'Public-domain Japanese literature.',
  load: async () => {
    const doc = (await import('../../data/aozora.json')).default as SourceDocJson;
    return { ...doc, isFallback: false };
  },
};
```

If it needs a key or a CORS-blocked API, do the fetching in a `scripts/` file
that writes `SourceDocJson`, and have `load` import the committed result — that
is exactly the shape `edinetSource` uses.

## Layout

```
src/core/
  keycodes.ts        event.code -> ASCII, both shift layers (US-ANSI engraving)
  input.ts           dispatcher: one interface over both engines
  session.ts         pure reducer, (session, keystroke, timestamp) -> session
  romaji/            table.ts (the rules), matcher.ts (the NFA)
  kana/              layout.ts (JIS X 6002 + boards), engine.ts
  respell/           mora.ts + hangul/english/spanish
  text/              decode -> extract -> segment -> source
src/ui/              App, TokenCard, Keyboard, StatsBar, Summary, SourcePanel
scripts/             copy-dict, crop-pdf, fetch-edinet
```

Everything in `core/` is pure and tested except `text/tokenizer.ts`, which owns
the one async, stateful thing in the app: loading the dictionary. Consumers take
a `Tokenize` function rather than importing it, so segmentation is tested with
hand-written morphemes and no 17 MB of IPADIC. One integration test
(`tokenizer.test.ts`) loads the real dictionary and keeps those fixtures honest.

## Notes

- No `<form>` elements anywhere.
- Keyboard-first: `Esc` pauses, `Enter` skips a token, focus rings are always
  visible, and nothing hijacks the tab order.
- The dictionary files are named `*.dat.gz`, which makes static servers set
  `Content-Encoding: gzip` and the browser silently decompress them before
  kuromoji can. The gzip is the payload, not the transport, so a small Vite
  plugin serves `/dict` as opaque bytes.
