import type { FieldType } from './templateFields';
import { TOOLBOX_ITEMS } from './templateFields';
import { VARIABLE_REGISTRY } from '../lib/variable-registry.js';
import {
  QUOTE_SEMANTIC_INLINE,
  QUOTE_ADDRESS_CHIPS,
  QUOTE_LINE_ITEMS_COLUMNS,
} from '../lib/quote-semantic-chips.js';

function ItemIcon({ type }: { type: FieldType }) {
  const base = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
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

function VarIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 5l-4 7 4 7M16 5l4 7-4 7" />
    </svg>
  );
}

function BlockIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
    </svg>
  );
}

function Section({
  title,
  subtitle,
  children,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group border-b border-slate-200/70 last:border-b-0">
      <summary className="sticky top-0 z-10 flex cursor-pointer select-none items-center justify-between bg-white/95 px-4 py-2.5 backdrop-blur">
        <span className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</span>
          {subtitle ? (
            <span className="text-[10px] text-slate-400">{subtitle}</span>
          ) : null}
        </span>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-slate-400 transition group-open:rotate-180">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="px-2 pb-2 pt-1">{children}</div>
    </details>
  );
}

function defaultTokenLabel(token: string): string {
  return String(token || '')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export type TemplateToolboxProps = {
  docType: string;
  tokenMap?: Record<string, string[]>;
  onInsertField: (type: FieldType) => void;
  onInsertVariable: (token: string, label: string) => void;
  onInsertBlock: (id: string, label: string) => void;
};

export function TemplateToolbox({
  docType,
  tokenMap,
  onInsertField,
  onInsertVariable,
  onInsertBlock,
}: TemplateToolboxProps) {
  const registry = (VARIABLE_REGISTRY as Record<string, { inline: Array<{ token: string; label: string; type: string }>; blocks: Array<{ id: string; label: string; description: string }> }>)[docType] || { inline: [], blocks: [] };

  type InlineItem = { token: string; label: string; type: string; group?: string };

  /* Phase 10c: for Quote, surface the curated semantic catalog instead of
     auto-generated tokenMap keys. Other doc types still fall back to the
     merged registry + tokenMap list. */
  let inlineList: InlineItem[] = [];
  if (docType === 'quote') {
    inlineList = [
      ...QUOTE_SEMANTIC_INLINE.map((c) => ({
        token: c.token, label: c.label, type: 'text', group: c.group,
      })),
      ...QUOTE_ADDRESS_CHIPS.map((c) => ({
        token: c.token, label: c.label, type: 'text', group: c.group,
      })),
      ...Object.values(QUOTE_LINE_ITEMS_COLUMNS).map((c) => ({
        token: c.token, label: c.label, type: 'text', group: c.group,
      })),
    ];
  } else {
    const tokenMapInline = Object.keys(tokenMap || {})
      .filter((t) => !registry.inline.some((r) => r.token === t))
      .sort((a, b) => a.localeCompare(b))
      .map((t) => ({ token: t, label: defaultTokenLabel(t), type: 'text' }));
    inlineList = [...registry.inline, ...tokenMapInline];
  }

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Template builder</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Insert variables, content blocks, or static fields
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {inlineList.length > 0 ? (
          <Section title="Variables" subtitle="Resolve from runtime data">
            {(() => {
              /* Group by `group` if any item has one; else flat list. */
              const grouped = inlineList.reduce<Record<string, typeof inlineList>>(
                (acc, it) => {
                  const g = it.group || 'General';
                  if (!acc[g]) acc[g] = [];
                  acc[g].push(it);
                  return acc;
                },
                {}
              );
              const groupOrder = Object.keys(grouped);
              return groupOrder.map((g) => (
                <div key={g} className="mb-2 last:mb-0">
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {g}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {grouped[g].map((v) => (
                      <button
                        key={v.token}
                        type="button"
                        onClick={() => onInsertVariable(v.token, v.label)}
                        className="group flex items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-blue-50"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 transition group-hover:bg-blue-100">
                          <VarIcon />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-slate-800">{v.label}</span>
                          <span className="block truncate text-[10px] uppercase tracking-wider text-slate-400">
                            {v.type} · {v.token}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </Section>
        ) : null}

        {registry.blocks.length > 0 ? (
          <Section title="Content Blocks" subtitle="Renderer-driven regions">
            <div className="flex flex-col gap-1">
              {registry.blocks.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onInsertBlock(b.id, b.label)}
                  className="group flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-sm"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 transition group-hover:bg-blue-100 group-hover:text-blue-600">
                    <BlockIcon />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-slate-800">{b.label}</span>
                    <span className="block truncate text-[11px] text-slate-500">{b.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </Section>
        ) : null}

        <Section title="Form Fields" subtitle="Static structural elements" defaultOpen={false}>
          <div className="flex flex-col gap-0.5">
            {TOOLBOX_ITEMS.map((it) => (
              <button
                key={it.type}
                type="button"
                onClick={() => onInsertField(it.type)}
                className="group flex items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-slate-50"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 transition group-hover:bg-white group-hover:text-blue-600">
                  <ItemIcon type={it.type} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-slate-800">{it.label}</span>
                  <span className="block truncate text-[11px] text-slate-500">{it.description}</span>
                </span>
              </button>
            ))}
          </div>
        </Section>
      </div>
    </aside>
  );
}
