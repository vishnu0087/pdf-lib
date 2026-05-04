import puppeteer from 'puppeteer';
import {
  applyPdfLetterTableLayout,
  applyPdfOrphanCompaction,
  applyPdfSalesFlowCompaction,
  PDF_VIEWPORT,
} from '../../lib/pdf-print-compact.js';

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
      .then((browser) => {
        browser.on('disconnected', () => {
          browserPromise = null;
        });
        return browser;
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

export async function waitFontsAndImages(page) {
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  });
  await page.evaluate(async () => {
    await Promise.all(
      [...document.images].map(
        (img) =>
          new Promise((resolve, reject) => {
            const ok = () => {
              if (img.naturalWidth > 0) resolve();
              else reject(new Error('Image not decoded: ' + img.src));
            };
            if (img.complete) ok();
            else {
              img.addEventListener('load', ok, { once: true });
              img.addEventListener(
                'error',
                () => reject(new Error('Image failed: ' + img.src)),
                { once: true }
              );
            }
          })
      )
    );
  });
}

/**
 * @param {string} html
 * @param {'quote' | 'other'} quoteLayout — quote skips sales-flow compaction
 */
export async function puppeteerHtmlToPdfBuffer(html, quoteLayout) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({
      width: PDF_VIEWPORT.width,
      height: PDF_VIEWPORT.height,
      deviceScaleFactor: 1,
    });
    await page.setContent(html, {
      waitUntil: 'load',
      timeout: 45000,
    });
    await waitFontsAndImages(page);
    await page.emulateMediaType('print');
    await applyPdfLetterTableLayout(page);
    if (quoteLayout !== 'quote') {
      await applyPdfSalesFlowCompaction(page);
    }
    await applyPdfOrphanCompaction(page);
    const pdfBuffer = await page.pdf({
      width: '210mm',
      height: '297mm',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
      scale: 1,
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
}
