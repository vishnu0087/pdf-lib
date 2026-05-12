import { Editor } from '@tinymce/tinymce-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor as TinyEditor } from 'tinymce';
import {
  FONT_PT_SIZES,
  injectEditorPagedScreenCss,
  injectPdfHeadIntoEditorDoc,
  mergeTemplateHtml,
  persistLiveHtmlString,
  sanitizeHtml,
  splitTemplateHtml,
  type TemplateHtmlParts,
  syncHeadersIntoDraft,
  updateLiveThemeCssFromDraft,
  wireTemplateImagesForEditor,
} from './editorBridge';
import {
  retokenizeEditorLiveHtml,
  substitutePlaceholdersInHtml,
} from '../lib/placeholder-html.js';

function readBootstrap(): null | {
  docType: string;
  data?: unknown;
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
  const editorRef = useRef<TinyEditor | null>(null);
  const templatePartsRef = useRef<TemplateHtmlParts | null>(null);
  /** When set, Save updates this template instead of creating a new one */
  const editingTemplateIdRef = useRef<string | null>(null);
  const editingTemplateNameRef = useRef<string | null>(null);
  const snapTm = useRef<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState('');
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(true);
  const [initialBody, setInitialBody] = useState<string | null>(null);

  const snapshotRef = useRef<unknown>(null);

  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
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
      persistLiveHtmlString(full, docType, snapshotRef.current);
    }, 400);
  }, [docType]);

  const flushSnapshot = useCallback(() => {
    const ed = editorRef.current;
    const parts = templatePartsRef.current;
    if (!ed || !parts) return;
    const inner = ed.getContent();
    const full = mergeTemplateHtml({ ...parts, bodyInner: inner });
    persistLiveHtmlString(full, docType, snapshotRef.current);
  }, [docType]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      editingTemplateIdRef.current = null;
      editingTemplateNameRef.current = null;

      const b = readBootstrap();
      if (!b || typeof b.docType !== 'string') {
        setError(
          'Open this editor from the generator: Template → Edit layout.'
        );
        setBusy(false);
        return;
      }
      setDocType(b.docType);

      let baseData: unknown = b.data;
      if (baseData != null) {
        try {
          localStorage.removeItem('pdfEditorTokenMap');
        } catch {
          /* */
        }
      }
      if (baseData == null) {
        try {
          const dr = await fetch(
            `/api/placeholder-data?docType=${encodeURIComponent(b.docType)}`
          );
          const rawPayload = (await dr.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          if (!dr.ok || cancelled) {
            if (!cancelled)
              setError(
                ('error' in rawPayload
                  ? String(rawPayload.error)
                  : null) || 'Could not load layout preview data.'
              );
            setBusy(false);
            return;
          }
          const tokenMap = rawPayload.tokenMap;
          const pdfPayload = { ...rawPayload };
          delete pdfPayload.tokenMap;
          baseData = pdfPayload;
          try {
            localStorage.setItem(
              'pdfEditorTokenMap',
              JSON.stringify({
                docType: b.docType,
                tokenMap:
                  tokenMap && typeof tokenMap === 'object' ? tokenMap : {},
              })
            );
          } catch {
            /* */
          }
        } catch {
          if (!cancelled) setError('Could not load layout preview data.');
          setBusy(false);
          return;
        }
      }

      snapshotRef.current = baseData;

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
            editingTemplateIdRef.current = pick;
            if (typeof disk.name === 'string')
              editingTemplateNameRef.current = disk.name;
            const liveRaw = disk.overrides._liveHtml;
            const liveOk =
              typeof liveRaw === 'string' && String(liveRaw).length > 400;
            if (liveOk) {
              setDraft({ ...disk.overrides });
              html = String(liveRaw);
              const tm = disk.overrides._placeholderTokenMap;
              if (tm && typeof tm === 'object') {
                try {
                  localStorage.setItem(
                    'pdfEditorTokenMap',
                    JSON.stringify({ docType: b.docType, tokenMap: tm })
                  );
                } catch {
                  /* */
                }
                html = substitutePlaceholdersInHtml(html, baseData, tm);
              }
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
                  data: baseData,
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
            data: baseData,
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
            data: baseData,
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

  function readTokenMapFromStorage(): Record<string, string[]> | null {
    try {
      const tRaw = localStorage.getItem('pdfEditorTokenMap');
      if (!tRaw) return null;
      const parsed = JSON.parse(tRaw) as {
        docType?: string;
        tokenMap?: unknown;
      };
      if (
        parsed.docType === docType &&
        parsed.tokenMap &&
        typeof parsed.tokenMap === 'object' &&
        !Array.isArray(parsed.tokenMap)
      ) {
        return parsed.tokenMap as Record<string, string[]>;
      }
    } catch {
      /* */
    }
    return null;
  }

  async function handleSaveTemplate() {
    const ed = editorRef.current;
    const parts = templatePartsRef.current;
    if (!ed || !parts) return;

    const updateId = editingTemplateIdRef.current;
    let saveName = (editingTemplateNameRef.current || 'My template').trim();
    if (!updateId) {
      const p =
        typeof prompt === 'function'
          ? prompt('Save template as:', saveName || 'My template')
          : '';
      if (p === null || String(p).trim() === '') return;
      saveName = String(p).trim();
    }

    const inner = ed.getContent();
    let fullHtml = mergeTemplateHtml({ ...parts, bodyInner: inner });
    const domDoc = new DOMParser().parseFromString(fullHtml, 'text/html');

    let next = syncHeadersIntoDraft(domDoc, docType, draftRef.current);
    setDraft(next);

    const tokenMap = readTokenMapFromStorage();
    const snap = snapshotRef.current;
    if (tokenMap && snap && typeof snap === 'object')
      fullHtml = retokenizeEditorLiveHtml(fullHtml, snap, tokenMap);

    const overrides = JSON.parse(
      JSON.stringify(next)
    ) as Record<string, unknown>;
    overrides._liveHtml = sanitizeHtml(fullHtml);

    try {
      const tStored = readTokenMapFromStorage();
      if (tStored) overrides._placeholderTokenMap = tStored;
    } catch {
      /* */
    }

    try {
      let res: Response;
      if (updateId) {
        res = await fetch(
          `/api/custom-templates/${encodeURIComponent(updateId)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ docType, name: saveName, overrides }),
          }
        );
      } else {
        res = await fetch('/api/custom-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docType, name: saveName, overrides }),
        });
      }
      const jr = await res.json();
      if (!res.ok) throw new Error(jr.error || 'Save failed');
      editingTemplateNameRef.current = jr.name || saveName;
      if (!updateId && jr.id) editingTemplateIdRef.current = String(jr.id);
      try {
        if (window.opener && !window.opener.closed)
          window.opener.postMessage(
            { type: 'pdf-template-saved', id: jr.id || updateId },
            '*'
          );
      } catch {
        /* */
      }
      alert(
        updateId
          ? `Updated template "${jr.name || saveName}".`
          : `Saved as "${jr.name}". Choose it on step 3 in the wizard.`
      );
      flushSnapshot();
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    }
  }

  const onEditorInit = useCallback(
    (_evt: unknown, editor: TinyEditor) => {
      editorRef.current = editor;
      const parts = templatePartsRef.current;
      const doc = editor.getDoc();
      if (parts?.prefix) injectPdfHeadIntoEditorDoc(doc, parts.prefix);
      injectEditorPagedScreenCss(doc);
      updateLiveThemeCssFromDraft(doc, draftRef.current);
      const wireImgs = () => wireTemplateImagesForEditor(editor.getDoc());
      wireImgs();
      try {
        doc.execCommand('styleWithCSS', false, 'true');
      } catch {
        /* */
      }
      editor.on(
        'change keyup SetContent Undo Redo ExecCommand ObjectResize',
        scheduleSnapshot
      );
      editor.on('SetContent Undo Redo', wireImgs);
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
      <div className="flex min-h-screen items-center justify-center bg-neutral-500 text-white">
        <p className="text-sm">Loading template…</p>
      </div>
    );
  }

  const ffList = [
    'Montserrat=Montserrat',
    'Segoe UI=Segoe UI',
    'Times New Roman=Times New Roman',
    'Arial=Arial',
    'Calibri=Calibri',
    'Georgia=Georgia',
  ].join('; ');

  const fsList = FONT_PT_SIZES.map((n) => `${n}pt`).join(' ');

  return (
    <div className="relative h-screen min-h-0 overflow-hidden bg-[#525659] text-[13px] text-neutral-800">
      <button
        type="button"
        className="fixed right-4 top-4 z-[100000] rounded border border-neutral-400 bg-white px-4 py-2 text-xs font-semibold shadow-lg hover:bg-neutral-50"
        onClick={handleSaveTemplate}
      >
        Save template
      </button>

      <div className="h-full min-h-0 overflow-auto">
        <Editor
          key={`${docType}-tpl`}
          tinymceScriptSrc={`${import.meta.env.BASE_URL}tinymce/tinymce.min.js`}
          licenseKey="gpl"
          initialValue={initialBody}
          init={{
            min_height: 620,
            menubar: false,
            promotion: false,
            branding: false,
            resize: true,
            statusbar: false,
            relative_urls: false,
            remove_script_host: false,
            convert_urls: false,
            paste_block_drop: false,
            verify_html: false,
            object_resizing: 'img,table',
            extended_valid_elements:
              'img[class|src|alt|style|width|height|loading|draggable|id|border|hspace|vspace|align]',
            image_advtab: true,
            plugins: [
              'autoresize',
              'lists',
              'link',
              'image',
              'charmap',
              'searchreplace',
              'table',
              'quickbars',
              'nonbreaking',
            ],
            toolbar: false,
            table_toolbar:
              'tableprops tabledelete | tableinsertrowbefore tableinsertrowafter tabledeleterow | tableinsertcolbefore tableinsertcolafter tabledeletecol | tablecellprops tablerowprops',
            table_cell_advtab: true,
            table_row_advtab: true,
            table_advtab: true,
            quickbars_selection_toolbar:
              'alignleft aligncenter alignright alignjustify | bold italic underline strikethrough | ' +
              'outdent indent | lineheight | forecolor | fontsizeselect fontfamily | ' +
              'bullist numlist | blocks | nonbreaking | removeformat',
            quickbars_insert_toolbar: 'quickimage quicktable',
            font_family_formats: ffList,
            fontsize_formats: fsList,
            line_height_formats: '1 1.15 1.2 1.35 1.5 1.75 2',
            style_formats_merge: true,
            style_formats: [
              {
                title: 'Paragraph spacing',
                items: [
                  {
                    title: 'Tight',
                    selector: 'p',
                    styles: {
                      marginTop: '0.2em',
                      marginBottom: '0.2em',
                    },
                  },
                  {
                    title: 'Normal',
                    selector: 'p',
                    styles: {
                      marginTop: '0.5em',
                      marginBottom: '0.5em',
                    },
                  },
                  {
                    title: 'Loose',
                    selector: 'p',
                    styles: {
                      marginTop: '1em',
                      marginBottom: '1em',
                    },
                  },
                  {
                    title: 'No extra margin',
                    selector: 'p',
                    styles: {
                      marginTop: '0',
                      marginBottom: '0',
                    },
                  },
                ],
              },
            ],
            content_style:
              'body { margin: 0; padding: 0; box-sizing: border-box; } p { box-sizing: border-box; } img { max-width: 100%; height: auto; }',
            autoresize_bottom_margin: 48,
          }}
          onInit={onEditorInit}
        />
      </div>
    </div>
  );
}
