// p4-10 step 3: the menu PDF render — Playwright chromium `page.pdf()` over
// the menu builder's `pdfHtml` (src/lib/menuCard.ts), unchanged. Chromium's
// print-to-PDF turns `<a href>` elements into real PDF link annotations,
// which is the whole reason the menu is delivered as a PDF and not a PNG
// (design.spec / this plan's Non-goals: a raster image loses the per-meal
// Cook Mode links). The chromium binary is a one-time M1 install
// (`npx playwright install chromium`) — recorded as a prerequisite in
// docs/research/r6-track-b-runbook.md alongside the p4-08 ones.
import { chromium } from "@playwright/test";

export async function renderMenuPdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true });
  } finally {
    await browser.close();
  }
}
