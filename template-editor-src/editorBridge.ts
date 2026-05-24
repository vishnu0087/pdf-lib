/**
 * Editor preview = iframe-rendered HTML output of the SAME React PDF
 * template components Puppeteer uses for export. This file holds:
 *   - viewport + load + print-media helpers,
 *   - editor chrome CSS that turns each `.sheet` into a discrete A4 card,
 *   - a pagination engine that splits `.sheet--table` overflow across real
 *     A4 sibling sections so the editor displays multi-page documents as
 *     separate stacked A4 pages,
 *   - caret-aware insertion helpers for the toolbox.
 */

import { A4_HEIGHT_MM, MM_TO_PX_96 } from '../lib/page-geometry.js';

/** A4 width at 96dpi — Puppeteer's print viewport width. */
export const A4_WIDTH_PX = 794;
/** A4 height at 96dpi — Puppeteer's print viewport height. */
export const A4_HEIGHT_PX = Math.round(A4_HEIGHT_MM * MM_TO_PX_96);

// ---------------------------------------------------------------------------
// Editor chrome CSS — each `.sheet` becomes a discrete A4 card.
// ---------------------------------------------------------------------------

export const EDITOR_CHROME_CSS = `
html, body { background: #e5e7eb !important; margin: 0 !important; }
body {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  padding: 32px 0 48px !important;
  gap: 32px !important;
  min-height: 100% !important;
  box-sizing: border-box !important;
}
/* Every .sheet becomes a TRUE A4 page card: fixed 210×297mm with shadow
   and gutter to the next page. The pagination engine ensures content that
   would overflow 297mm is split into additional sibling cards so the editor
   visually shows N stacked pages, matching what Puppeteer prints. */
.sheet.sheet--letter,
.sheet.sheet--table {
  width: 210mm !important;
  max-width: 210mm !important;
  height: 297mm !important;
  min-height: 297mm !important;
  max-height: 297mm !important;
  margin: 0 !important;
  flex: 0 0 auto !important;
  box-sizing: border-box !important;
  background-color: #ffffff !important;
  background-repeat: no-repeat !important;
  background-position: top left !important;
  background-size: 210mm 297mm !important;
  position: relative !important;
  overflow: hidden !important;
  display: block !important;
  isolation: isolate !important;
  border-radius: 1px;
  box-shadow:
    0 0 0 1px rgba(15, 23, 42, 0.08),
    0 1px 3px rgba(15, 23, 42, 0.06),
    0 8px 20px rgba(15, 23, 42, 0.08);
}
/* The template applies inline style height:auto + overflow:visible on these
   inner divs so PDF print can flow freely. In the editor we need a fixed
   height content well so the pagination engine's scrollHeight > clientHeight
   overflow check is meaningful. !important beats the inline style. Padding
   (the safe-area inset for header/footer artwork) is left untouched. */
.sheet-inner--p1,
.sheet-inner--p2 {
  position: relative !important;
  z-index: 1 !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  max-height: 100% !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
.sheet-inner--p1 p,
.sheet-inner--p2 p { box-sizing: border-box; }

/* Mirror Puppeteer's print break-control rules — these are no-ops on screen
   but become observable via getComputedStyle, so the JS pagination engine
   can honour them just like the print engine does. */
thead { break-inside: avoid; page-break-inside: avoid; }
.qt-html-table--totals-inner,
.qt-html-table--totals-inner > tbody > tr {
  break-inside: avoid;
  page-break-inside: avoid;
}
.p2-after-table:not(.p2-after-table--sales) > table.qt-html-table:not(.qt-html-table--light-lines) > tbody > tr {
  break-inside: avoid;
  page-break-inside: avoid;
}
.p2-table-wrap--break-before { break-before: page; page-break-before: always; }

/* ---------- Editing UX polish ---------- */
/* Soft hover background on toolbox-inserted blocks so the user can tell
   they are editable regions. Pre-existing template content is unaffected. */
.tpl-field:hover {
  background-color: rgba(15, 23, 42, 0.025);
  border-radius: 2px;
  transition: background-color 120ms ease;
}
/* Selected-element outline — added/removed via JS in App.tsx as the caret
   moves between blocks. Lives outside the layout (outline doesn't reflow). */
.tpl-field--selected,
.tpl-field--selected:hover {
  outline: 1.5px solid rgba(59, 130, 246, 0.55);
  outline-offset: 3px;
  background-color: rgba(59, 130, 246, 0.04);
}
/* Print never sees the editor-only selection state. */
@media print {
  .tpl-field--selected { outline: none !important; background: transparent !important; }
}
`;

export function injectEditorChromeCss(doc: Document): void {
  let tag = doc.getElementById('tpl-editor-chrome') as HTMLStyleElement | null;
  if (!tag) {
    tag = doc.createElement('style');
    tag.id = 'tpl-editor-chrome';
    doc.head.appendChild(tag);
  }
  tag.textContent = EDITOR_CHROME_CSS;
}

// ---------------------------------------------------------------------------
// Print-media + load helpers (same gate Puppeteer uses).
// ---------------------------------------------------------------------------

export async function waitForLoadComplete(doc: Document): Promise<void> {
  try {
    if (doc.fonts?.ready) await doc.fonts.ready;
  } catch {
    /* */
  }
  await Promise.all(
    Array.from(doc.images).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        })
    )
  );
}

// ---------------------------------------------------------------------------
// Caret insertion helpers.
// ---------------------------------------------------------------------------

export function insertHtmlAtIframeCaret(
  doc: Document,
  rawHtml: string
): HTMLElement | null {
  const tpl = doc.createElement('div');
  tpl.innerHTML = rawHtml.trim();
  const node = tpl.firstElementChild as HTMLElement | null;
  if (!node) return null;

  const sel = doc.getSelection?.();
  let range: Range | null = null;
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    const anchor =
      r.startContainer.nodeType === Node.ELEMENT_NODE
        ? (r.startContainer as HTMLElement)
        : r.startContainer.parentElement;
    if (anchor && anchor.closest('.sheet-inner--p1, .sheet-inner--p2'))
      range = r;
  }
  if (!range) range = findDefaultInsertionRange(doc);
  if (!range) return null;

  range.deleteContents();
  range.insertNode(node);
  const after = doc.createRange();
  after.setStartAfter(node);
  after.collapse(true);
  sel?.removeAllRanges();
  sel?.addRange(after);
  return node;
}

export function selectAllText(doc: Document, el: HTMLElement): void {
  const range = doc.createRange();
  range.selectNodeContents(el);
  const sel = doc.getSelection?.();
  sel?.removeAllRanges();
  sel?.addRange(range);
  try {
    el.focus();
  } catch {
    /* */
  }
}

/**
 * Watch the iframe's selection and toggle a `.tpl-field--selected` class on
 * the nearest `.tpl-field` ancestor of the caret so the editor shows a soft
 * outline around the actively-edited block. Returns a teardown function.
 */
export function attachSelectedElementHighlighter(doc: Document): () => void {
  const SEL_CLASS = 'tpl-field--selected';

  const updateSelected = () => {
    const sel = doc.getSelection?.();
    let target: HTMLElement | null = null;
    if (sel && sel.anchorNode) {
      const anchor =
        sel.anchorNode.nodeType === Node.TEXT_NODE
          ? sel.anchorNode.parentElement
          : (sel.anchorNode as HTMLElement);
      target = anchor?.closest('.tpl-field') as HTMLElement | null;
    }
    const current = Array.from(doc.querySelectorAll('.' + SEL_CLASS)) as HTMLElement[];
    if (target && current.length === 1 && current[0] === target) return;
    current.forEach((el) => el.classList.remove(SEL_CLASS));
    if (target) target.classList.add(SEL_CLASS);
  };

  let raf = 0;
  const schedule = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(updateSelected);
  };

  doc.addEventListener('selectionchange', schedule);
  doc.addEventListener('mouseup', schedule);
  doc.addEventListener('keyup', schedule);

  return () => {
    cancelAnimationFrame(raf);
    doc.removeEventListener('selectionchange', schedule);
    doc.removeEventListener('mouseup', schedule);
    doc.removeEventListener('keyup', schedule);
    doc.querySelectorAll('.' + SEL_CLASS).forEach((el) => el.classList.remove(SEL_CLASS));
  };
}

/** Strip editor-only state (selected-element class) from the iframe doc.
 *  Call before serializing the iframe's HTML for save/export. */
export function stripEditorOnlyState(doc: Document): void {
  doc
    .querySelectorAll('.tpl-field--selected')
    .forEach((el) => el.classList.remove('tpl-field--selected'));
}

function findDefaultInsertionRange(doc: Document): Range | null {
  const sheet = doc.querySelector('.sheet-inner--p1, .sheet-inner--p2');
  if (sheet) {
    const r = doc.createRange();
    r.selectNodeContents(sheet);
    r.collapse(false);
    return r;
  }
  if (!doc.body) return null;
  const r = doc.createRange();
  r.selectNodeContents(doc.body);
  r.collapse(false);
  return r;
}

// ---------------------------------------------------------------------------
// Pagination engine — splits `.sheet--table` overflow into A4 siblings.
// Same algorithm Puppeteer's print engine uses (greedy distribution with
// table-row + container splitting). Mirrored on the editor so visual
// pagination matches what Puppeteer will produce at PDF time.
// ---------------------------------------------------------------------------

const SPLITTABLE_TAGS = new Set([
  'div', 'section', 'article', 'main', 'aside', 'ul', 'ol', 'dl', 'tbody', 'p',
]);
const ATOMIC_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'img', 'hr', 'br', 'pre', 'figure', 'blockquote',
  'tr', 'td', 'th', 'iframe', 'video', 'canvas', 'svg',
]);

export function countEditorPages(doc: Document | null | undefined): number {
  if (!doc) return 1;
  const n = doc.querySelectorAll(
    'section.sheet.sheet--letter, section.sheet.sheet--table'
  ).length;
  return Math.max(1, n);
}

function synthesizeContinuationAfter(letter: HTMLElement, doc: Document): HTMLElement {
  const newSheet = doc.createElement('section');
  newSheet.className = 'sheet sheet--table';
  const bgImg = letter.querySelector(':scope > img.letter-sheet-bg') as HTMLImageElement | null;
  if (bgImg && bgImg.src) {
    newSheet.style.backgroundImage = `url(${bgImg.src})`;
    newSheet.style.backgroundSize = '210mm 297mm';
    newSheet.style.backgroundRepeat = 'no-repeat';
    newSheet.style.backgroundPosition = 'top left';
  }
  const inner = doc.createElement('div');
  inner.className = 'sheet-inner sheet-inner--p2';
  newSheet.appendChild(inner);
  letter.parentNode?.insertBefore(newSheet, letter.nextSibling);
  return newSheet;
}

export function repaginateTableSheets(doc: Document | null | undefined): { pages: number } {
  if (!doc?.body) return { pages: 1 };

  const sel = doc.getSelection ? doc.getSelection() : null;
  let savedRange: Range | null = null;
  if (sel && sel.rangeCount > 0) {
    try {
      savedRange = sel.getRangeAt(0).cloneRange();
    } catch {
      savedRange = null;
    }
  }

  const letterSection = doc.querySelector(
    'section.sheet.sheet--letter'
  ) as HTMLElement | null;
  const letterInner = (letterSection
    ? letterSection.querySelector(':scope > .sheet-inner--p1')
    : null) as HTMLElement | null;

  let all = Array.from(
    doc.querySelectorAll('section.sheet.sheet--table')
  ) as HTMLElement[];

  if (all.length === 0) {
    if (letterSection) all = [synthesizeContinuationAfter(letterSection, doc)];
    else {
      restoreSelection(sel, savedRange);
      return { pages: 1 };
    }
  }

  const innerSelector = ':scope > .sheet-inner--p2';
  const template = all[0];
  const templateInner = template.querySelector(innerSelector) as HTMLElement | null;
  if (!templateInner) return { pages: countEditorPages(doc) };
  const parent = template.parentNode;
  if (!parent) return { pages: countEditorPages(doc) };

  let currentSheet: HTMLElement = letterSection ?? template;
  let currentInner: HTMLElement = letterInner ?? templateInner;
  const readUsable = (el: HTMLElement) => {
    el.getBoundingClientRect();
    return el.clientHeight || A4_HEIGHT_PX;
  };
  let usable = readUsable(currentInner);

  const startNewSheet = () => {
    const newSheet = template.cloneNode(false) as HTMLElement;
    const newInner = templateInner.cloneNode(false) as HTMLElement;
    while (newInner.firstChild) newInner.removeChild(newInner.firstChild);
    newSheet.appendChild(newInner);
    if (currentSheet.nextSibling) parent.insertBefore(newSheet, currentSheet.nextSibling);
    else parent.appendChild(newSheet);
    currentSheet = newSheet;
    currentInner = newInner;
    usable = readUsable(currentInner);
  };

  const fits = () => currentInner.scrollHeight <= usable + 1;
  const isElement = (n: Node): n is HTMLElement => n.nodeType === Node.ELEMENT_NODE;
  const tagOf = (n: Node) => (isElement(n) ? n.tagName.toLowerCase() : '');
  const isTable = (n: Node) => tagOf(n) === 'table';
  const hasBreakInsideAvoid = (el: HTMLElement): boolean => {
    try {
      const w = doc.defaultView;
      if (!w) return false;
      const cs = w.getComputedStyle(el);
      return cs.breakInside === 'avoid' || cs.pageBreakInside === 'avoid';
    } catch {
      return false;
    }
  };
  const wantsBreakBefore = (n: Node): boolean => {
    if (!isElement(n)) return false;
    try {
      const w = doc.defaultView;
      if (!w) return false;
      const cs = w.getComputedStyle(n);
      return cs.breakBefore === 'page' || cs.pageBreakBefore === 'always';
    } catch {
      return false;
    }
  };
  const isSplittable = (n: Node): boolean => {
    if (!isElement(n)) return false;
    const t = tagOf(n);
    if (ATOMIC_TAGS.has(t)) return false;
    if (!SPLITTABLE_TAGS.has(t)) return false;
    if (hasBreakInsideAvoid(n)) return false;
    return true;
  };

  function depthFrom(node: HTMLElement, ancestor: HTMLElement): number {
    let d = 0;
    let n: HTMLElement | null = node;
    while (n && n !== ancestor) {
      n = n.parentElement;
      d++;
    }
    return n === ancestor ? d : -1;
  }

  const startNewSheetWithChain = (slot: HTMLElement): HTMLElement => {
    const chain: HTMLElement[] = [];
    let n: HTMLElement | null = slot;
    while (n && n !== currentInner) {
      chain.unshift(n);
      n = n.parentElement;
    }
    startNewSheet();
    let parentRef: HTMLElement = currentInner;
    for (const link of chain) {
      const clone = link.cloneNode(false) as HTMLElement;
      while (clone.firstChild) clone.removeChild(clone.firstChild);
      parentRef.appendChild(clone);
      parentRef = clone;
    }
    return parentRef;
  };

  const placeNode = (node: ChildNode, slot: HTMLElement): HTMLElement => {
    slot.appendChild(node);
    if (fits()) return slot;
    slot.removeChild(node);

    if (isElement(node) && hasBreakInsideAvoid(node)) {
      let trial = slot;
      if (currentInner.firstChild) trial = startNewSheetWithChain(slot);
      trial.appendChild(node);
      if (fits()) return trial;
      trial.removeChild(node);
      if (isTable(node)) return splitTable(node, trial);
      if (SPLITTABLE_TAGS.has(tagOf(node)) && node.childNodes.length > 0) {
        return splitContainer(node, trial);
      }
      trial.appendChild(node);
      return trial;
    }

    if (isTable(node)) return splitTable(node as HTMLElement, slot);
    if (isSplittable(node) && node.childNodes.length > 0) {
      return splitContainer(node as HTMLElement, slot);
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return splitTextNode(node as Text, slot);
    }
    if (!currentInner.firstChild) {
      slot.appendChild(node);
      return slot;
    }
    const newSlot = startNewSheetWithChain(slot);
    newSlot.appendChild(node);
    return newSlot;
  };

  const splitTextNode = (text: Text, slot: HTMLElement): HTMLElement => {
    const data = text.data;
    if (!data || data.trim() === '') {
      if (!currentInner.firstChild) {
        slot.appendChild(text);
        return slot;
      }
      const newSlot = startNewSheetWithChain(slot);
      newSlot.appendChild(text);
      return newSlot;
    }
    const tokens = data.match(/\S+|\s+/g) || [data];
    const probe = doc.createTextNode('');
    slot.appendChild(probe);
    let lo = 0;
    let hi = tokens.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      probe.data = tokens.slice(0, mid).join('');
      if (fits()) lo = mid;
      else hi = mid - 1;
    }
    if (lo === 0) {
      slot.removeChild(probe);
      if (!currentInner.firstChild) {
        slot.appendChild(text);
        return slot;
      }
      const newSlot = startNewSheetWithChain(slot);
      return splitTextNode(text, newSlot);
    }
    probe.data = tokens.slice(0, lo).join('');
    if (lo === tokens.length) return slot;
    const remainder = doc.createTextNode(tokens.slice(lo).join(''));
    const newSlot = startNewSheetWithChain(slot);
    return splitTextNode(remainder, newSlot);
  };

  const splitContainer = (container: HTMLElement, slot: HTMLElement): HTMLElement => {
    const children = Array.from(container.childNodes);
    const empty = container.cloneNode(false) as HTMLElement;
    while (empty.firstChild) empty.removeChild(empty.firstChild);
    slot.appendChild(empty);

    if (!fits() && currentInner.childNodes.length > 1) {
      slot.removeChild(empty);
      const nextSlot = startNewSheetWithChain(slot);
      nextSlot.appendChild(empty);
      slot = nextSlot;
    }

    const slotDepth = depthFrom(slot, currentInner);
    let sub: HTMLElement = empty;
    for (const child of children) {
      if (wantsBreakBefore(child) && currentInner.firstChild) {
        sub = startNewSheetWithChain(sub);
      }
      sub = placeNode(child, sub);
    }
    let result: HTMLElement | null = sub;
    while (result && depthFrom(result, currentInner) > slotDepth) {
      result = result.parentElement;
    }
    if (!result || depthFrom(result, currentInner) < 0) return currentInner;
    return result;
  };

  const splitTable = (table: HTMLElement, slot: HTMLElement): HTMLElement => {
    const tbodies = Array.from(table.querySelectorAll(':scope > tbody')) as HTMLElement[];
    const rows = tbodies.flatMap((tb) => Array.from(tb.children) as HTMLElement[]);
    if (tbodies.length === 0 || rows.length === 0) {
      if (!currentInner.firstChild) {
        slot.appendChild(table);
        return slot;
      }
      const onlySlot = startNewSheetWithChain(slot);
      onlySlot.appendChild(table);
      return onlySlot;
    }
    const tbody = tbodies[0];
    const captionEl = table.querySelector(':scope > caption');
    const colgroupEl = table.querySelector(':scope > colgroup');
    const theadEl = table.querySelector(':scope > thead');

    const buildEmptyClone = (): { table: HTMLElement; tbody: HTMLElement } => {
      const t = table.cloneNode(false) as HTMLElement;
      if (captionEl) t.appendChild(captionEl.cloneNode(true));
      if (colgroupEl) t.appendChild(colgroupEl.cloneNode(true));
      if (theadEl) t.appendChild(theadEl.cloneNode(true));
      const tb = tbody.cloneNode(false) as HTMLElement;
      t.appendChild(tb);
      return { table: t, tbody: tb };
    };

    let { table: curTable, tbody: curTbody } = buildEmptyClone();
    slot.appendChild(curTable);
    if (!fits() && currentInner.childNodes.length > 1) {
      slot.removeChild(curTable);
      const next = startNewSheetWithChain(slot);
      const built = buildEmptyClone();
      curTable = built.table;
      curTbody = built.tbody;
      next.appendChild(curTable);
      slot = next;
    }

    for (const row of rows) {
      curTbody.appendChild(row);
      if (!fits()) {
        if (curTbody.children.length === 1) {
          const slotHasContentAboveTable =
            curTable.previousSibling != null || currentInner.firstChild !== curTable;
          if (!slotHasContentAboveTable) continue;
          curTbody.removeChild(row);
          if (curTable.parentNode) curTable.parentNode.removeChild(curTable);
          const next = startNewSheetWithChain(slot);
          const built = buildEmptyClone();
          curTable = built.table;
          curTbody = built.tbody;
          next.appendChild(curTable);
          curTbody.appendChild(row);
          slot = next;
          continue;
        }
        curTbody.removeChild(row);
        const next = startNewSheetWithChain(slot);
        const built = buildEmptyClone();
        curTable = built.table;
        curTbody = built.tbody;
        next.appendChild(curTable);
        curTbody.appendChild(row);
        slot = next;
      }
    }
    return slot;
  };

  const runDistribution = () => {
    let tables = Array.from(
      doc.querySelectorAll('section.sheet.sheet--table')
    ) as HTMLElement[];
    if (tables.length === 0 && letterSection) {
      tables = [synthesizeContinuationAfter(letterSection, doc)];
    }
    if (tables.length === 0) return;
    const templ = tables[0];
    const ti = templ.querySelector(innerSelector) as HTMLElement | null;
    if (!ti) return;

    const blocks: ChildNode[] = [];
    if (letterInner) Array.from(letterInner.childNodes).forEach((n) => blocks.push(n));
    tables.forEach((sec) => {
      const innerEl = sec.querySelector(innerSelector) as HTMLElement | null;
      if (!innerEl) return;
      Array.from(innerEl.childNodes).forEach((n) => blocks.push(n));
    });

    for (let i = tables.length - 1; i >= 1; i--) parent.removeChild(tables[i]);
    if (letterInner)
      while (letterInner.firstChild) letterInner.removeChild(letterInner.firstChild);
    while (ti.firstChild) ti.removeChild(ti.firstChild);

    currentSheet = letterSection ?? templ;
    currentInner = letterInner ?? ti;
    usable = readUsable(currentInner);

    let s: HTMLElement = currentInner;
    for (const block of blocks) {
      if (wantsBreakBefore(block) && currentInner.firstChild) {
        startNewSheet();
        s = currentInner;
      }
      s = placeNode(block, s);
      s = currentInner;
    }

    if (letterSection && currentSheet === letterSection && !ti.firstChild) {
      parent.removeChild(templ);
    }
  };

  runDistribution();

  for (let pass = 0; pass < 3; pass++) {
    const letterOverflows = (() => {
      if (!letterInner) return false;
      letterInner.getBoundingClientRect();
      return letterInner.scrollHeight > letterInner.clientHeight + 1;
    })();
    const tableOverflows = Array.from(
      doc.querySelectorAll('section.sheet.sheet--table > .sheet-inner--p2')
    ).some((el) => {
      const e = el as HTMLElement;
      e.getBoundingClientRect();
      return e.scrollHeight > e.clientHeight + 1;
    });
    if (!letterOverflows && !tableOverflows) break;
    runDistribution();
  }

  restoreSelection(sel, savedRange);
  return { pages: countEditorPages(doc) };
}

function restoreSelection(sel: Selection | null, range: Range | null) {
  if (!sel || !range) return;
  try {
    const startC = (range.startContainer as Node)?.isConnected;
    const endC = (range.endContainer as Node)?.isConnected;
    if (startC && endC && sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } catch {
    /* */
  }
}
