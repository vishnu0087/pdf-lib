import { Editor } from '@tinymce/tinymce-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Editor as TinyEditor } from 'tinymce';
import {
  FONT_PT_SIZES,
  buildSyncOverridesFromRibbonInput,
  injectPdfHeadIntoEditorDoc,
  mergeTemplateHtml,
  normalizeColorForInput as normColor,
  persistLiveHtmlString,
  sanitizeHtml,
  splitTemplateHtml,
  type TemplateHtmlParts,
  syncHeadersIntoDraft,
  updateLiveThemeCssFromDraft,
} from './editorBridge';

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

function editorToolbarHeightPx(): number {
  return Math.max(380, Math.min(920, window.innerHeight - 220));
}

export default function App() {
  const editorRef = useRef<TinyEditor | null>(null);
  const templatePartsRef = useRef<TemplateHtmlParts | null>(null);
  /** DOM lib uses numeric timer ids; avoid NodeJS.Timeout from mixed typings */
  const snapTm = useRef<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState('');
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(true);
  const [initialBody, setInitialBody] = useState<string | null>(null);
  const [editorH, setEditorH] = useState(editorToolbarHeightPx);

  /** Snapshot of payload for fingerprint (stable after bootstrap). */
  const [snapshotData] = useState<unknown>(() => readBootstrap()?.data ?? null);

  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

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

  const scheduleSnapshot = useCallback(() => {
    const ed = editorRef.current;
    const parts = templatePartsRef.current;
    if (!ed || !parts) return;
    if (snapTm.current != null) window.clearTimeout(snapTm.current);
    snapTm.current = window.setTimeout(() => {
      snapTm.current = null;
      const inner = ed.getContent();
      const full = mergeTemplateHtml({ ...parts, bodyInner: inner });
      persistLiveHtmlString(full, docType, snapshotData);
    }, 400);
  }, [docType, snapshotData]);

  const flushSnapshot = useCallback(() => {
    const ed = editorRef.current;
    const parts = templatePartsRef.current;
    if (!ed || !parts) return;
    const inner = ed.getContent();
    const full = mergeTemplateHtml({ ...parts, bodyInner: inner });
    persistLiveHtmlString(full, docType, snapshotData);
  }, [docType, snapshotData]);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const container = ed.getContainer();
    if (container) {
      container.style.height = `${editorH}px`;
      const ifr = ed.getContentAreaContainer()?.querySelector?.('iframe');
      if (ifr instanceof HTMLIFrameElement) ifr.style.height = `${editorH}px`;
    }
  }, [editorH]);

  useEffect(() => {
    const onResize = () => setEditorH(editorToolbarHeightPx());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const b = readBootstrap();
      if (!b || typeof b.docType !== 'string' || b.data == null) {
        setError(
          'Open this editor from the generator: Template → Edit layout.'
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
          if (r.ok && disk.overrides && typeof disk.overrides === 'object') {
            const liveRaw = disk.overrides._liveHtml;
            const liveOk =
              typeof liveRaw === 'string' && String(liveRaw).length > 400;
            if (liveOk) {
              setDraft({ ...disk.overrides });
              html = String(liveRaw);
            } else {
              const overridesOnly = { ...disk.overrides } as Record<
                string,
                unknown
              >;
              delete overridesOnly._liveHtml;
              setDraft(overridesOnly);
              const pr = await fetch('/api/template-preview-html', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  docType: b.docType,
                  data: b.data,
                  overrides: overridesOnly,
                }),
              });
              const jh = await pr.json().catch(() => ({}));
              if (!pr.ok || cancelled) {
                if (!cancelled)
                  setError(jh.error || 'Could not render saved template.');
                setBusy(false);
                return;
              }
              html = jh.html;
            }
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

      if (cancelled) return;

      const parts = splitTemplateHtml(html);
      templatePartsRef.current = parts;
      setInitialBody(parts.bodyInner);
      setBusy(false);
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const ed = editorRef.current;
    if (ed) updateLiveThemeCssFromDraft(ed.getDoc(), draft);
  }, [draft]);

  function withEditorTheme(
    patch: { fontSizePt: number; fontFamily: string; color: string }
  ) {
    setDraft((prev) => {
      const next = buildSyncOverridesFromRibbonInput(prev, patch);
      const ed = editorRef.current;
      const doc = ed?.getDoc();
      if (doc) updateLiveThemeCssFromDraft(doc, next);
      return next;
    });
  }

  function onFontFamilyChange(v: string) {
    withEditorTheme({
      fontSizePt: rib.fontSize,
      fontFamily: v,
      color: rib.color,
    });
    const ed = editorRef.current;
    if (!ed) return;
    ed.focus();
    const name = v.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    ed.execCommand('FontName', false, name);
    scheduleSnapshot();
  }

  function onFontSizeChange(v: string) {
    const n = Number(v) || 8;
    withEditorTheme({
      fontSizePt: n,
      fontFamily: rib.fontFamily,
      color: rib.color,
    });
    const ed = editorRef.current;
    if (!ed) return;
    ed.focus();
    ed.execCommand('FontSize', false, `${n}pt`);
    scheduleSnapshot();
  }

  async function handleSaveTemplate() {
    const name =
      typeof prompt === 'function' ? prompt('Save template as:', 'My template') : '';
    if (name === null || name === '') return;

    const ed = editorRef.current;
    const parts = templatePartsRef.current;
    if (!ed || !parts) return;

    const inner = ed.getContent();
    const fullHtml = mergeTemplateHtml({ ...parts, bodyInner: inner });
    const domDoc = new DOMParser().parseFromString(fullHtml, 'text/html');

    let next = syncHeadersIntoDraft(domDoc, docType, draftRef.current);
    setDraft(next);

    const mergedRibbon = buildSyncOverridesFromRibbonInput(next, {
      fontSizePt: rib.fontSize,
      fontFamily: rib.fontFamily,
      color: rib.color,
    });
    const overrides = JSON.parse(
      JSON.stringify(mergedRibbon)
    ) as Record<string, unknown>;
    overrides._liveHtml = sanitizeHtml(fullHtml);

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

  const onEditorInit = useCallback(
    (_evt: unknown, editor: TinyEditor) => {
      editorRef.current = editor;
      const parts = templatePartsRef.current;
      if (parts?.prefix)
        injectPdfHeadIntoEditorDoc(editor.getDoc(), parts.prefix);
      updateLiveThemeCssFromDraft(editor.getDoc(), draftRef.current);
      editor.on(
        'change keyup SetContent Undo Redo ExecCommand ObjectResize',
        scheduleSnapshot
      );
      editor.on('keydown', (e) => {
        const ev = e as KeyboardEvent;
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's')
          ev.preventDefault();
      });
      flushSnapshot();
    },
    [flushSnapshot, scheduleSnapshot]
  );

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

  if (busy || initialBody === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf9f8] text-neutral-600">
        <p className="text-sm">Loading template…</p>
      </div>
    );
  }

  const ffList = FONT_FAMILIES.map(
    (f) => `${f.label}=${f.value.split(',')[0].trim().replace(/^['"]|['"]$/g, '')}`
  ).join('; ');

  const fsList = FONT_PT_SIZES.map((n) => `${n}pt`).join(' ');

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f3f2f1] text-[13px] text-neutral-800">
      <header className="flex shrink-0 items-center gap-3 border-b border-neutral-300 bg-white px-3 py-2">
        <span className="shrink-0 rounded-sm bg-[#185abd] px-3 py-[6px] text-xs font-semibold uppercase text-white">
          PDF
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-semibold leading-snug text-neutral-900">
            {docType ? `${docType} · Layout` : 'Template layout'}
          </h1>
          <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">
            Drag table edges and corners to resize columns and rows. Use the
            toolbar for fonts, images, and structure. Theme defaults below sync
            JSON overrides; the built-in default file is never overwritten until
            you save a new template.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-sm border border-neutral-400 bg-white px-3 py-[7px] text-xs font-semibold shadow-sm hover:bg-neutral-50"
          onClick={handleSaveTemplate}
        >
          Save as new template…
        </button>
      </header>

      <div className="shrink-0 border-b border-neutral-300 bg-white px-3 py-2">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <Field label="Document theme · font">
            <select
              className="h-8 max-w-[9rem] min-w-[8.5rem] rounded-[2px] border border-neutral-500 bg-white px-1 text-[inherit]"
              value={rib.fontFamily}
              onChange={(e) => onFontFamilyChange(e.target.value)}
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Size (pt)">
            <select
              className="h-8 w-[4.25rem] rounded-[2px] border border-neutral-500 bg-white px-1 text-[inherit]"
              value={String(rib.fontSize)}
              onChange={(e) => onFontSizeChange(e.target.value)}
            >
              {FONT_PT_SIZES.map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Theme text colour">
            <input
              type="color"
              title="Applies to body theme + selection when changed"
              value={normColor(rib.color, '#212121')}
              onChange={(e) => {
                const c = e.target.value;
                withEditorTheme({
                  fontSizePt: rib.fontSize,
                  fontFamily: rib.fontFamily,
                  color: c,
                });
                const ed = editorRef.current;
                if (ed) {
                  ed.focus();
                  ed.execCommand('ForeColor', false, c);
                }
                scheduleSnapshot();
              }}
              className="h-[30px] w-[30px] cursor-pointer rounded border border-neutral-600 p-0"
            />
          </Field>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#d9d9d9]">
        <div className="flex min-h-full justify-center px-2 py-4">
          <div
            className="w-full shrink-0 overflow-hidden rounded-sm bg-[#e0e0e0] shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_4px_20px_rgba(0,0,0,0.18)]"
            style={{
              maxWidth: 'min(calc(210mm + 1.5rem), calc(100vw - 1rem))',
            }}
          >
            <Editor
              key={`${docType}-tpl`}
              tinymceScriptSrc={`${import.meta.env.BASE_URL}tinymce/tinymce.min.js`}
              licenseKey="gpl"
              initialValue={initialBody}
              init={{
                height: editorH,
                menubar: 'edit view insert format tools table',
                promotion: false,
                branding: false,
                resize: true,
                relative_urls: false,
                remove_script_host: false,
                convert_urls: false,
                object_resizing: true,
                plugins: [
                  'advlist',
                  'autolink',
                  'lists',
                  'link',
                  'image',
                  'charmap',
                  'preview',
                  'anchor',
                  'searchreplace',
                  'visualblocks',
                  'code',
                  'fullscreen',
                  'insertdatetime',
                  'media',
                  'table',
                  'help',
                  'wordcount',
                  'quickbars',
                ],
                toolbar:
                  'undo redo | blocks | bold italic underline strikethrough forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link image table | tableprops tablerowprops tablecellprops | tableinsertrowbefore tableinsertrowafter tabledeleterow | tableinsertcolbefore tableinsertcolafter tabledeletecol | removeformat code fullscreen help',
                table_toolbar:
                  'tableprops tabledelete | tableinsertrowbefore tableinsertrowafter tabledeleterow | tableinsertcolbefore tableinsertcolafter tabledeletecol | tablecellprops tablerowprops',
                table_cell_advtab: true,
                table_row_advtab: true,
                table_advtab: true,
                quickbars_selection_toolbar:
                  'bold italic | quicklink h2 h3 blockquote',
                quickbars_insert_toolbar: 'quickimage quicktable',
                font_family_formats: ffList,
                fontsize_formats: fsList,
                content_style:
                  'body { margin: 0; padding: 0; } img { max-width: 100%; height: auto; }',
              }}
              onInit={onEditorInit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      {children}
    </div>
  );
}
