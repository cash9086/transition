/* Apre il banco in Chromium, aspetta che abbia finito, e fotografa. */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1460, height: 1600 }, deviceScaleFactor: 1 });
  const errori = [];
  page.on('pageerror', e => errori.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errori.push('CONSOLE ' + m.text()); });

  await page.goto('file://' + path.resolve(__dirname, 'banco.html'), { waitUntil: 'load' });
  try {
    await page.waitForFunction('window.__pronto === true', { timeout: 60000 });
  } catch (e) {
    errori.push('TIMEOUT: la pagina non ha mai finito');
  }
  const diag = await page.evaluate('window.__diag || null');
  await page.locator('#strip').screenshot({ path: path.resolve(__dirname, 'striscia.png') });
  console.log(JSON.stringify({ diag, errori }, null, 2));
  await browser.close();
})();
