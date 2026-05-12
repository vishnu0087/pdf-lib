/**
 * Post-process saved template HTML (_liveHtml / client liveHtml) before Puppeteer.
 * Stale snapshots may still reference old @page backgrounds or a different listener port.
 */

/**
 * Point embedded asset/font URLs at the server instance handling this request.
 */
export function normalizeLiveHtmlAssetHosts(html, listenPort) {
  const host = `http://127.0.0.1:${listenPort}`;
  return String(html)
    .replace(/http:\/\/127\.0\.0\.1:\d+(?=\/)/g, host)
    .replace(/http:\/\/localhost:\d+(?=\/)/g, host);
}

/**
 * Align stored _liveHtml with the shell: @page full-bleed art per printed page;
 * sheets transparent in print so backgrounds are never "sliced" on the last fragment.
 */
export function injectLiveHtmlPrintSheetBackground(html, listenPort) {
  const bgUrl = `http://127.0.0.1:${listenPort}/assests/pdf-background.png`;
  const patch = `<style id="pdf-print-sheet-bg">
@page {
  size: A4 portrait !important;
  margin: 0 !important;
  background-color: #ffffff !important;
  background-image: url("${bgUrl}") !important;
  background-size: 210mm 297mm !important;
  background-repeat: no-repeat !important;
  background-position: top left !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
@media print {
  html,
  body {
    background: transparent !important;
  }
  .sheet.sheet--letter,
  .sheet.sheet--table {
    background-image: none !important;
    background-color: transparent !important;
  }
  .letter-sheet-bg {
    display: none !important;
  }
}
</style>`;
  let out = html.replace(
    /\s*<style[^>]*\bid=["']pdf-print-sheet-bg["'][^>]*>[\s\S]*?<\/style>\s*/gi,
    ''
  );
  const idx = out.toLowerCase().lastIndexOf('</head>');
  if (idx === -1) return out + patch;
  return out.slice(0, idx) + patch + out.slice(idx);
}

/** @param {string} html - after placeholder substitution */
export function prepareLiveHtmlForPdf(html, listenPort) {
  return injectLiveHtmlPrintSheetBackground(
    normalizeLiveHtmlAssetHosts(html, listenPort),
    listenPort
  );
}
