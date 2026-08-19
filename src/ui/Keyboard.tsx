import {
  BOARD_ROWS,
  BOARD_THUMBS,
  DAKUTEN,
  engravingFor,
  HANDAKUTEN,
  keyByCode,
  type Board,
  type KanaKey,
} from '../core/kana/layout';
import type { KeyPress } from '../core/kana/layout';
import { asciiFor } from '../core/keycodes';
import type { InputMode } from '../core/input';

interface Props {
  readonly board: Board;
  readonly mode: InputMode;
  /** The physical key the user should press next, if the engine knows one. */
  readonly press: KeyPress | null;
  /** Kana in the current token that this board physically cannot produce. */
  readonly unreachable: readonly string[];
  /** Mistypes per physical key, for the heatmap tint. */
  readonly heat?: ReadonlyMap<string, number>;
}

/**
 * A picture of the physical board. In kana mode the kana engraving is the
 * headline and the latin legend is the footnote; in romaji mode they swap, so
 * the same component teaches both layouts without pretending they are the same.
 *
 * The JIS board is drawn in hiragana, as it is really engraved; the US-ANSI board,
 * which carries no kana printing to copy, is drawn in katakana. Both send the same
 * keystrokes - see `engravingFor`.
 */
export function Keyboard({ board, mode, press, unreachable, heat }: Props) {
  const rows = BOARD_ROWS[board];
  const worst = heat ? Math.max(1, ...heat.values()) : 1;
  return (
    <div className="no-select flex flex-col items-center gap-1.5 rounded-2xl border border-neutral-800 bg-neutral-900/40 px-4 py-5">
      {rows.map((row, r) => (
        <div key={r} className="flex gap-1.5" style={{ paddingLeft: `${r * 1.1}rem` }}>
          {row.map((code) => {
            const key = keyByCode(code);
            return key ? (
              <Key
                key={code}
                k={key}
                board={board}
                mode={mode}
                lit={press?.code === code}
                litShift={press?.code === code && press.shift}
                heat={(heat?.get(code) ?? 0) / worst}
                misses={heat?.get(code) ?? 0}
              />
            ) : null;
          })}
        </div>
      ))}

      <div className="mt-1 flex gap-1.5">
        {BOARD_THUMBS[board].map((label, i) => (
          <div
            key={i}
            className={
              'flex h-8 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900/70 px-3 font-sans text-xs text-neutral-600 ' +
              (label === 'Space' ? 'min-w-[14rem]' : 'min-w-[4.5rem]')
            }
          >
            {label}
          </div>
        ))}
      </div>

      {unreachable.length > 0 && (
        <div className="mt-3 rounded-lg border border-rose-900/70 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
          <span className="mr-2 font-mono text-rose-500 uppercase">no key</span>
          {unreachable.join('  ')}
          <span className="ml-2 text-rose-400/70">
            — not on this board, switch layout or use romaji
          </span>
        </div>
      )}
    </div>
  );
}

function Key({
  k,
  board,
  mode,
  lit,
  litShift,
  heat,
  misses,
}: {
  readonly k: KanaKey;
  readonly board: Board;
  readonly mode: InputMode;
  readonly lit: boolean;
  readonly litShift: boolean;
  /** 0-1, share of the worst key's mistypes. */
  readonly heat: number;
  readonly misses: number;
}) {
  const latin = board === 'jis' ? k.jis : (k.ansi ?? k.jis);
  const main = mode === 'kana' ? engravingFor(board, k.plain) : latin;
  // In kana mode the corner carries the shift-layer kana; in romaji mode it
  // carries the shifted ASCII, but only where shift does something more
  // interesting than capitalising a letter.
  const shifted = asciiFor(k.code, true);
  const sub =
    mode === 'kana'
      ? (k.shifted ? engravingFor(board, k.shifted) : null)
      : shifted && shifted !== asciiFor(k.code, false)?.toUpperCase()
        ? shifted
        : null;

  return (
    <div
      className={
        'relative flex h-12 w-12 flex-col items-center justify-center rounded-md border transition-colors ' +
        (lit
          ? 'border-amber-400 bg-amber-400/15 shadow-[0_0_14px_-3px] shadow-amber-400/50'
          : k.nonStandard
            ? 'border-dashed border-neutral-700 bg-neutral-900/50'
            : 'border-neutral-800 bg-neutral-900/70')
      }
      title={[k.code, misses > 0 ? `${misses} mistyped` : null, k.nonStandard ? 'extension, not on a real JIS board' : null]
        .filter(Boolean)
        .join(' — ')}
    >
      {heat > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-md bg-rose-500"
          style={{ opacity: 0.15 + heat * 0.55 }}
        />
      )}
      {sub && (
        <span
          className={
            'absolute top-0.5 right-1 text-[0.6rem] leading-none ' +
            (litShift ? 'text-amber-300' : 'text-neutral-600')
          }
        >
          {label(sub)}
        </span>
      )}
      <span
        className={
          'relative ' +
          (mode === 'kana' ? 'font-sans text-base' : 'font-mono text-sm') +
          ' leading-none ' +
          (lit ? 'text-amber-100' : 'text-neutral-300')
        }
      >
        {label(main)}
      </span>
      {mode === 'kana' && (
        <span className="absolute right-1 bottom-0.5 font-mono text-[0.55rem] leading-none text-neutral-700">
          {latin}
        </span>
      )}
    </div>
  );
}

/** Standalone voicing marks need a dotted circle to sit on, or they vanish. */
function label(ch: string): string {
  if (ch === DAKUTEN) return '◌゛';
  if (ch === HANDAKUTEN) return '◌゜';
  return ch;
}
