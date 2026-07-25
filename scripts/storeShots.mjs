// Captures the store screenshots by actually playing the game.
//
// itch.io leans heavily on screenshots — most people browsing decide from
// them alone — so these are taken from a real career run rather than mocked
// up, and re-run whenever the interface changes.
//
// Needs a build being served (npm run preview) and playwright installed.
//
//   node scripts/storeShots.mjs [outDir] [baseUrl]

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] ?? 'store';
const base = process.argv[3] ?? 'http://localhost:4173/';
mkdirSync(outDir, { recursive: true });

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
if (problems.length) {
  console.error('problems:', problems.slice(0, 10));
  process.exitCode = 1;
} else {
  console.log(`screenshots written to ${outDir}`);
}
