export type EditorTopBarProps = {
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
};

export function EditorTopBar({ saving, onSave, onClose }: EditorTopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-end gap-2 bg-neutral-200 px-4">
      <button
        type="button"
        onClick={onClose}
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 hover:text-neutral-900"
      >
        Close
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
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
    </header>
  );
}
