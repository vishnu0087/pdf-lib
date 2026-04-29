import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  FONT_PT_SIZES,
  applyFontStyleToInlineSelection,
  buildSyncOverridesFromRibbonInput,
  focusIframeDoc,
  getTableContextFromCaret,
  insertTableMarkup,
  normalizeColorForInput as normColor,
  observeNewImages,
  persistLiveHtmlToLocalStorage,
  runCmd,
  sanitizeHtml,
  selectionCollapsed,
  syncHeadersIntoDraft,
  updateLiveThemeCssFromDraft,
  wireDesignMode,
} from './editorBridge';

type TabName = 'home' | 'insert' | 'layout';

const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: 'Montserrat', value: 'Montserrat, sans-serif' },
  { label: 'Segoe UI', value: '\'Segoe UI\', sans-serif' },
  { label: 'Times New Roman', value: '\'Times New Roman\', serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Calibri', value: '\'Calibri\', sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
];

function readBootstrap(): null | {
  docType: string;
  data: unknown;
  templatePick?: string;
} {
  try {
    const raw = localStorage.getItem('pdfTemplateEditorBootstrap');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const snapTm = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unobs = useRef<(() => void) | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [ribbonTab, setRibbonTab] = useState<TabName>('home');
  const [docType, setDocType] = useState('');
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(true);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  /** Snapshot of payload for fingerprint (stable after bootstrap). */
  const [snapshotData] = useState<unknown>(() => readBootstrap()?.data ?? null);

  const [tblRows, setTblRows] = useState('3');
  const [tblCols, setTblCols] = useState('4');
  const [tblWidthPct, setTblWidthPct] = useState('');
  const [cellW, setCellW] = useState('');
  const [cellH, setCellH] = useState('');
  const [cellBg, setCellBg] = useState('#ffffff');

  const rib = useMemo(() => {
    const ds =
      draft.document &&
      typeof draft.document === 'object' &&
      draft.document !== null &&
      'defaultStyle' in draft.document &&
      typeof (draft.document as { defaultStyle?: unknown }).defaultStyle ===
        'object' &&
      (draft.document as { defaultStyle: Record<string, unknown> })
        .defaultStyle
        ? (draft.document as { defaultStyle: Record<string, unknown> })
            .defaultStyle
        : {};
    const fs = Number(ds.fontSize) || 8;
    let famRaw =
      ds.fontFamily != null ? String(ds.fontFamily) : 'Montserrat, sans-serif';
    const guess = FONT_FAMILIES.find(
      (f) => famRaw === f.value || famRaw.includes(f.value.split(',')[0].trim())
    );
    famRaw = guess ? guess.value : FONT_FAMILIES[0].value;
    const fg = normColor(
      ds.color != null ? String(ds.color) : undefined,
      '#212121'
    );
    return { fontSize: fs, fontFamily: famRaw, color: fg };
  }, [draft]);

  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const scheduleSnapshot = useCallback(() => {
    const iframe = iframeRef.current;
    if (snapTm.current) clearTimeout(snapTm.current);
    snapTm.current = window.setTimeout(() => {
      snapTm.current = null;
      persistLiveHtmlToLocalStorage(iframe, docType, snapshotData);
    }, 380);
  }, [docType, snapshotData]);

  const flushSnapshot = useCallback(() => {
    persistLiveHtmlToLocalStorage(iframeRef.current, docType, snapshotData);
  }, [docType, snapshotData]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const b = readBootstrap();
      if (
        !b ||
        typeof b.docType !== 'string' ||
        b.data == null
      ) {
        setError(
          'Open this editor from Generate PDF · step 3 (Customize template).'
        );
        setBusy(false);
        return;
      }
      setDocType(b.docType);

      let html = '';

      const pick =
        typeof b.templatePick === 'string' && String(b.templatePick).trim() !== ''
          ? b.templatePick
          : 'default';
      if (pick && pick !== 'default') {
        try {
          const r = await fetch(
            `/api/custom-templates/${encodeURIComponent(pick)}?docType=${encodeURIComponent(b.docType)}`
          );
          const disk = await r.json();
          if (
            r.ok &&
            disk.overrides &&
            disk.overrides._liveHtml &&
            String(disk.overrides._liveHtml).length > 400
          ) {
            setDraft({ ...disk.overrides });
            html = disk.overrides._liveHtml;
          }
        } catch {
          /* */
        }
      }

      if (!html) {
        const ex = await fetch('/api/template-extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            docType: b.docType,
            data: b.data,
          }),
        });
        const jr = await ex.json().catch(() => ({}));
        if (!ex.ok || cancelled) {
          if (!cancelled)
            setError(jr.error || 'Could not read template baseline.');
          setBusy(false);
          return;
        }
        const ov = jr.overrides || {};
        setDraft(ov);

        const pr = await fetch('/api/template-preview-html', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            docType: b.docType,
            data: b.data,
            overrides: ov,
          }),
        });
        const jh = await pr.json().catch(() => ({}));
        if (!pr.ok || cancelled) {
          if (!cancelled) setError(jh.error || 'Could not render preview.');
          setBusy(false);
          return;
        }
        html = jh.html;
      }

      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      if (cancelled) {
        URL.revokeObjectURL(url);
        return;
      }
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setBusy(false);
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
  }, [previewBlobUrl]);

  const mergeDraftFromRibbon = useCallback(
    (patch: { fontSizePt: number; fontFamily: string; color: string }) => {
      setDraft((prev) => buildSyncOverridesFromRibbonInput(prev, patch));
    },
    []
  );

  /** After iframe parses — wire design mode and observe */
  const onIframeLoad = useCallback(() => {
    const el = iframeRef.current;
    if (!el?.contentDocument) return;
    wireDesignMode(el);
    updateLiveThemeCssFromDraft(el.contentDocument, draftRef.current);
    unobs.current?.();
    unobs.current = observeNewImages(el, scheduleSnapshot);
    el.contentDocument.body?.addEventListener('input', scheduleSnapshot);
    el.contentDocument.body?.addEventListener('mouseup', scheduleSnapshot);
    el.contentDocument.body?.addEventListener('keyup', scheduleSnapshot);

    flushSnapshot();
    el.contentWindow?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's')
        e.preventDefault();
    });
  }, [flushSnapshot, scheduleSnapshot]);

  /** Keep theme CSS aligned when overrides draft updates from API or ribbon */
  useEffect(() => {
    const d = iframeRef.current?.contentDocument;
    if (d) updateLiveThemeCssFromDraft(d, draft);
  }, [draft]);

  function onFontFamilyChange(v: string) {
    mergeDraftFromRibbon({
      fontSizePt: rib.fontSize,
      fontFamily: v,
      color: rib.color,
    });
    focusIframeDoc(iframeRef.current);
    if (
      iframeRef.current &&
      !selectionCollapsed(iframeRef.current) &&
      applyFontStyleToInlineSelection(iframeRef.current, {
        fontSize: `${rib.fontSize}pt`,
        fontFamily: v,
        color: rib.color,
      })
    )
      scheduleSnapshot();
    else {
      updateLiveThemeCssFromDraft(
        iframeRef.current?.contentDocument ?? null,
        buildSyncOverridesFromRibbonInput(draft, {
          fontSizePt: rib.fontSize,
          fontFamily: v,
          color: rib.color,
        })
      );
      flushSnapshot();
    }
  }

  function onFontSizeChange(v: string) {
    const n = Number(v) || 8;
    mergeDraftFromRibbon({
      fontSizePt: n,
      fontFamily: rib.fontFamily,
      color: rib.color,
    });
    focusIframeDoc(iframeRef.current);
    if (
      iframeRef.current &&
      !selectionCollapsed(iframeRef.current) &&
      applyFontStyleToInlineSelection(iframeRef.current, {
        fontSize: `${n}pt`,
        fontFamily: rib.fontFamily,
        color: rib.color,
      })
    )
      scheduleSnapshot();
    else {
      updateLiveThemeCssFromDraft(
        iframeRef.current?.contentDocument ?? null,
        buildSyncOverridesFromRibbonInput(draft, {
          fontSizePt: n,
          fontFamily: rib.fontFamily,
          color: rib.color,
        })
      );
      flushSnapshot();
    }
  }

  async function handleSaveTemplate() {
    const name =
      typeof prompt === 'function' ? prompt('Save template as:', 'My template') : '';
    if (name === null || name === '') return;
    let next = draft;
    const iframe = iframeRef.current;
    if (iframe?.contentDocument) {
      next = syncHeadersIntoDraft(iframe.contentDocument, docType, draft);
      setDraft(next);
    }
    const mergedRibbon = buildSyncOverridesFromRibbonInput(next, {
      fontSizePt: rib.fontSize,
      fontFamily: rib.fontFamily,
      color: rib.color,
    });
    const overrides = JSON.parse(
      JSON.stringify(mergedRibbon)
    ) as Record<string, unknown>;
    if (iframe?.contentDocument?.documentElement)
      overrides._liveHtml = sanitizeHtml(
        iframe.contentDocument.documentElement.outerHTML
      );

    try {
      const res = await fetch('/api/custom-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docType, name, overrides }),
      });
      const jr = await res.json();
      if (!res.ok) throw new Error(jr.error || 'Save failed');
      try {
        if (window.opener && !window.opener.closed)
          window.opener.postMessage(
            { type: 'pdf-template-saved', id: jr.id },
            '*'
          );
      } catch {
        /* */
      }
      alert(`Saved as "${jr.name}". Choose it on step 3 in the wizard.`);
      flushSnapshot();
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-4 text-center text-neutral-700">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">
            Could not load the editor.
          </h1>
          <p className="mt-3 max-w-md text-sm text-neutral-600">{error}</p>
        </div>
        <button
          type="button"
          className="rounded-md border border-neutral-300 bg-white px-6 py-2 text-sm font-semibold shadow-sm hover:bg-neutral-50"
          onClick={() => window.close()}
        >
          Close tab
        </button>
      </div>
    );
  }

  if (busy) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf9f8] text-neutral-600">
        <p className="text-sm">Loading template…</p>
      </div>
    );
  }

  const tabCls = (t: TabName) =>
    `rounded-t px-4 py-2 text-[13px] ${
      ribbonTab === t
        ? '-mb-px border border-b-white border-neutral-300 bg-white font-semibold text-neutral-900'
        : 'border border-transparent text-neutral-600 hover:bg-white/70'
    }`;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f3f2f1] text-[13px] text-neutral-800">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-neutral-300 bg-white px-3">
        <span className="rounded-sm bg-[#185abd] px-4 py-[6px] text-xs font-semibold uppercase text-white">
          PDF
        </span>
        <h1 className="flex-1 text-[15px] font-semibold text-neutral-900">
          {docType ? `${docType} · Template editor` : 'Template editor'}
        </h1>
        <button
          type="button"
          className="rounded-sm border border-neutral-400 bg-white px-3 py-[7px] text-xs font-semibold shadow-sm hover:bg-neutral-50"
          onClick={handleSaveTemplate}
        >
          Save as new template…
        </button>
      </header>

      <div className="shrink-0 border-b border-neutral-300 bg-[#f3f2f1]">
        <div className="flex gap-0 pl-2 pt-[6px]">
          <button
            type="button"
            className={tabCls('home')}
            onClick={() => setRibbonTab('home')}
          >
            Home
          </button>
          <button
            type="button"
            className={tabCls('insert')}
            onClick={() => setRibbonTab('insert')}
          >
            Insert
          </button>
          <button
            type="button"
            className={tabCls('layout')}
            onClick={() => setRibbonTab('layout')}
          >
            Layout
          </button>
        </div>

        {ribbonTab === 'home' && (
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-neutral-300 bg-white px-3 py-[10px]">
            <RibbonGroup label="Font">
              <select
                className="h-7 max-w-[9rem] min-w-[9rem] rounded-[2px] border border-neutral-500 bg-white px-1 text-[inherit]"
                value={rib.fontFamily}
                onChange={(e) => onFontFamilyChange(e.target.value)}
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                className="h-7 w-[4rem] min-w-[3.85rem] rounded-[2px] border border-neutral-500 bg-white px-1 text-[inherit]"
                value={String(rib.fontSize)}
                onChange={(e) => onFontSizeChange(e.target.value)}
              >
                {FONT_PT_SIZES.map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </RibbonGroup>
            <RibbonGroup label="Basic">
              <RibbonBtn
                title="Bold"
                onClick={() =>
                  runCmd(iframeRef.current, 'bold', null, scheduleSnapshot)
                }
              >
                <span className="font-black">B</span>
              </RibbonBtn>
              <RibbonBtn
                title="Italic"
                onClick={() =>
                  runCmd(iframeRef.current, 'italic', null, scheduleSnapshot)
                }
              >
                <span className="italic">I</span>
              </RibbonBtn>
              <RibbonBtn
                title="Underline"
                onClick={() =>
                  runCmd(
                    iframeRef.current,
                    'underline',
                    null,
                    scheduleSnapshot
                  )
                }
              >
                <span className="underline">U</span>
              </RibbonBtn>
              <RibbonBtn
                title="Strikethrough"
                onClick={() =>
                  runCmd(
                    iframeRef.current,
                    'strikeThrough',
                    null,
                    scheduleSnapshot
                  )
                }
              >
                <span className="line-through">S</span>
              </RibbonBtn>
            </RibbonGroup>
            <RibbonGroup label="Paragraph">
              <RibbonBtn
                title="Left"
                onClick={() =>
                  runCmd(
                    iframeRef.current,
                    'justifyLeft',
                    null,
                    scheduleSnapshot
                  )
                }
              >
                ☰
              </RibbonBtn>
              <RibbonBtn
                title="Center"
                onClick={() =>
                  runCmd(
                    iframeRef.current,
                    'justifyCenter',
                    null,
                    scheduleSnapshot
                  )
                }
              >
                ≡
              </RibbonBtn>
              <RibbonBtn
                title="Right"
                onClick={() =>
                  runCmd(
                    iframeRef.current,
                    'justifyRight',
                    null,
                    scheduleSnapshot
                  )
                }
              >
                ☷
              </RibbonBtn>
              <RibbonBtn
                title="Justify"
                onClick={() =>
                  runCmd(
                    iframeRef.current,
                    'justifyFull',
                    null,
                    scheduleSnapshot
                  )
                }
              >
                ▤
              </RibbonBtn>
            </RibbonGroup>
            <RibbonGroup label="Colour">
              <input
                type="color"
                title="Font colour"
                value={normColor(rib.color, '#212121')}
                onChange={(e) => {
                  mergeDraftFromRibbon({
                    fontSizePt: rib.fontSize,
                    fontFamily: rib.fontFamily,
                    color: e.target.value,
                  });
                  focusIframeDoc(iframeRef.current);
                  if (
                    iframeRef.current &&
                    !selectionCollapsed(iframeRef.current)
                  )
                    applyFontStyleToInlineSelection(iframeRef.current, {
                      color: e.target.value,
                    });
                  updateLiveThemeCssFromDraft(
                    iframeRef.current?.contentDocument ?? null,
                    buildSyncOverridesFromRibbonInput(draft, {
                      fontSizePt: rib.fontSize,
                      fontFamily: rib.fontFamily,
                      color: e.target.value,
                    })
                  );
                  flushSnapshot();
                }}
                className="h-[26px] w-[26px] cursor-pointer rounded border border-neutral-600 p-0"
              />
            </RibbonGroup>
          </div>
        )}

        {ribbonTab === 'insert' && (
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-neutral-300 bg-white px-3 py-[10px]">
            <RibbonGroup label="Illustrations">
              <button
                type="button"
                className="rounded-sm border border-neutral-400 bg-white px-3 py-[5px] text-xs font-semibold hover:bg-neutral-50"
                onClick={() => imgInputRef.current?.click()}
              >
                Pictures
              </button>
              <input
                ref={imgInputRef}
                type="file"
                accept="image/*,.svg"
                aria-hidden="true"
                tabIndex={-1}
                className="sr-only"
                onChange={(ev) => {
                  const f = ev.target.files?.[0];
                  ev.target.value = '';
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = () => {
                    const uri = String(r.result);
                    const iframe = iframeRef.current;
                    focusIframeDoc(iframe);
                    try {
                      iframe?.contentWindow?.document.execCommand(
                        'insertImage',
                        false,
                        uri
                      );
                    } catch {
                      const esc = uri
                        .replace(/&/g, '&amp;')
                        .replace(/"/g, '&quot;');
                      iframe?.contentWindow?.document.execCommand(
                        'insertHTML',
                        false,
                        `<img alt="" src="${esc}" />`
                      );
                    }
                    scheduleSnapshot();
                  };
                  r.readAsDataURL(f);
                }}
              />
            </RibbonGroup>
            <RibbonGroup label="Tables">
              <label className="flex items-center gap-1">
                <span className="text-[10px] text-neutral-500">Rows</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  className="h-7 w-14 rounded border border-neutral-500 px-1"
                  value={tblRows}
                  onChange={(ev) => setTblRows(ev.target.value)}
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="text-[10px] text-neutral-500">Cols</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="h-7 w-14 rounded border border-neutral-500 px-1"
                  value={tblCols}
                  onChange={(ev) => setTblCols(ev.target.value)}
                />
              </label>
              <button
                type="button"
                className="rounded-sm border border-neutral-400 bg-white px-3 py-[5px] text-xs font-semibold hover:bg-neutral-50"
                onClick={() => {
                  const rows = Math.min(30, Math.max(1, Number(tblRows) || 3));
                  const cols = Math.min(20, Math.max(1, Number(tblCols) || 4));
                  runCmd(
                    iframeRef.current,
                    'insertHTML',
                    insertTableMarkup(rows, cols),
                    scheduleSnapshot
                  );
                }}
              >
                Insert table
              </button>
            </RibbonGroup>
          </div>
        )}

        {ribbonTab === 'layout' && (
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-neutral-300 bg-white px-3 py-[10px]">
            <RibbonGroup label="Table width">
              <input
                type="number"
                placeholder="%"
                className="h-7 w-16 rounded border border-neutral-500 px-1"
                value={tblWidthPct}
                onChange={(e) => setTblWidthPct(e.target.value)}
              />
              <button
                type="button"
                className="rounded-sm border border-neutral-400 bg-white px-2 py-[5px] text-xs font-semibold"
                onClick={() => {
                  const n = Number(tblWidthPct);
                  const { table } = getTableContextFromCaret(iframeRef.current);
                  if (!table) {
                    alert('Put the caret inside a table.');
                    return;
                  }
                  if (!Number.isFinite(n) || n < 10 || n > 100) return;
                  table.style.width = `${n}%`;
                  scheduleSnapshot();
                }}
              >
                Apply
              </button>
            </RibbonGroup>
            <RibbonGroup label="Cell size">
              <input
                className="h-7 w-[5.5rem] rounded border px-1"
                placeholder="width"
                value={cellW}
                onChange={(e) => setCellW(e.target.value)}
              />
              <input
                className="h-7 w-[5.5rem] rounded border px-1"
                placeholder="height"
                value={cellH}
                onChange={(e) => setCellH(e.target.value)}
              />
              <button
                type="button"
                className="rounded-sm border border-neutral-400 bg-white px-2 py-[5px] text-xs font-semibold"
                onClick={() => {
                  const { cell } = getTableContextFromCaret(iframeRef.current);
                  if (!cell) {
                    alert('Put the caret inside a cell.');
                    return;
                  }
                  if (cellW.trim()) cell.style.width = cellW.trim();
                  if (cellH.trim()) cell.style.height = cellH.trim();
                  scheduleSnapshot();
                }}
              >
                Apply
              </button>
            </RibbonGroup>
            <RibbonGroup label="Shading">
              <input
                type="color"
                value={cellBg}
                onChange={(e) => setCellBg(e.target.value)}
                className="h-[26px] w-[26px] cursor-pointer rounded border border-neutral-600 p-0"
              />
              <button
                type="button"
                className="rounded-sm border border-neutral-400 bg-white px-2 py-[5px] text-xs font-semibold"
                onClick={() => {
                  const { cell } = getTableContextFromCaret(iframeRef.current);
                  if (!cell) {
                    alert('Put the caret inside a cell.');
                    return;
                  }
                  cell.style.backgroundColor = cellBg;
                  scheduleSnapshot();
                }}
              >
                Fill cell
              </button>
            </RibbonGroup>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-[#9e9e9e]">
        <iframe
          title="PDF template preview"
          ref={iframeRef}
          className="h-full w-full border-0 bg-[#808080]"
          onLoad={onIframeLoad}
          src={previewBlobUrl || undefined}
        />
      </div>
    </div>
  );
}

function RibbonGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-stretch gap-1">
      <div className="flex flex-wrap items-center gap-1">{children}</div>
      <span className="select-none text-center text-[10px] text-neutral-500">
        {label}
      </span>
    </div>
  );
}

function RibbonBtn({
  children,
  title,
  onClick,
}: {
  title: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-7 min-w-[28px] items-center justify-center rounded-[2px] border border-transparent font-serif text-neutral-900 hover:border-neutral-400 hover:bg-neutral-200"
    >
      {children}
    </button>
  );
}
