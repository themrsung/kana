import { planExpectation, type Match, type Plan } from '../core/input';
import type { Token } from '../core/session';

/** A pronunciation hint, already respelled by the scheme the user picked. */
export interface Hint {
  readonly label: string;
  readonly text: string;
}

interface Props {
  readonly token: Token;
  readonly plan: Plan;
  /** Live match for the token being typed; omitted for the lookahead card. */
  readonly match?: Match;
  readonly hint: Hint | null;
}

/**
 * The token the user is typing right now: big kana with progress baked in,
 * and the remaining keystrokes underneath.
 */
export function CurrentToken({ token, plan, match, hint }: Props) {
  const settled = match?.settled ?? 0;
  const reached = match?.reached ?? 0;
  const exp = match && match.mode === plan.mode ? planExpectation(plan, match) : null;
  const kana = plan.kana;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8">
      <div className="mb-1 font-mono text-xs tracking-widest text-neutral-500 uppercase">Now</div>
      <div className="mb-6 text-2xl text-neutral-400">{token.surface}</div>
      <div className="no-select mb-7 flex flex-wrap items-baseline font-sans text-kana leading-none">
        {[...kana].map((ch, i) => (
          <span
            key={i}
            className={
              i < settled
                ? 'text-emerald-400'
                : i < reached
                  ? // Reached under some spelling but not all - the keystroke that
                    // disambiguates has not been pressed yet.
                    'text-emerald-400/40'
                  : 'text-neutral-100'
            }
          >
            {ch}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <KeyHint remaining={exp?.remaining ?? plan.shortest} />
        <HintLine hint={hint} />
      </div>
    </div>
  );
}

/**
 * The pronunciation hint. Never a typing target - it says how the word sounds,
 * in a writing system the reader already knows.
 */
function HintLine({ hint }: { readonly hint: Hint | null }) {
  if (!hint) return null;
  return (
    <div className="flex items-baseline gap-2 font-sans text-sm text-neutral-400">
      <span className="font-mono text-xs tracking-widest text-neutral-600 uppercase">
        {hint.label}
      </span>
      {hint.text}
    </div>
  );
}

/** The keys still to press, next one lit. Monospace so the columns never jump. */
function KeyHint({ remaining }: { readonly remaining: string }) {
  if (remaining === '') {
    return <div className="font-mono text-sm text-emerald-400">· complete</div>;
  }
  return (
    <div className="no-select flex gap-1.5">
      {[...remaining].map((ch, i) => (
        <kbd
          key={i}
          className={
            'flex h-9 min-w-9 items-center justify-center rounded-md border px-2 font-mono text-base ' +
            (i === 0
              ? 'border-amber-400 bg-amber-400/15 text-amber-200 shadow-[0_0_12px_-2px] shadow-amber-400/40'
              : 'border-neutral-700 bg-neutral-800/60 text-neutral-400')
          }
        >
          {ch === ' ' ? '␣' : ch}
        </kbd>
      ))}
    </div>
  );
}

/** The lookahead card - same information, quieter, no live state. */
export function NextToken({ token, plan, hint }: Omit<Props, 'match'>) {
  return (
    <div className="rounded-2xl border border-neutral-800/70 bg-neutral-900/30 p-6">
      <div className="mb-1 font-mono text-xs tracking-widest text-neutral-600 uppercase">Next</div>
      <div className="mb-3 text-lg text-neutral-500">{token.surface}</div>
      <div className="no-select mb-4 text-kana-sm text-neutral-300">{plan.kana}</div>
      <div className="no-select flex gap-1">
        {[...plan.shortest].map((ch, i) => (
          <kbd
            key={i}
            className="flex h-7 min-w-7 items-center justify-center rounded border border-neutral-800 bg-neutral-900 px-1.5 font-mono text-xs text-neutral-500"
          >
            {ch === ' ' ? '␣' : ch}
          </kbd>
        ))}
      </div>
      {hint && <div className="mt-3 font-sans text-xs text-neutral-600">{hint.text}</div>}
    </div>
  );
}

/** Placeholder card for when the session has run out of tokens. */
export function EmptyToken({ label }: { readonly label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/20 p-6">
      <div className="text-sm text-neutral-600">{label}</div>
    </div>
  );
}
