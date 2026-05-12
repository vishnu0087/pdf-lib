type DocTypeChipProps = { docType: string };

function DocTypeChip({ docType }: DocTypeChipProps) {
  const label = docType ? docType.charAt(0).toUpperCase() + docType.slice(1) : 'Template';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
      {label}
    </span>
  );
}

export type EditorTopBarProps = {
  templateName: string;
  docType: string;
  pageCount: number;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
};

export function EditorTopBar({
  templateName,
  docType,
  pageCount,
  dirty,
  saving,
  onSave,
  onClose,
}: EditorTopBarProps) {
  return (
    <header className="relative z-50 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-white/95 px-5 shadow-sm backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-semibold text-neutral-900">
              {templateName || 'Untitled template'}
            </h1>
            <DocTypeChip docType={docType} />
          </div>
          <p className="text-[11px] text-neutral-500">
            {pageCount} {pageCount === 1 ? 'page' : 'pages'}
            {dirty ? ' · Unsaved changes' : ' · All changes saved'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 hover:text-neutral-900"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
        >
          {saving ? (
            <>
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Saving…
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" strokeLinejoin="round" />
                <path d="M17 21v-8H7v8M7 3v5h8" strokeLinejoin="round" />
              </svg>
              Save template
            </>
          )}
        </button>
      </div>
    </header>
  );
}

export type EditorStatusBarProps = {
  pageCount: number;
  dirty: boolean;
  docType: string;
};

export function EditorStatusBar({ pageCount, dirty, docType }: EditorStatusBarProps) {
  return (
    <footer className="relative z-40 flex h-7 shrink-0 items-center justify-between gap-4 border-t border-neutral-800/40 bg-neutral-900/95 px-4 text-[11px] text-neutral-300">
      <div className="flex items-center gap-4">
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${dirty ? 'bg-amber-400' : 'bg-emerald-400'}`} />
          {dirty ? 'Editing' : 'Saved'}
        </span>
        <span className="text-neutral-500">·</span>
        <span>
          {pageCount} {pageCount === 1 ? 'page' : 'pages'} · A4 portrait
        </span>
      </div>
      <div className="flex items-center gap-3 text-neutral-400">
        <span className="uppercase tracking-wider">{docType || 'template'}</span>
        <span className="text-neutral-600">·</span>
        <span>Selection toolbar appears on text select</span>
      </div>
    </footer>
  );
}