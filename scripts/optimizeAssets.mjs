// Ships the art at the size it is actually drawn at.
//
// Every generated asset is a 1008x1008 master, which is right for the art
// pipeline and badly wrong for a browser game: a driver portrait rendered in
// a 54px circle was a 2.8 MB download, and the whole build came to 251 MB.
// Nobody waits for that, least of all someone browsing a storefront.
//
// This runs after `vite build` and rewrites everything under dist/assets to
// the largest size it can appear at on a 2x display, with a little headroom.
// The masters in public/assets are untouched — they stay the source of truth,
// and re-running the build regenerates the shipped set from them.
//
// Uses sharp rather than shelling out to Pillow: this is on the default build
// path, so it has to work from a clean `npm ci` on any machine without
// anybody having to know that a Python package is secretly required.
//
//   node scripts/optimizeAssets.mjs [distDir]

import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import sharp from 'sharp';

/**
 * Longest edge to ship, per asset folder. Each is roughly twice the largest
 * size the asset is ever drawn at, so it still looks sharp on a retina panel
 * and at the closest camera shot.
 */
/**
 * Longest edge and encoder, per asset folder.
 *
 * The encoder used to be one line for everything: `png({palette: true})`,
 * justified in a comment as fine because "these are flat illustration-style
 * renders". That is true of the icons and false of everything else. Quantising
 * a photographic driver portrait to 256 colours takes it from ~7,000 colours
 * to 256, and a 1280px sky gradient from ~50,000 to 256, which bands visibly.
 *
 * So the photoreal lanes ship WebP instead — measured on this asset set it is
 * both smaller *and* far more faithful than the palettised PNG it replaces
 * (the forest backdrop: 490 KB / 256 colours becomes 138 KB / 37,581). The
 * flat lanes stay palettised PNG, where 256 colours genuinely is enough and
 * the alpha edges matter more than the colour count.
 *
 * `assetUrl()` in src/ui/assets.ts rewrites the extension for the WebP lanes
 * in production builds. Dev keeps serving the PNG masters.
 */
const LANES = [
  // drawn at up to ~30 device px even in the tightest battle shot
  ['cars/', 160, 'webp'],
  // 54px rival portrait, 28px in standings
  ['portraits/', 192, 'webp'],
  // particles scale with the camera; these get the most headroom
  ['fx/', 224, 'png'],
  // trackside scenery, ~70 device px at the closest shot
  ['tracks/props/', 160, 'webp'],
  // tiled patterns — they repeat, so they never need to be large
  ['tracks/tiles/', 256, 'webp'],
  // a full-width banner, 130px tall
  ['tracks/backdrops/', 1280, 'webp'],
  // full-screen menu backdrops
  ['cinematic/', 1600, 'webp'],
  // icons, medals, licence cards: 24-90px on screen
  ['ui/', 192, 'png'],
];

/** Keep this list in sync with WEBP_LANES in src/ui/assets.ts. */
export const WEBP_LANES = LANES.filter(([, , fmt]) => fmt === 'webp').map(([p]) => p);

function laneFor(rel) {
  return LANES.find(([prefix]) => rel.startsWith(prefix)) ?? ['', 256, 'png'];
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.png$/i.test(p)) out.push(p);
  }
  return out;
}

const distDir = process.argv[2] ?? 'dist';
const assetsDir = join(distDir, 'assets');
if (!existsSync(assetsDir)) {
  console.log(`no assets to optimise at ${assetsDir}`);
  process.exit(0);
}

const files = walk(assetsDir);
let before = 0;
let after = 0;

await Promise.all(
  files.map(async (file) => {
    const rel = relative(assetsDir, file).split(sep).join('/');
    const [, maxEdge, format] = laneFor(rel);
    // read first: sharp cannot safely write back to the file it is reading
    const input = readFileSync(file);
    before += input.length;
    const pipeline = sharp(input)
      // `inside` preserves aspect ratio, and withoutEnlargement leaves any
      // already-small asset alone rather than upscaling it
      .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true });
    const out = await (format === 'webp'
      ? pipeline.webp({ quality: 82, alphaQuality: 92, effort: 5 })
      : pipeline.png({ palette: true, quality: 90, effort: 7})
    ).toBuffer();
    if (format === 'webp') {
      // the .png masters stay the source of truth; only the shipped copy is
      // re-containered, and assetUrl() knows which lanes to ask for
      writeFileSync(file.replace(/\.png$/i, '.webp'), out);
      unlinkSync(file);
    } else {
      writeFileSync(file, out);
    }
    after += out.length;
  }),
);

const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
console.log(
  `optimised ${files.length} assets: ${mb(before)} → ${mb(after)} ` +
    `(${(100 * (1 - after / before)).toFixed(1)}% smaller)`,
);
