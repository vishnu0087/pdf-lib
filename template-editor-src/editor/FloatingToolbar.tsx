import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

interface Pos { top: number; left: number }

interface Active {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right' | 'justify' | null;
}

const DEFAULT_ACTIVE: Active = {
  bold: false,
  italic: false,
  underline: false,
  align: null,
};

const FONT_SIZES = [9, 10, 11, 12, 14, 16, 18, 22, 28] as const;

/**
 * Contextual inline toolbar for the iframe document. Tracks the iframe's
 * selection, renders in the parent window at translated coords. Light
 * Google-Docs-style chrome.
 */
export function FloatingToolbar({
  iframeRef,
}: {
  iframeRef: RefObject<HTMLIFrameElement | null>;
}) {
  const [pos, setPos] = useState<Pos | null>(null);
  const [active, setActive] = useState<Active>(DEFAULT_ACTIVE);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) return;

    let raf = 0;
    const recompute = () => {
      const sel = doc.getSelection?.();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setPos(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const anchor =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as HTMLElement)
          : range.startContainer.parentElement;
      if (!anchor || !doc.body?.contains(anchor)) {
        setPos(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) {
        setPos(null);
        return;
      }
      const iframeRect = iframe.getBoundingClientRect();
      const tw = toolbarRef.current?.offsetWidth ?? 320;
      const th = toolbarRef.current?.offsetHeight ?? 34;
      const gap = 8;
      const sx = iframeRect.left + rect.left;
      const sy = iframeRect.top + rect.top;
      let top = sy - th - gap;
      if (top < 8) top = sy + rect.height + gap;
      let left = sx + rect.width / 2 - tw / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
      setPos({ top, left });
      try {
        setActive({
          bold: doc.queryCommandState('bold'),
          italic: doc.queryCommandState('italic'),
          underline: doc.queryCommandState('underline'),
          align: doc.queryCommandState('justifyCenter')
            ? 'center'
            : doc.queryCommandState('justifyRight')
            ? 'right'
            : doc.queryCommandState('justifyFull')
            ? 'justify'
            : doc.queryCommandState('justifyLeft')
            ? 'left'
            : null,
        });
      } catch {
        setActive(DEFAULT_ACTIVE);
      }
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recompute);
    };

    doc.addEventListener('selectionchange', schedule);
    doc.addEventListener('mouseup', schedule);
    doc.addEventListener('keyup', schedule);
    doc.defaultView?.addEventListener('scroll', schedule, true);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);

    return () => {
      cancelAnimationFrame(raf);
      doc.removeEventListener('selectionchange', schedule);
      doc.removeEventListener('mouseup', schedule);
      doc.removeEventListener('keyup', schedule);
      doc.defaultView?.removeEventListener('scroll', schedule, true);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [iframeRef]);

  if (!pos) return null;

  const exec = (cmd: string, value?: string) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.execCommand(cmd, false, value);
  };

  return (
    <div
      ref={toolbarRef}
      onMouseDown={(e) => e.preventDefault()}
      style={{ top: pos.top, left: pos.left }}
      className={
        'fixed z-50 flex items-center gap-px rounded-lg border border-slate-200 bg-white px-1 py-1 ' +
        'shadow-[0_6px_24px_rgba(15,23,42,0.12),0_1px_3px_rgba(15,23,42,0.08)]'
      }
      role="toolbar"
      aria-label="Text formatting"
    >
      <TBtn label="Bold" active={active.bold} onClick={() => exec('bold')}>
        <span className="font-bold text-[12px] leading-none">B</span>
      </TBtn>
      <TBtn label="Italic" active={active.italic} onClick={() => exec('italic')}>
        <span className="italic text-[12px] leading-none">I</span>
      </TBtn>
      <TBtn label="Underline" active={active.underline} onClick={() => exec('underline')}>
        <span className="underline text-[12px] leading-none">U</span>
      </TBtn>

      <Sep />

      <TBtn label="Align left" active={active.align === 'left'} onClick={() => exec('justifyLeft')}>
        <Ico path="M3 6h18M3 11h12M3 16h18M3 21h12" />
      </TBtn>
      <TBtn label="Align center" active={active.align === 'center'} onClick={() => exec('justifyCenter')}>
        <Ico path="M3 6h18M6 11h12M3 16h18M6 21h12" />
      </TBtn>
      <TBtn label="Align right" active={active.align === 'right'} onClick={() => exec('justifyRight')}>
        <Ico path="M3 6h18M9 11h12M3 16h18M9 21h12" />
      </TBtn>
      <TBtn label="Justify" active={active.align === 'justify'} onClick={() => exec('justifyFull')}>
        <Ico path="M3 6h18M3 11h18M3 16h18M3 21h18" />
      </TBtn>

      <Sep />

      <select
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const pt = Number(e.target.value);
          if (pt) exec('fontSize', String(ptToLevel(pt)));
          e.target.value = '';
        }}
        defaultValue=""
        className="h-6 rounded-md border border-transparent bg-transparent px-1 text-[11px] text-slate-700 outline-none hover:bg-slate-100 focus:border-slate-300"
        aria-label="Font size"
      >
        <option value="" disabled>Size</option>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>{s} pt</option>
        ))}
      </select>
    </div>
  );
}

function ptToLevel(pt: number): number {
  if (pt <= 9) return 1;
  if (pt <= 10) return 2;
  if (pt <= 12) return 3;
  if (pt <= 14) return 4;
  if (pt <= 18) return 5;
  if (pt <= 24) return 6;
  return 7;
}

function TBtn({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={
        'inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ' +
        (active
          ? 'bg-slate-900 text-white'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
      }
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span aria-hidden className="mx-0.5 h-4 w-px bg-slate-200" />;
}

function Ico({ path }: { path: string }) {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}
