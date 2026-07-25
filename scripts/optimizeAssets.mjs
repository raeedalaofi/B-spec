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
//   node scripts/optimizeAssets.mjs [distDir]

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Longest edge to ship, per asset folder. Each is roughly twice the largest
 * size the asset is ever drawn at, so it still looks sharp on a retina panel
 * and at the closest camera shot.
 */
const MAX_EDGE = [
  // drawn at up to ~30 device px even in the tightest battle shot
  ['cars/', 160],
  // 54px rival portrait, 28px in standings
  ['portraits/', 192],
  // particles scale with the camera; these get the most headroom
  ['fx/', 224],
  // trackside scenery, ~70 device px at the closest shot
  ['tracks/props/', 160],
  // tiled patterns — repeat, so they never need to be large
  ['tracks/tiles/', 256],
  // a full-width banner, 130px tall
  ['tracks/backdrops/', 1280],
  // full-screen menu backdrops
  ['cinematic/', 1600],
  // icons, medals, licence cards: 24-90px on screen
  ['ui/', 192],
];

function maxEdgeFor(rel) {
  for (const [prefix, edge] of MAX_EDGE) {
    if (rel.startsWith(prefix)) return edge;
  }
  return 256;
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
  console.error(`no assets to optimise at ${assetsDir}`);
  process.exit(0);
}

const files = walk(assetsDir);
const plan = files.map((file) => ({
  file,
  maxEdge: maxEdgeFor(relative(assetsDir, file).split('\\').join('/')),
}));

// Pillow does the work; keeping it in one python call avoids paying process
// startup 240 times.
const script = `
import json, os, sys
from PIL import Image

plan = json.load(sys.stdin)
before = after = 0
for item in plan:
    path, max_edge = item["file"], item["maxEdge"]
    before += os.path.getsize(path)
    im = Image.open(path)
    if max(im.size) > max_edge:
        scale = max_edge / max(im.size)
        im = im.resize(
            (max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale))),
            Image.LANCZOS,
        )
    if im.mode == "RGBA":
        # quantise with the alpha channel preserved; these are flat
        # illustration-style renders, so a 256-colour palette is invisible
        # at the sizes they are drawn and roughly quarters the file
        im = im.quantize(colors=255, method=Image.FASTOCTREE)
    elif im.mode not in ("P", "L"):
        im = im.convert("RGB")
    im.save(path, "PNG", optimize=True)
    after += os.path.getsize(path)
print(json.dumps({"count": len(plan), "before": before, "after": after}))
`;

const result = execFileSync('python3', ['-c', script], {
  input: JSON.stringify(plan),
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const { count, before, after } = JSON.parse(result.trim().split('\n').pop());
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
console.log(
  `optimised ${count} assets: ${mb(before)} → ${mb(after)} ` +
    `(${(100 * (1 - after / before)).toFixed(1)}% smaller)`,
);
