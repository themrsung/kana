import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_CONFIG,
  charForKey,
  planExpectation,
  pressForChar,
  unreachable,
  type InputConfig,
} from '../core/input';
import {
  applyKey,
  createSession,
  currentPlan,
  isFinished,
  metrics,
  setPaused,
  skipToken,
  type Session,
} from '../core/session';
import { SCHEMES, schemeById, type SchemeId } from '../core/respell';
import { paragraphTokenOffset, segment, takeTokens, type Segmented } from '../core/text/segment';
import type { SourceDoc } from '../core/text/source';
import { loadTokenizer } from '../core/text/tokenizer';
import { SAMPLE_TITLE, SAMPLE_TOKENS } from '../data/sample';
import { CurrentToken, EmptyToken, NextToken, type Hint } from './TokenCard';
import { Keyboard } from './Keyboard';
import { SourcePanel, type LoadState } from './SourcePanel';
import { Summary } from './Summary';
import { StatsBar } from './StatsBar';

/** The three ways in this app can be driven. Kana mode needs a board to name keys. */
const MODES: readonly { readonly label: string; readonly config: InputConfig }[] = [
  { label: 'romaji', config: DEFAULT_CONFIG },
  { label: 'かな JIS', config: { mode: 'kana', board: 'jis' } },
  { label: 'かな US', config: { mode: 'kana', board: 'ansi' } },
];

/** Hint pickers: off, then one entry per respelling scheme. */
const HINTS: readonly (SchemeId | null)[] = [null, ...SCHEMES.map((s) => s.id)];

const LENGTHS: readonly number[] = [20, 40, 80, 160, Number.MAX_SAFE_INTEGER];

function lengthLabel(n: number): string {
  return n === Number.MAX_SAFE_INTEGER ? 'all' : String(n);
}

export default function App() {
  const [config, setConfig] = useState<InputConfig>(DEFAULT_CONFIG);
  const [session, setSession] = useState<Session>(() => createSession(SAMPLE_TOKENS, DEFAULT_CONFIG));
  const [hintId, setHintId] = useState<SchemeId | null>(null);
  const [showBoard, setShowBoard] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const surfaceRef = useRef<HTMLDivElement>(null);

  // Corpus state. Null while the app is on the built-in warm-up sentence,
  // which is deliberately available before the 17 MB dictionary is touched.
  const [doc, setDoc] = useState<SourceDoc | null>(null);
  const [segmented, setSegmented] = useState<Segmented | null>(null);
  const [load, setLoad] = useState<LoadState>({ kind: 'idle' });
  const [notice, setNotice] = useState<string | null>(null);
  const [para, setPara] = useState(0);
  const [length, setLength] = useState(40);

  const done = isFinished(session);
  const running = session.startedAt !== null && !session.paused && !done;

  // Tick only while the clock is actually moving, so a paused or
  // finished session does not re-render forever in a background tab.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [running]);

  /** Tokens for the current passage: the corpus slice, or the warm-up sentence. */
  const passage = useCallback(
    (seg: Segmented | null, paragraph: number, count: number) =>
      seg === null ? SAMPLE_TOKENS : takeTokens(seg, paragraphTokenOffset(seg, paragraph), count),
    [],
  );

  const restart = useCallback(
    (next: InputConfig = config, paragraph = para, count = length, seg = segmented) => {
      setConfig(next);
      setPara(paragraph);
      setLength(count);
      setSession(createSession(passage(seg, paragraph, count), next));
      setNow(Date.now());
      surfaceRef.current?.focus();
    },
    [config, para, length, segmented, passage],
  );

  /** Segment a freshly loaded document and start on it. */
  const useDocument = useCallback(
    async (next: SourceDoc, message: string | null) => {
      setLoad({ kind: 'busy', what: '辞書を読み込み中（初回のみ）' });
      try {
        const tokenize = await loadTokenizer();
        setLoad({ kind: 'busy', what: '解析中' });
        // Yield once so the busy state actually paints before we block on
        // segmenting, which is synchronous and can take a moment on a big file.
        await new Promise((r) => setTimeout(r, 0));
        const seg = segment(next.paragraphs.join('\n\n'), tokenize);
        if (seg.tokens.length === 0) throw new Error('日本語のテキストが見つかりませんでした。');
        setDoc(next);
        setSegmented(seg);
        setNotice(message ?? (next.isFallback ? next.note ?? null : null));
        setLoad({ kind: 'idle' });
        restart(config, 0, length, seg);
      } catch (err) {
        setLoad({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    },
    [config, length, restart],
  );

  const useSample = useCallback(() => {
    setDoc(null);
    setSegmented(null);
    setNotice(null);
    setLoad({ kind: 'idle' });
    restart(config, 0, length, null);
  }, [config, length, restart]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Never swallow keys aimed at a real control or at the browser itself.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        setSession((s) => (isFinished(s) ? s : setPaused(s, !s.paused, Date.now())));
        return;
      }
      if (e.code === 'Enter') {
        e.preventDefault();
        setSession((s) => (isFinished(s) ? s : skipToken(s, Date.now())));
        return;
      }
      if (e.code === 'Tab') return; // let focus move; the app has a real tab order
      // Space would scroll the page and Enter would re-fire a focused button, so
      // from here on the keystroke belongs to the typing engine.
      if (e.code === 'Space') e.preventDefault();
      const char = charForKey(config, e.code, e.shiftKey);
      if (char === null) return;
      e.preventDefault();
      const t = Date.now();
      setNow(t);
      setSession((s) => applyKey(s, char, t));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [config]);

  useEffect(() => {
    surfaceRef.current?.focus();
  }, []);

  const plan = currentPlan(session);
  const nextPlan = session.plans[session.index + 1];
  const token = session.tokens[session.index];
  const nextToken = session.tokens[session.index + 1];
  const m = useMemo(() => metrics(session, now), [session, now]);
  const exp = plan && plan.mode === session.match.mode ? planExpectation(plan, session.match) : null;
  const blocked = plan ? unreachable(plan, config) : [];

  // The heatmap is stored by mistyped character; the board needs physical keys.
  const heat = useMemo(() => {
    const byCode = new Map<string, number>();
    for (const [char, count] of Object.entries(session.heatmap)) {
      const press = pressForChar(session.config, char);
      if (!press) continue;
      byCode.set(press.code, (byCode.get(press.code) ?? 0) + count);
    }
    return byCode;
  }, [session.heatmap, session.config]);

  const scheme = hintId === null ? null : schemeById(hintId);
  const hintFor = (reading: string): Hint | null =>
    scheme ? { label: scheme.label, text: scheme.respell(reading) } : null;

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-medium tracking-tight text-neutral-200">
            kana <span className="text-neutral-600">·</span>{' '}
            <span className="text-neutral-500">日本語タイピング練習</span>
          </h1>
          <p className="mt-0.5 font-mono text-xs text-neutral-600">
            {doc?.title ?? SAMPLE_TITLE} · {session.tokens.length} tokens
            {segmented && ` · ${segmented.paragraphs.length} paragraphs`}
          </p>
          {notice && <p className="mt-0.5 font-mono text-xs text-amber-500/80">{notice}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            options={MODES.map((mo) => mo.label)}
            active={MODES.findIndex((mo) => sameConfig(mo.config, config))}
            onPick={(i) => restart(MODES[i]!.config)}
          />
          <Segmented
            options={HINTS.map((id) => (id === null ? 'hint off' : schemeById(id).label))}
            active={HINTS.indexOf(hintId)}
            onPick={(i) => setHintId(HINTS[i]!)}
          />
          <Toggle pressed={showBoard} onClick={() => setShowBoard((v) => !v)}>
            Keyboard
          </Toggle>
          <Button onClick={() => setSession((s) => setPaused(s, !s.paused, Date.now()))} disabled={done}>
            {session.paused ? 'Resume' : 'Pause'}
          </Button>
          <Button onClick={() => restart()}>Restart</Button>
        </div>
      </header>

      <div
        ref={surfaceRef}
        tabIndex={0}
        role="application"
        aria-label="Typing surface"
        className="flex flex-col gap-6 rounded-3xl focus:outline-none"
      >
        <StatsBar m={m} total={session.tokens.length} />

        {done ? (
          <Summary session={session} m={m} onRestart={() => restart()} />
        ) : session.paused ? (
          <Paused />
        ) : (
          <div className="grid gap-5 md:grid-cols-[1.6fr_1fr]">
            {token && plan ? (
              <CurrentToken
                token={token}
                plan={plan}
                match={session.match}
                hint={hintFor(token.reading || token.surface)}
              />
            ) : (
              <EmptyToken label="No tokens" />
            )}
            {nextToken && nextPlan ? (
              <NextToken
                token={nextToken}
                plan={nextPlan}
                hint={hintFor(nextToken.reading || nextToken.surface)}
              />
            ) : (
              <EmptyToken label="Last token" />
            )}
          </div>
        )}

        {showBoard && (
          <Keyboard
            board={config.mode === 'kana' ? config.board : 'ansi'}
            mode={config.mode}
            press={session.paused || done ? null : (exp?.press ?? null)}
            unreachable={done ? [] : blocked}
            heat={heat}
          />
        )}

        <Progress session={session} />
      </div>

      {segmented && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 px-6 py-4">
          <label className="flex items-center gap-2 font-mono text-xs text-neutral-500">
            start
            <select
              value={para}
              onChange={(e) => restart(config, Number(e.target.value), length, segmented)}
              className="max-w-xs rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 font-sans text-xs text-neutral-300"
            >
              {segmented.paragraphs.map((p, i) => (
                <option key={i} value={i}>
                  {i + 1}. {p.text.slice(0, 28)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 font-mono text-xs text-neutral-500">
            length
            <select
              value={length}
              onChange={(e) => restart(config, para, Number(e.target.value), segmented)}
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-xs text-neutral-300"
            >
              {LENGTHS.map((n) => (
                <option key={n} value={n}>
                  {lengthLabel(n)}
                </option>
              ))}
            </select>
          </label>
          <span className="font-mono text-xs text-neutral-700">
            {doc?.origin}
          </span>
        </div>
      )}

      <SourcePanel
        state={load}
        onDocument={(next, message) => void useDocument(next, message)}
        onBusy={(what) => setLoad({ kind: 'busy', what })}
        onError={(message) => setLoad({ kind: 'error', message })}
        onSample={useSample}
      />

      <footer className="mt-auto flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-neutral-600">
        <span>
          <Kbd>Esc</Kbd> pause
        </span>
        <span>
          <Kbd>Enter</Kbd> skip token
        </span>
        <span>type to advance · wrong keys are counted, never consumed</span>
        {scheme && <span className="text-neutral-700">{scheme.note}</span>}
      </footer>
    </div>
  );
}

function sameConfig(a: InputConfig, b: InputConfig): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === 'kana' && b.mode === 'kana') return a.board === b.board;
  return true;
}

/** The whole session at a glance: what is done, what is left, where the errors were. */
function Progress({ session }: { readonly session: Session }) {
  return (
    <div className="no-select flex flex-wrap gap-x-1.5 gap-y-2 rounded-2xl border border-neutral-900 bg-neutral-900/20 px-5 py-4 text-base leading-relaxed">
      {session.tokens.map((t, i) => {
        const stat = session.stats[i];
        const state =
          i === session.index
            ? 'border-b-2 border-amber-400 text-neutral-100'
            : stat?.done
              ? stat.errors > 0
                ? 'text-rose-400/70'
                : 'text-emerald-400/70'
              : i < session.index
                ? 'text-neutral-700 line-through decoration-neutral-800'
                : 'text-neutral-600';
        return (
          <span key={i} className={state}>
            {t.surface}
          </span>
        );
      })}
    </div>
  );
}

function Paused() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/60 py-20">
      <div className="text-2xl text-neutral-300">一時停止</div>
      <div className="font-mono text-sm text-neutral-500">
        <Kbd>Esc</Kbd> to resume
      </div>
    </div>
  );
}

function Segmented({
  options,
  active,
  onPick,
}: {
  readonly options: readonly string[];
  readonly active: number;
  readonly onPick: (i: number) => void;
}) {
  return (
    <div className="flex rounded-lg border border-neutral-800 p-0.5">
      {options.map((label, i) => (
        <button
          key={label}
          type="button"
          aria-pressed={i === active}
          onClick={(e) => {
            e.currentTarget.blur();
            onPick(i);
          }}
          className={
            'rounded-md px-2.5 py-1 font-mono text-xs transition-colors ' +
            (i === active
              ? 'bg-amber-400/15 text-amber-200'
              : 'text-neutral-500 hover:text-neutral-300')
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Button({
  children,
  onClick,
  disabled,
}: {
  readonly children: React.ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      // Keep the keyboard on the typing surface: a focused button would eat Space.
      onClick={(e) => {
        e.currentTarget.blur();
        onClick();
      }}
      className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 font-mono text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:text-neutral-100 disabled:opacity-40 disabled:hover:border-neutral-800"
    >
      {children}
    </button>
  );
}

function Toggle({
  children,
  pressed,
  onClick,
}: {
  readonly children: React.ReactNode;
  readonly pressed: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={(e) => {
        e.currentTarget.blur();
        onClick();
      }}
      className={
        'rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ' +
        (pressed
          ? 'border-amber-400/60 bg-amber-400/10 text-amber-200'
          : 'border-neutral-800 bg-neutral-900 text-neutral-500 hover:text-neutral-300')
      }
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { readonly children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-[0.7rem] text-neutral-300">
      {children}
    </kbd>
  );
}
