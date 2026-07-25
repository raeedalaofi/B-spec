// Builds a contact sheet of generated candidates for the likeness review.
//
// docs/CAR_LIKENESS.md asks a specific question of every candidate before it
// can be accepted: "which real car is this?" That question is much easier to
// answer honestly when the candidates are side by side at a consistent size
// than when they are opened one at a time — a Skyline is obvious next to seven
// other shapes and easy to rationalise on its own.
//
//   node scripts/art/reviewSheet.mjs [dir] [out.png]

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const dir = process.argv[2] ?? 'art-review/cars';
const out = process.argv[3] ?? 'art-review/contact-sheet.png';

if (!existsSync(dir)) {
  console.error(`nothing to review at ${dir} — run the batch first`);
  process.exit(1);
}

const files = readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort();
if (!files.length) {
  console.error(`no images in ${dir}`);
  process.exit(1);
}

const CELL = 320;
const cols = Math.min(4, files.length);
const rows = Math.ceil(files.length / cols);

const tiles = [];
for (let i = 0; i < files.length; i++) {
  const buf = await sharp(join(dir, files[i]))
    .resize(CELL, CELL, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  tiles.push({ input: buf, left: CELL * (i % cols), top: CELL * Math.floor(i / cols) });
}

await sharp({
  create: {
    width: CELL * cols,
    height: CELL * rows,
    channels: 4,
    // the same navy the game puts them on, so fringing and value problems show
    background: { r: 11, g: 19, b: 34, alpha: 1 },
  },
})
  .composite(tiles)
  .png()
  .toFile(out);

console.log(`${out} — ${files.length} candidates, ${cols}x${rows}`);
files.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2)}. ${f}`));
console.log('\nFor each candidate ask: which real car is this? If the answer comes');
console.log('quickly and confidently, reject it. See docs/CAR_LIKENESS.md.');
