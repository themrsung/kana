import type { Metrics, Session } from '../core/session';

/**
 * What the session actually taught you.
 *
 * Two things worth knowing at the end: which tokens fought back, and which keys
 * your fingers missed. The keyboard heatmap lives on the board itself (see
 * `Keyboard`), so this side handles the per-token half.
 */
export function Summary({
  session,
  m,
  onRestart,
}: {
  readonly session: Session;
  readonly m: Metrics;
  readonly onRestart: () => void;
}) {
  const rows = session.tokens
    .map((token, i) => ({ token, stat: session.stats[i]! }))
    .filter((r) => r.stat.done && r.stat.keystrokes > 0)
    .map((r) => ({
      ...r,
      accuracy: (r.stat.keystrokes - r.stat.errors) / r.stat.keystrokes,
      // Seconds per kana: normalises for token length, so a long word typed
      // steadily does not look worse than a short word typed slowly.
      pace: r.stat.ms / 1000 / Math.max(1, r.token.reading.length),
    }));

  const trouble = rows
    .filter((r) => r.stat.errors > 0)
    .sort((a, b) => b.stat.errors - a.stat.errors || a.accuracy - b.accuracy)
    .slice(0, 8);

  const slowest = rows
    .filter((r) => r.stat.errors === 0)
    .sort((a, b) => b.pace - a.pace)
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-emerald-900/60 bg-emerald-950/10 p-8">
      <div>
        <div className="text-2xl text-emerald-300">完走しました</div>
        <p className="mt-1 font-mono text-xs text-neutral-500">
          {m.tokensDone} tokens · {Math.round(m.accuracy * 100)}% · {m.kanaPerMinute.toFixed(0)} kana/min ·{' '}
          {m.charsPerMinute.toFixed(0)} 文字/min
        </p>
      </div>

      {trouble.length > 0 ? (
        <Section title="Tokens that fought back">
          {trouble.map(({ token, stat, accuracy }, i) => (
            <Row
              key={i}
              surface={token.surface}
              reading={token.reading}
              right={`${stat.errors} miss${stat.errors === 1 ? '' : 'es'} · ${Math.round(accuracy * 100)}%`}
              tone="bad"
            />
          ))}
        </Section>
      ) : (
        <p className="font-mono text-xs text-emerald-400/80">No mistyped keys. Clean run.</p>
      )}

      {slowest.length > 0 && (
        <Section title="Clean, but slow">
          {slowest.map(({ token, pace }, i) => (
            <Row
              key={i}
              surface={token.surface}
              reading={token.reading}
              right={`${pace.toFixed(2)}s / kana`}
            />
          ))}
        </Section>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.currentTarget.blur();
          onRestart();
        }}
        className="self-start rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 font-mono text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:text-neutral-100"
      >
        Run it again
      </button>
    </div>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">{title}</h2>
      <ul className="flex flex-col gap-1">{children}</ul>
    </div>
  );
}

function Row({
  surface,
  reading,
  right,
  tone,
}: {
  readonly surface: string;
  readonly reading: string;
  readonly right: string;
  readonly tone?: 'bad';
}) {
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-neutral-900 pb-1">
      <span className="flex items-baseline gap-2">
        <span className="text-base text-neutral-200">{surface}</span>
        <span className="font-sans text-xs text-neutral-600">{reading}</span>
      </span>
      <span className={'font-mono text-xs ' + (tone === 'bad' ? 'text-rose-400' : 'text-neutral-500')}>
        {right}
      </span>
    </li>
  );
}
