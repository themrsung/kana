import type { Metrics } from '../core/session';

/** One number plus its label. Tabular figures so digits do not jitter while typing. */
function Stat({ label, value, unit, tone }: {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly tone?: 'good' | 'bad';
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[0.65rem] tracking-widest text-neutral-500 uppercase">{label}</span>
      <span className="flex items-baseline gap-1">
        <span
          className={
            'font-mono text-2xl tabular-nums ' +
            (tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : 'text-neutral-100')
          }
        >
          {value}
        </span>
        {unit && <span className="font-mono text-xs text-neutral-600">{unit}</span>}
      </span>
    </div>
  );
}

export function StatsBar({ m, total }: { readonly m: Metrics; readonly total: number }) {
  const mins = Math.floor(m.elapsedMs / 60000);
  const secs = Math.floor((m.elapsedMs % 60000) / 1000);
  const accuracy = Math.round(m.accuracy * 100);

  return (
    <div className="flex flex-wrap items-end gap-x-10 gap-y-5 rounded-2xl border border-neutral-800 bg-neutral-900/40 px-7 py-5">
      <Stat label="Time" value={`${mins}:${String(secs).padStart(2, '0')}`} />
      <Stat
        label="Accuracy"
        value={String(accuracy)}
        unit="%"
        tone={m.keystrokes === 0 ? undefined : accuracy >= 97 ? 'good' : accuracy < 90 ? 'bad' : undefined}
      />
      <Stat label="Kana" value={m.kanaPerMinute.toFixed(0)} unit="/min" />
      {/* The figure Japanese typing exams quote: source characters per minute. */}
      <Stat label="文字数" value={m.charsPerMinute.toFixed(0)} unit="/min" />
      <Stat label="Keys" value={m.keysPerMinute.toFixed(0)} unit="/min" />
      <Stat label="Errors" value={String(m.errors)} tone={m.errors > 0 ? 'bad' : undefined} />
      <Stat label="Tokens" value={`${m.tokensDone}/${total}`} />
    </div>
  );
}
