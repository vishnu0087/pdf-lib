import { useCallback, useEffect, useRef, useState } from 'react';
import {
  A4_WIDTH_PX,
  attachSelectedElementHighlighter,
  countEditorPages,
  injectEditorChromeCss,
  insertHtmlAtIframeCaret,
  repaginateTableSheets,
  selectAllText,
  waitForLoadComplete,
} from './editorBridge';
import { Toolbox } from './toolbox/Toolbox';
import {
  buildFieldHtml,
  PLACEHOLDER_TEXT,
  type FieldType,
} from './toolbox/fields';
import { FloatingToolbar } from './editor/FloatingToolbar';

const SIDEBAR_WIDTH_PX = 280;
const HEADER_HEIGHT_PX = 48;

interface Bootstrap {
  docType: string;
  data?: unknown;
  templatePick?: string;
}

function readBootstrap(): Bootstrap | null {
  try {
    const raw = localStorage.getItem('pdfTemplateEditorBootstrap');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function App() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const detachHighlighterRef = useRef<(() => void) | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState('');
  const [html, setHtml] = useState<string | null>(null);
  const [docHeight, setDocHeight] = useState(1123);
  const [iframeReady, setIframeReady] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  /** True only after the first pagination pass is committed. Keeps the
   *  iframe hidden during the pre-paginate → paginated transition so the
   *  user never sees a flash of unpaginated content. */
  const [paginated, setPaginated] = useState(false);
  /** Short-lived flag while Refresh-layout is reflowing. Disables the
   *  refresh button + dims the iframe so the action feels deliberate. */
  const [refreshing, setRefreshing] = useState(false);

  // -------------------- Boot: fetch React-template HTML --------------------
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const b = readBootstrap();
      if (!b || typeof b.docType !== 'string') {
        setError('Open this page from the generator: Template → Edit layout.');
        setBusy(false);
        return;
      }
      setDocType(b.docType);

      let baseData: unknown = b.data;
      if (baseData == null) {
        try {
          const r = await fetch(
            `/api/placeholder-data?docType=${encodeURIComponent(b.docType)}`
          );
          const payload = (await r.json().catch(() => ({}))) as Record<string, unknown>;
          if (!r.ok || cancelled) {
            if (!cancelled)
              setError(String(payload.error || 'Could not load preview data.'));
            setBusy(false);
            return;
          }
          const pdfPayload = { ...payload };
          delete pdfPayload.tokenMap;
          baseData = pdfPayload;
        } catch {
          if (!cancelled) setError('Could not load preview data.');
          setBusy(false);
          return;
        }
      }

      try {
        const ex = await fetch('/api/template-extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docType: b.docType, data: baseData }),
        });
        const jr = await ex.json().catch(() => ({}));
        if (!ex.ok || cancelled) {
          if (!cancelled) setError(String(jr.error || 'Could not load template baseline.'));
          setBusy(false);
          return;
        }
        const overrides = jr.overrides || {};

        // This endpoint runs renderPdfDocumentShellToHtml — the SAME React
        // template component Puppeteer renders for PDF export. The HTML
        // returned is the React component tree's static markup.
        const pr = await fetch('/api/template-preview-html', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docType: b.docType, data: baseData, overrides }),
        });
        const jh = await pr.json().catch(() => ({}));
        if (!pr.ok || cancelled) {
          if (!cancelled) setError(String(jh.error || 'Could not render preview.'));
          setBusy(false);
          return;
        }
        if (!cancelled) {
          setHtml(jh.html);
          setBusy(false);
        }
      } catch {
        if (!cancelled) setError('Could not render template preview.');
        setBusy(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------- Mount HTML, emulate print media, enable editing --------------------
  useEffect(() => {
    if (!html) return;
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;

    try {
      doc.open();
      doc.write(html);
      doc.close();
    } catch {
      return;
    }
    doc.querySelectorAll('script').forEach((s) => s.parentNode?.removeChild(s));

    let cancelled = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      try {
        await waitForLoadComplete(doc);
      } catch {
        /* */
      }
      if (cancelled) return;

      // NOTE: We deliberately do NOT promote @media print rules to apply
      // on screen. The template's print CSS contains rules that intentionally
      // strip per-sheet background artwork during PDF rendering (so the
      // @page rule provides per-page backgrounds instead). Promoting those
      // rules to screen would erase the artwork in the editor. The break /
      // pagination rules we actually need are already replicated under
      // @media all inside EDITOR_CHROME_CSS, so the pagination engine sees
      // them via getComputedStyle on screen.
      injectEditorChromeCss(doc);

      // Run the pagination engine ONCE so `.sheet--table` content that
      // exceeds 297mm is split into additional `.sheet--table` siblings.
      // Each sibling renders as its own A4 page card. Pagination is NOT
      // re-run on every keystroke (that was the source of the previous
      // "content shuffles randomly" feeling) — the user can click the
      // "Refresh layout" button to re-paginate after edits.
      try {
        const result = repaginateTableSheets(doc);
        setPageCount(result.pages);
      } catch {
        setPageCount(countEditorPages(doc));
      }

      // Inline editing: same `designMode='on'` mechanism Google Docs uses.
      try {
        (doc as Document & { designMode?: string }).designMode = 'on';
      } catch {
        /* */
      }
      doc.body
        ?.querySelectorAll('img')
        .forEach((img) => {
          (img as HTMLImageElement).draggable = false;
          (img as HTMLImageElement).contentEditable = 'false';
        });

      // Highlight the caret's current `.tpl-field` ancestor so users see a
      // soft outline around the block they're editing.
      detachHighlighterRef.current = attachSelectedElementHighlighter(doc);

      const measure = () => {
        const h = Math.max(
          doc.documentElement.scrollHeight,
          doc.body.scrollHeight
        );
        setDocHeight(h);
      };
      measure();
      ro = new ResizeObserver(measure);
      ro.observe(doc.body);
      setIframeReady(true);
      // Reveal the iframe AFTER pagination + highlighter are in place so
      // the user never sees a flash of unpaginated content.
      setPaginated(true);
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      detachHighlighterRef.current?.();
      detachHighlighterRef.current = null;
      setIframeReady(false);
      setPaginated(false);
    };
  }, [html]);

  // -------------------- Refresh layout (re-paginate after edits) --------------------
  const handleRefreshLayout = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || refreshing) return;
    setRefreshing(true);
    // Defer pagination one rAF so the "Refreshing…" UI paints first; the
    // synchronous DOM mutation otherwise blocks visual feedback.
    requestAnimationFrame(() => {
      try {
        const result = repaginateTableSheets(doc);
        setPageCount(result.pages);
      } catch {
        setPageCount(countEditorPages(doc));
      } finally {
        // Brief delay so the dim-then-settle animation is perceptible
        // even on fast machines.
        window.setTimeout(() => setRefreshing(false), 120);
      }
    });
  }, [refreshing]);

  // -------------------- Toolbox insertion --------------------
  const handleInsert = useCallback((type: FieldType) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const node = insertHtmlAtIframeCaret(doc, buildFieldHtml(type));
    if (!node) return;
    if (PLACEHOLDER_TEXT[type]) selectAllText(doc, node);
  }, []);

  // -------------------- Render --------------------
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-base font-semibold text-slate-900">Could not load preview</h1>
          <p className="mt-2 max-w-sm text-[13px] text-slate-600">{error}</p>
          <button
            type="button"
            onClick={() => window.close()}
            className="mt-6 rounded-md bg-slate-900 px-5 py-2 text-[12px] font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-slate-200 text-slate-900">
      <header
        className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4"
        style={{ height: HEADER_HEIGHT_PX }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-white">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 3h9l5 5v13H6z M14 3v6h6" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[13px] font-semibold text-slate-900">Template editor</span>
            <span className="text-[11px] text-slate-500">
              {docType ? docType.charAt(0).toUpperCase() + docType.slice(1) : ''}
              {pageCount > 1 ? ` · ${pageCount} pages` : ' · 1 page'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRefreshLayout}
            disabled={refreshing}
            title="Re-flow content into pages"
            className={
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ' +
              (refreshing
                ? 'cursor-wait text-slate-400'
                : 'text-slate-600 hover:bg-slate-100')
            }
          >
            <svg
              width={13}
              height={13}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={refreshing ? 'animate-spin' : ''}
            >
              <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.36 6.36L3 16M3 21v-5h5" />
            </svg>
            {refreshing ? 'Refreshing…' : 'Refresh layout'}
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="rounded-md px-3 py-1.5 text-[12px] font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            Close
          </button>
        </div>
      </header>

      {/*
       * Preview area — the iframe renders the SAME React template component
       * tree Puppeteer uses for PDF export. The iframe is locked to 794px
       * (Puppeteer's print viewport width) so the template's CSS receives
       * the same layout context. Inside the iframe, `designMode='on'` makes
       * every text node inline-editable like Google Docs.
       */}
      <div className="relative flex-1 min-h-0 overflow-auto bg-slate-200">
        {busy || !paginated ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-500">
            <div className="flex items-center gap-2 text-[13px]">
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} opacity={0.25} />
                <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
              </svg>
              {busy ? 'Loading template…' : 'Laying out pages…'}
            </div>
          </div>
        ) : null}

        <div
          className="mx-auto my-8"
          style={{ width: A4_WIDTH_PX }}
        >
          <iframe
            ref={iframeRef}
            title="Template preview"
            scrolling="no"
            className={
              'block border-0 transition-opacity duration-150 ' +
              (paginated ? 'opacity-100' : 'opacity-0') +
              (refreshing ? ' opacity-60' : '')
            }
            style={{ width: A4_WIDTH_PX, height: docHeight, display: 'block' }}
          />
        </div>
      </div>

      {/*
       * Toolbox sidebar — position:fixed overlay so it cannot affect the
       * preview's layout. The preview keeps its full available area and the
       * A4 page sits at its natural geometry regardless of sidebar presence.
       */}
      <aside
        className="fixed bottom-0 right-0 z-20 border-l border-slate-200 bg-white shadow-[-6px_0_16px_rgba(15,23,42,0.06)]"
        style={{ top: HEADER_HEIGHT_PX, width: SIDEBAR_WIDTH_PX }}
      >
        <Toolbox onInsert={handleInsert} />
      </aside>

      {iframeReady ? <FloatingToolbar iframeRef={iframeRef} /> : null}
    </div>
  );
}
