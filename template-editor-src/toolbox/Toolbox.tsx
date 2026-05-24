import { TOOLBOX_ITEMS, type FieldType } from './fields';

export interface ToolboxProps {
  onInsert: (type: FieldType) => void;
}

/**
 * Right-hand toolbox sidebar. Clean minimal document-editor style:
 * white surface, light grey divider, dashed cards. Clicking an item inserts
 * a real document element at the current caret in the preview.
 */
export function Toolbox({ onInsert }: ToolboxProps) {
  return (
    <aside className="flex h-full w-full flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 pb-3 pt-5">
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-800">
          Toolbox
        </h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Click an element to insert it
        </p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {TOOLBOX_ITEMS.map((item) => (
          <button
            key={item.type}
            type="button"
            // preventDefault on mousedown keeps the iframe's selection alive
            // so insertHtmlAtIframeCaret can use it.
            onMouseDown={(e) => {
              e.preventDefault();
              onInsert(item.type);
            }}
            className={
              'group flex w-full cursor-grab items-center gap-3 rounded-md border border-dashed border-slate-300 bg-white px-3 py-2.5 text-left ' +
              'transition-colors hover:border-slate-400 hover:bg-slate-50 active:cursor-grabbing'
            }
          >
            <FieldIcon type={item.type} />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium leading-tight text-slate-800">
                {item.label}
              </span>
              <span className="block truncate text-[10.5px] leading-tight text-slate-500">
                {item.hint}
              </span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function FieldIcon({ type }: { type: FieldType }) {
  const base = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'shrink-0 text-slate-500 group-hover:text-slate-700',
  };
  switch (type) {
    case 'header':
      return (
        <svg {...base}><path d="M6 4v16M18 4v16M6 12h12" /></svg>
      );
    case 'label':
      return (
        <svg {...base}><path d="M3 7h12l4 5-4 5H3z" /></svg>
      );
    case 'paragraph':
      return (
        <svg {...base}><path d="M4 6h16M4 11h16M4 16h10" /></svg>
      );
    case 'linebreak':
      return (
        <svg {...base}><path d="M4 12h16" /></svg>
      );
    case 'dropdown':
      return (
        <svg {...base}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M9 11l3 3 3-3" />
        </svg>
      );
    case 'tags':
      return (
        <svg {...base}>
          <path d="M3 12l9-9h7v7l-9 9z" />
          <circle cx="15" cy="9" r="1.2" />
        </svg>
      );
    case 'checkboxes':
      return (
        <svg {...base}>
          <rect x="3" y="4" width="6" height="6" rx="1" />
          <rect x="3" y="14" width="6" height="6" rx="1" />
          <path d="M12 7h9M12 17h9" />
        </svg>
      );
    case 'mchoice':
      return (
        <svg {...base}>
          <circle cx="6" cy="7" r="3" />
          <circle cx="6" cy="17" r="3" />
          <path d="M12 7h9M12 17h9" />
        </svg>
      );
    case 'textinput':
      return (
        <svg {...base}>
          <rect x="3" y="8" width="18" height="8" rx="2" />
          <path d="M7 12h6" />
        </svg>
      );
    case 'numberinput':
      return (
        <svg {...base}>
          <rect x="3" y="8" width="18" height="8" rx="2" />
          <path d="M16 11l1.5 2L19 11M7 11v2M9 12H5" />
        </svg>
      );
  }
}
