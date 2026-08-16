/**
 * Where practice text comes from.
 *
 * A source is anything that can hand back paragraphs of Japanese. The app only
 * knows this interface, so adding a new corpus - another filing service, a
 * novel, an RSS feed - means writing one module and adding it to `SOURCES`,
 * with nothing else in the app changing. See the README.
 */

/** The on-disk shape written by the build-time scripts. */
export interface SourceDocJson {
  readonly id: string;
  readonly title: string;
  /** Human-readable provenance, shown in the UI. */
  readonly origin: string;
  readonly fetchedAt: string;
  /** Set when the document is a committed fallback rather than a live fetch. */
  readonly note?: string;
  readonly paragraphs: readonly string[];
  /** EDINET filings carry these; other sources do not. */
  readonly docID?: string;
  readonly fiscalYear?: string;
}

export interface SourceDoc extends SourceDocJson {
  /** True when the app fell back to committed data instead of fetching. */
  readonly isFallback: boolean;
}

export interface TextSource {
  readonly id: string;
  readonly label: string;
  /** One line describing where the text comes from, shown under the picker. */
  readonly description: string;
  load: () => Promise<SourceDoc>;
}

/**
 * Toyota's 統合報告書, cropped to prose at build time.
 *
 * EDINET v2 needs a subscription key and refuses browser CORS, so nothing here
 * can fetch it live: `scripts/fetch-edinet.ts` does that, and this reads what
 * it committed. That is also why `isFallback` exists - the app says out loud
 * when it is reading the committed copy rather than a fresh filing.
 */
export const edinetSource: TextSource = {
  id: 'edinet-toyota',
  label: 'トヨタ 統合報告書',
  description: 'EDINET / Toyota disclosure, cropped to prose at build time.',
  load: async () => {
    const doc = (await import('../../data/default-source.json')).default as SourceDocJson;
    return { ...doc, isFallback: doc.note !== undefined };
  },
};

/** Every source the picker offers. Add new ones here. */
export const SOURCES: readonly TextSource[] = [edinetSource];

export function sourceById(id: string): TextSource | undefined {
  return SOURCES.find((s) => s.id === id);
}
