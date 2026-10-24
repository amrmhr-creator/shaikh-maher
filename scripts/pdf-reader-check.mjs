// يفتح صفحة كتاب في متصفح حقيقي ويضغط «تصفّح» على فصل، ثم ينتظر رسم أول صفحة من ملف PDF.
// الاستخدام: node scripts/pdf-reader-check.mjs https://example.com/books/rasayel/
import { chromium } from 'playwright';

const page_url = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
let bytes = 0;
page.on('response', async (r) => {
  if (r.url().includes('/pdf/')) {
    const len = Number(r.headers()['content-length'] ?? 0);
    bytes += len;
    console.log(`  ${r.status()} ${r.request().headers()['range'] ?? 'no range'} ${len}B`);
  }
});
page.on('console', (m) => m.type() === 'error' && console.log('  console:', m.text()));
await page.goto(page_url, { waitUntil: 'domcontentloaded' });
const t0 = Date.now();
await page.locator('[data-pdf]').nth(1).click();
try {
  await page.locator('dialog.pdf-reader canvas').first().waitFor({ timeout: 60000 });
  console.log(`first page drawn in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${(bytes / 1048576).toFixed(1)} MB fetched`);
  console.log(await page.locator('.pr-page').textContent());
} catch {
  console.log('FAIL: no page drawn;', await page.locator('.pr-msg').textContent());
  process.exitCode = 1;
}
await page.screenshot({ path: 'pdf-reader.png' });
await browser.close();
