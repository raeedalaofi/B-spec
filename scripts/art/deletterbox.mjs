// Removes the flat bars baked into square-padded renders.
//
// Six backdrops and two cinematics came back as 16:9 images padded out to a
// 1008x1008 square with flat navy bars — and not even symmetric ones: meadow
// has 234px on top and 75px underneath. The game shows backdrops as a wide
// banner, so it was either displaying the bars or cropping unpredictably
// around them, and no backdrop could be tiled horizontally for parallax while
// it had a hard edge top and bottom.
//
// The bars are detected the same way scripts/art/qaAssets.mjs detects them: a
// row counts as bar if every sampled pixel across it is the same colour.
//
//   node scripts/art/deletterbox.mjs [--dry]

import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const DRY = process.argv.includes('--dry');

const TARGETS = [
  'public/assets/tracks/backdrops/city.png',
  'public/assets/tracks/backdrops/classic-gp.png',
  'public/assets/tracks/backdrops/dirt.png',
  'public/assets/tracks/backdrops/forest-mountain.png',
  'public/assets/tracks/backdrops/meadow.png',
  'public/assets/tracks/backdrops/speedway.png',
  'public/assets/cinematic/podium-back.png',
  'public/assets/cinematic/title-laurel.png',
];

function deltaLab(a, b) {
  const lab = (r, g, bl) => {
    let [rr, gg, bb] = [r, g, bl].map((v) => {
      const c = v / 255;
      return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
    });
    let x = (rr * 0.4124 + gg * 0.3576 + bb * 0.1805) / 0.95047;
    let y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
    let z = (rr * 0.0193 + gg * 0.1192 + bb * 0.9505) / 1.08883;
    [x, y, z] = [x, y, z].map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const A = lab(...a);
  const B = lab(...b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

for (const file of TARGETS) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const px = (x, y) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const flatRow = (y) => {
    const base = px(0, y);
    for (let x = 4; x < width; x += 7) if (deltaLab(base, px(x, y)) > 6) return false;
    return true;
  };
  const flatCol = (x) => {
    const base = px(x, 0);
    for (let y = 4; y < height; y += 7) if (deltaLab(base, px(x, y)) > 6) return false;
    return true;
  };

  let top = 0;
  while (top < height / 3 && flatRow(top)) top++;
  let bottom = 0;
  while (bottom < height / 3 && flatRow(height - 1 - bottom)) bottom++;
  let left = 0;
  while (left < width / 3 && flatCol(left)) left++;
  let right = 0;
  while (right < width / 3 && flatCol(width - 1 - right)) right++;

  const h = height - top - bottom;
  const w = width - left - right;
  if (h === height && w === width) {
    console.log(`  ${file.split('/').pop().padEnd(22)} no bars`);
    continue;
  }
  console.log(
    `  ${file.split('/').pop().padEnd(22)} ${width}x${height} → ${w}x${h}` +
      `  (top ${top}, bottom ${bottom}, left ${left}, right ${right})`,
  );
  if (DRY) continue;
  const out = await sharp(readFileSync(file))
    .extract({ left, top, width: w, height: h })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(file, out);
}

console.log(DRY ? '\ndry run — nothing written' : '\ndone');
