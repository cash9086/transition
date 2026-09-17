const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1480, height: 900 }, deviceScaleFactor: 2 });
  const errori = [];
  page.on('pageerror', e => errori.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errori.push('CONSOLE ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, 'lente.html'), { waitUntil: 'load' });
  try { await page.waitForFunction('window.__pronto === true', { timeout: 60000 }); }
  catch (e) { errori.push('TIMEOUT'); }
  console.log(JSON.stringify({ diag: await page.evaluate('window.__diag||null'), errori }, null, 1));
  await page.locator('#c').screenshot({ path: path.resolve(__dirname, 'lente.png') });
  await browser.close();
})();
