// Smoke-tests the interface by driving the built game in a real browser.
//
// tests/ covers the simulation, the content and the balance — nothing covered
// the UI, which is how a stylesheet could reference .btn.ghost for months
// without it existing, and how the intel panel could sit underneath the
// condition panel at any window height above about 700px.
//
// This is deliberately not a screenshot-diff suite. It asserts behaviour that
// is either right or wrong: a modal traps focus and closes on Escape, pausing
// shows that the game is paused, no request 404s, no uncaught exception.
//
//   node scripts/uiChecks.mjs [distDir]

import { chromium } from 'playwright';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const distDir = resolve(process.argv[2] ?? 'dist');
if (!existsSync(join(distDir, 'index.html'))) {
  console.error(`no build at ${distDir} — run npm run build first`);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
};

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = join(distDir, normalize(url).replace(/^([/\\])+/, '') || 'index.html');
  if (!file.startsWith(distDir)) return void res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
const port = await new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server.address().port)));
const base = `http://127.0.0.1:${port}/`;

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

const failures = [];
const netErrors = [];
page.on('pageerror', (e) => failures.push(`uncaught: ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 400) netErrors.push(`${r.status()} ${r.url()}`);
});
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};
const dismissTips = async () => {
  for (let i = 0; i < 3; i++) {
    const tip = page.locator('.coach-tip button');
    if (await tip.count()) {
      await tip.first().click();
      await page.waitForTimeout(400);
    }
  }
};

console.log('\nui checks');

// --- fonts actually load, rather than silently falling back to system ------
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const fontsLoaded = await page.evaluate(async () => {
  await document.fonts.ready;
  return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
});
check('self-hosted fonts load', fontsLoaded.includes('Barlow Condensed'), fontsLoaded.join(','));

// --- the confirm dialog replaces window.confirm, and behaves ---------------
// A save has to exist for New Career to ask before overwriting. Once one
// does, boot goes straight to the career hub (main.ts), so getting back to
// the title screen means going through its Main Menu button.
await page.getByRole('button', { name: 'New Career' }).click();
await page.waitForTimeout(700);
await page.locator('button', { hasText: 'Main Menu' }).first().click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'New Career' }).click();
await page.waitForTimeout(400);

check('destructive action opens an in-game modal', (await page.locator('.modal-card[role="alertdialog"]').count()) === 1);
check('modal is marked aria-modal', (await page.locator('.modal-card[aria-modal="true"]').count()) === 1);
check(
  'focus starts on cancel, not the destructive button',
  (await page.evaluate(() => document.activeElement?.dataset?.act)) === 'cancel',
);
// tab from the last control must wrap to the first, not escape the dialog
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
check(
  'focus is trapped inside the modal',
  await page.evaluate(() => !!document.activeElement?.closest('.modal-card')),
);
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
check('Escape dismisses the modal', (await page.locator('.modal-card').count()) === 0);

// --- pausing says so ------------------------------------------------------
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
// Enter Race is disabled until you own something to race
await page.locator('button', { hasText: 'Dealership' }).first().click();
await page.waitForTimeout(600);
await page.locator('button', { hasText: 'Buy' }).nth(1).click(); // Vulpe GTi
await page.waitForTimeout(600);
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.locator('button', { hasText: 'Race Events' }).first().click();
await page.waitForTimeout(500);
await page.locator('button', { hasText: 'SUNDAY CUP' }).first().click();
await page.waitForTimeout(500);
await page.locator('button', { hasText: 'Enter Race' }).first().click();
await page.waitForTimeout(500);
await page.locator('button', { hasText: 'Go Racing' }).first().click();
await page.waitForTimeout(9000);
await dismissTips();

await page.keyboard.press(' ');
await page.waitForTimeout(400);
check('pausing shows a pause overlay', (await page.locator('.pause-overlay').count()) === 1);
await page.keyboard.press(' ');
await page.waitForTimeout(300);
check('resuming removes it', (await page.locator('.pause-overlay').count()) === 0);

// --- the right-hand rail stacks instead of overlapping ---------------------
const overlap = await page.evaluate(() => {
  const cond = document.querySelector('.condition-panel')?.getBoundingClientRect();
  const intel = document.querySelector('.intel-panel')?.getBoundingClientRect();
  if (!cond || !intel || !intel.height) return false;
  return intel.top < cond.bottom - 1;
});
check('condition and intel panels do not overlap', !overlap);

// --- every referenced asset resolves --------------------------------------
check('no failed requests', netErrors.length === 0, netErrors.slice(0, 5).join(' | '));

await browser.close();
server.close();

if (failures.length) {
  console.error(`\n${failures.length} ui check(s) failed`);
  process.exit(1);
}
console.log('\nall ui checks passed');
