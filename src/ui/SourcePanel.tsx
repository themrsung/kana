import { useCallback, useRef, useState } from 'react';
import { ACCEPTED } from '../core/text/extract';
import { ingestFile, ingestPaste, toDocument } from '../core/text/ingest';
import { SOURCES, type SourceDoc } from '../core/text/source';

export type LoadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy'; readonly what: string }
  | { readonly kind: 'error'; readonly message: string };

interface Props {
  readonly state: LoadState;
  readonly onDocument: (doc: SourceDoc, notice: string | null) => void;
  readonly onBusy: (what: string) => void;
  readonly onError: (message: string) => void;
  readonly onSample: () => void;
}

/**
 * Loading text. Three doors to the same place: the bundled corpus, a file, or a
 * paste. No <form> anywhere - the spec rules it out, and there is nothing here
 * that a form would buy.
 */
export function SourcePanel({ state, onDocument, onBusy, onError, onSample }: Props) {
  const [dragging, setDragging] = useState(false);
  const [paste, setPaste] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = state.kind === 'busy';

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      onBusy(`${file.name} を読み込み中`);
      try {
        const ingested = await ingestFile(file);
        if (ingested.text.trim() === '') throw new Error('No text found in that file.');
        onDocument(toDocument(ingested), ingested.notice);
      } catch (err) {
        onError(err instanceof Error ? err.message : String(err));
      }
    },
    [onBusy, onDocument, onError],
  );

  const loadSource = useCallback(
    async (id: string) => {
      const source = SOURCES.find((s) => s.id === id);
      if (!source) return;
      onBusy(`${source.label} を読み込み中`);
      try {
        onDocument(await source.load(), null);
      } catch (err) {
        onError(err instanceof Error ? err.message : String(err));
      }
    },
    [onBusy, onDocument, onError],
  );

  return (
    <section
      aria-label="Text source"
      className={
        'rounded-2xl border bg-neutral-900/40 p-6 transition-colors ' +
        (dragging ? 'border-amber-400 bg-amber-400/5' : 'border-neutral-800')
      }
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 font-mono text-xs tracking-widest text-neutral-500 uppercase">Text</span>
        <Chip onClick={onSample} disabled={busy}>
          ウォームアップ
        </Chip>
        {SOURCES.map((s) => (
          <Chip key={s.id} onClick={() => void loadSource(s.id)} disabled={busy}>
            {s.label}
          </Chip>
        ))}
        <Chip onClick={() => fileRef.current?.click()} disabled={busy}>
          ファイル…
        </Chip>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="日本語のテキストを貼り付け、またはファイルをドロップ（.txt .md .pdf .json .html）"
          rows={3}
          className="min-w-0 flex-1 resize-y rounded-xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 font-sans text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-neutral-700"
        />
        <button
          type="button"
          disabled={busy || paste.trim() === ''}
          onClick={() => {
            const ingested = ingestPaste(paste);
            onDocument(toDocument(ingested), ingested.notice);
          }}
          className="self-start rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 font-mono text-xs text-neutral-300 transition-colors hover:border-neutral-700 hover:text-neutral-100 disabled:opacity-40"
        >
          使う
        </button>
      </div>

      <Status state={state} />
    </section>
  );
}

function Status({ state }: { readonly state: LoadState }) {
  if (state.kind === 'idle') return null;
  if (state.kind === 'error') {
    return (
      <p role="alert" className="mt-3 font-mono text-xs text-rose-400">
        {state.message}
      </p>
    );
  }
  return (
    <p role="status" className="mt-3 flex items-center gap-2 font-mono text-xs text-amber-300">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
      {state.what}
    </p>
  );
}

function Chip({
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
      onClick={(e) => {
        e.currentTarget.blur();
        onClick();
      }}
      className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 font-mono text-xs text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-100 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
