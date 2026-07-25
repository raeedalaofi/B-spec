// Captures the store screenshots by actually playing the game.
//
// itch.io leans heavily on screenshots — most people browsing decide from
// them alone — so these are taken from a real career run rather than mocked
// up, and re-run whenever the interface changes.
//
// Serves dist/ itself rather than expecting a preview server to already be
// running: `npm run store` has to work from a clean shell, and "start this
// other thing first" is the kind of undocumented prerequisite that makes a
// release script useless six months later.
//
//   node scripts/storeShots.mjs [outDir] [distDir]

import { chromium } from 'playwright';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const outDir = process.argv[2] ?? 'store';
const distDir = resolve(process.argv[3] ?? 'dist');
mkdirSync(outDir, { recursive: true });

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
};

// A static server just large enough to serve a built SPA. Bringing in a
// dependency for this would be more code than the thing it replaces.
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const rel = normalize(url).replace(/^([/\\])+/, '');
  let file = join(distDir, rel || 'index.html');
  if (!file.startsWith(distDir)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

const port = await new Promise((ok) => {
  server.listen(0, '127.0.0.1', () => ok(server.address().port));
});
const base = `http://127.0.0.1:${port}/`;

const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('response', (r) => {
  if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`);
});

// dismiss any coaching tip first: they are for a first-time player, not for
// a store page, and one covering the middle of the shot sells nothing
const shot = async (name) => {
  await dismissTips();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/screenshot-${name}.png` });
};
const click = async (text, nth = 0) => {
  await page.locator('button', { hasText: text }).nth(nth).click();
  await page.waitForTimeout(700);
};
async function dismissTips() {
  for (let i = 0; i < 3; i++) {
    const tip = page.locator('.coach-tip button');
    if (await tip.count()) {
      await tip.first().click();
      await page.waitForTimeout(500);
    }
  }
}

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await shot('1-title');

await page.getByRole('button', { name: 'New Career' }).click();
await page.waitForTimeout(800);
await click('Dealership');
await shot('6-dealership');
await click('Buy', 1); // the Vulpe GTi — the car the opening series expects

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await click('Race Events');
await click('SUNDAY CUP');
await shot('5-championship');

await click('Enter Race');
await shot('4-strategy');

await page.locator('button', { hasText: 'Go Racing' }).click();
await page.waitForTimeout(7000);
await dismissTips();
await page.waitForTimeout(6000);
await shot('2-race');

await page.keyboard.press('v');
await page.waitForTimeout(2200);
await shot('7-wide');
await page.keyboard.press('v');

// run it out for the results card and its highlight reel
await page.locator('button', { hasText: 'x4' }).first().click().catch(() => {});
for (let i = 0; i < 40 && !(await page.locator('.results-card').count()); i++) {
  await dismissTips();
  await page.waitForTimeout(4000);
}
await page.waitForTimeout(800);
await shot('3-results');

await browser.close();
server.close();
if (problems.length) {
  console.error('problems:', problems.slice(0, 10));
  process.exitCode = 1;
} else {
  console.log(`screenshots written to ${outDir}`);
}
