// The art QA gate — §6 of docs/ART_BIBLE.md, made executable.
//
// The art bible always had a 7-point acceptance checklist. Nothing ran it, so
// 237 assets were generated across five model lanes and committed without any
// of them being checked. The result was five art styles in one game: green
// clipart icons next to photoreal portraits, a gold checkered flag, anime car
// sprites with a white matte still sitting in their transparent pixels.
//
// This runs the checklist. It is deliberately strict about the things that
// read as cheap from across the room — halos, off-palette colour, icons that
// collapse to the same blob at 20 px — and quiet about everything else.
//
//   node scripts/art/qaAssets.mjs [--json] [--dir public/assets] [--filter cars]
//
// Exits non-zero if any P0 check fails, so CI can gate on it.

import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import sharp from 'sharp';
import { nearestPaletteColor, rgbToHex } from './palette.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? true) : fallback;
};
const ROOT = flag('dir', 'public/assets');
const FILTER = flag('filter');
const AS_JSON = args.includes('--json');

/* ------------------------------------------------------------------ config */

/**
 * Which checks apply to which lane. The photoreal lanes (portraits, studio
 * renders, backdrops, cinematics) are exempt from palette conformance — they
 * are photographs of a world, not brand furniture — but they still have to be
 * halo-free, because that is a compositing defect rather than a style choice.
 */
const LANES = [
  { prefix: 'ui/', palette: true, cutout: true, silhouette: true },
  { prefix: 'fx/', palette: true, cutout: true, silhouette: false },
  { prefix: 'cars/', palette: false, cutout: true, silhouette: false, trim: true },
  { prefix: 'tracks/props/', palette: false, cutout: true, silhouette: false },
  { prefix: 'portraits/', palette: false, cutout: true, silhouette: false },
  { prefix: 'tracks/tiles/', palette: false, cutout: false, silhouette: false, tileable: true },
  { prefix: 'tracks/backdrops/', palette: false, cutout: false, silhouette: false, letterbox: true },
  { prefix: 'cinematic/', palette: false, cutout: false, silhouette: false, letterbox: true },
];

const THRESHOLDS = {
  // A transparent pixel next to the subject should carry roughly the subject's
  // colour. Advisory only: libvips premultiplies on resize and canvas stores
  // textures premultiplied, so leftover matte does not actually reach the
  // screen through this build path — but it is still a sign of a sloppy
  // background-removal pass and it would bite anyone who resamples naively.
  matteDeltaE: 18,
  // Soft-edge pixels per pixel of silhouette perimeter. Ordinary
  // anti-aliasing lands around 3; well under 1 means a hard stencil cut.
  minSoftEdgeRatio: 0.45,
  // Share of saturated pixels allowed to sit in a non-brand hue.
  paletteOffBudget: 0.12,
  // Two icons in the same family that share this much of their silhouette are
  // indistinguishable at HUD size.
  silhouetteSimilarity: 0.94,
  // Padding around the subject, as a share of the canvas edge. The bible asks
  // for a tight crop; wildly varying padding makes sprites render at different
  // apparent scales for no design reason.
  trimSpreadPct: 4,
};

/* ------------------------------------------------------------------- utils */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(png|webp)$/i.test(p)) out.push(p);
  }
  return out;
}

function laneFor(rel) {
  return LANES.find((l) => rel.startsWith(l.prefix)) ?? {};
}

/** Family key for silhouette comparison: icon-part-power-1 -> icon-part-power */
function familyOf(rel) {
  const base = rel.split('/').pop().replace(/\.(png|webp)$/i, '');
  return `${rel.split('/').slice(0, -1).join('/')}/${base.replace(/-\d+$/, '')}`;
}

const findings = [];
const record = (severity, file, check, message, detail) =>
  findings.push({ severity, file, check, message, ...detail });

/* ------------------------------------------------------------------ checks */

/**
 * Halo detection. Walks the band of transparent pixels touching the subject
 * and compares their colour to the opaque pixels they touch. A correctly
 * decontaminated cutout bleeds the subject outward, so the two agree.
 */
function checkMatte(rel, { data, width, height, channels }) {
  if (channels < 4) return;
  const A = channels - 1;
  const at = (x, y) => (y * width + x) * channels;
  let pairs = 0;
  let sumT = [0, 0, 0];
  let sumO = [0, 0, 0];
  let perimeter = 0;
  let soft = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = at(x, y);
      const a = data[i + A];
      if (a > 0 && a < 250) soft++;
      if (a !== 0) continue;
      // transparent — is it touching something opaque?
      let found = -1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = at(x + dx, y + dy);
        if (data[j + A] > 200) { found = j; break; }
      }
      if (found < 0) continue;
      perimeter++;
      sumT[0] += data[i]; sumT[1] += data[i + 1]; sumT[2] += data[i + 2];
      sumO[0] += data[found]; sumO[1] += data[found + 1]; sumO[2] += data[found + 2];
      pairs++;
    }
  }
  if (pairs < 50) return;

  const mT = sumT.map((v) => v / pairs);
  const mO = sumO.map((v) => v / pairs);
  const d = deltaELab(mT, mO);

  if (d > THRESHOLDS.matteDeltaE) {
    record('P2', rel, 'matte-residue',
      `transparent pixels carry ${rgbToHex(...mT)} while the subject edge is ${rgbToHex(...mO)} (ΔE ${d.toFixed(1)}) — this will halo when downscaled`,
      { deltaE: +d.toFixed(1), transparentRgb: rgbToHex(...mT), edgeRgb: rgbToHex(...mO) });
  }

  const ratio = perimeter ? soft / perimeter : 0;
  if (ratio < THRESHOLDS.minSoftEdgeRatio) {
    record('P2', rel, 'hard-cutout',
      `alpha edge is a hard cut (${ratio.toFixed(2)} soft px per perimeter px, want ≥ ${THRESHOLDS.minSoftEdgeRatio}) — edges will stair-step`,
      { softEdgeRatio: +ratio.toFixed(3) });
  }
}

/** Perceptual (CIE76) distance between two sRGB triples. */
function deltaELab(rgbA, rgbB) {
  const lab = (r, g, b) => {
    let [rr, gg, bb] = [r, g, b].map((v) => {
      const c = v / 255;
      return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
    });
    let x = (rr * 0.4124 + gg * 0.3576 + bb * 0.1805) / 0.95047;
    let y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
    let z = (rr * 0.0193 + gg * 0.1192 + bb * 0.9505) / 1.08883;
    [x, y, z] = [x, y, z].map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const A = lab(...rgbA);
  const B = lab(...rgbB);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

/**
 * Palette conformance, measured by hue family rather than exact colour.
 *
 * Exact-colour matching was the wrong model: a pale gold highlight like #FFEEAA
 * is a perfectly good tint of the brand gold but sits ΔE 29 away from it, so a
 * strict check flags legitimate shading while a loose one lets a green icon
 * through. What actually distinguishes on-brand art here is *hue* — B-Spec is
 * navy, gold and steel blue. Anything strongly saturated in another hue does
 * not belong, at any lightness.
 *
 * Desaturated pixels are always fine (they are the navy/silver ramp), and the
 * flags get an explicit exemption because green/yellow/red carry regulatory
 * meaning that outranks the brand.
 */
const HUE_FAMILIES = [
  { name: 'gold', center: 45, spread: 26 },
  { name: 'navy/accent', center: 217, spread: 34 },
];
const SEMANTIC_HUES = {
  'flag-green': { center: 130, spread: 40 },
  'flag-yellow': { center: 50, spread: 26 },
  'flag-red': { center: 5, spread: 26 },
  good: { center: 140, spread: 34 },
  bad: { center: 8, spread: 28 },
};
/** Files allowed to use a hue outside the brand, and which one. */
const HUE_EXEMPT = [
  [/fx\/flag-green/, 'flag-green'],
  [/fx\/flag-yellow/, 'flag-yellow'],
  [/fx\/(spark|celebration)/, 'flag-yellow'],
  [/ui\/icon-warning/, 'flag-yellow'],
  [/ui\/(icon-check|icon-ach)/, 'good'],
  [/ui\/(icon-retire|icon-fatigue)/, 'bad'],
];

function hueOf(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return { hue: 0, sat: 0 };
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { hue: (h * 60 + 360) % 360, sat: max === 0 ? 0 : d / max };
}

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function checkPalette(rel, { data, channels }) {
  const A = channels - 1;
  const allowed = [...HUE_FAMILIES];
  for (const [pattern, key] of HUE_EXEMPT) {
    if (pattern.test(rel)) allowed.push({ name: key, ...SEMANTIC_HUES[key] });
  }

  let saturated = 0;
  let off = 0;
  const offHues = new Map();
  for (let i = 0; i < data.length; i += channels) {
    if (channels === 4 && data[i + A] < 200) continue;
    const { hue, sat } = hueOf(data[i], data[i + 1], data[i + 2]);
    // near-neutral pixels are the navy/silver ramp — always legal
    if (sat < 0.22) continue;
    saturated++;
    if (!allowed.some((f) => hueDistance(hue, f.center) <= f.spread)) {
      off++;
      const bucket = Math.round(hue / 15) * 15;
      const prev = offHues.get(bucket) ?? { count: 0, hex: rgbToHex(data[i], data[i + 1], data[i + 2]) };
      offHues.set(bucket, { count: prev.count + 1, hex: prev.hex });
    }
  }
  if (saturated < 500) return;

  const share = off / saturated;
  if (share > THRESHOLDS.paletteOffBudget) {
    const top = [...offHues.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([hue, v]) => `${hue}° ${v.hex} (${(100 * v.count / saturated).toFixed(0)}%)`)
      .join(', ');
    record('P0', rel, 'off-palette',
      `${(100 * share).toFixed(0)}% of the saturated artwork is in a hue the palette does not contain — ${top}. B-Spec is navy, gold and steel.`,
      { offPaletteShare: +share.toFixed(3), offHues: top });
  }
}

/** Bounding box of the subject, for trim/pad consistency. */
function bbox({ data, width, height, channels }) {
  if (channels < 4) return { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  const A = channels - 1;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + A] > 16) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** 16x16 binary silhouette, for the "do these look the same at 20 px" test. */
async function silhouette(file) {
  const { data } = await sharp(file)
    .ensureAlpha()
    .resize(16, 16, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bits = new Uint8Array(256);
  for (let p = 0; p < 256; p++) bits[p] = data[p * 4 + 3] > 96 ? 1 : 0;
  return bits;
}

/** Detect the navy bars baked into square-padded 16:9 renders. */
function checkLetterbox(rel, { data, width, height, channels }) {
  const rowIsFlat = (y) => {
    const i0 = y * width * channels;
    const base = [data[i0], data[i0 + 1], data[i0 + 2]];
    for (let x = 4; x < width; x += 7) {
      const i = (y * width + x) * channels;
      if (deltaELab(base, [data[i], data[i + 1], data[i + 2]]) > 6) return false;
    }
    return true;
  };
  let top = 0;
  while (top < height / 3 && rowIsFlat(top)) top++;
  let bottom = 0;
  while (bottom < height / 3 && rowIsFlat(height - 1 - bottom)) bottom++;
  if (top > 6 || bottom > 6) {
    record('P1', rel, 'letterboxed',
      `flat bars baked into the image (${top}px top, ${bottom}px bottom) — re-export at the real aspect instead of padding to square`,
      { barTop: top, barBottom: bottom });
  }
}

/** Do opposite edges match closely enough to tile without a visible seam? */
function checkTileable(rel, { data, width, height, channels }) {
  const px = (x, y) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  let h = 0, v = 0, n = 0;
  for (let y = 0; y < height; y += 3) { h += deltaELab(px(0, y), px(width - 1, y)); n++; }
  const hAvg = h / n;
  n = 0;
  for (let x = 0; x < width; x += 3) { v += deltaELab(px(x, 0), px(x, height - 1)); n++; }
  const vAvg = v / n;
  if (hAvg > 12 || vAvg > 12) {
    record('P1', rel, 'not-tileable',
      `opposite edges do not match (ΔE ${hAvg.toFixed(1)} horizontal, ${vAvg.toFixed(1)} vertical) — this will show a grid seam when tiled`,
      { seamH: +hAvg.toFixed(1), seamV: +vAvg.toFixed(1) });
  }
}

/* -------------------------------------------------------------------- main */

const files = walk(ROOT).filter((f) => !FILTER || f.includes(FILTER));
const sils = new Map();
const trims = new Map();

for (const file of files) {
  const rel = relative(ROOT, file).split(sep).join('/');
  const lane = laneFor(rel);
  let img;
  try {
    img = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch (err) {
    record('P0', rel, 'unreadable', `could not decode: ${err.message}`, {});
    continue;
  }
  const buf = { data: img.data, width: img.info.width, height: img.info.height, channels: img.info.channels };

  if (lane.cutout) checkMatte(rel, buf);
  if (lane.palette) checkPalette(rel, buf);
  if (lane.letterbox) checkLetterbox(rel, buf);
  if (lane.tileable) checkTileable(rel, buf);

  if (lane.trim) {
    const bb = bbox(buf);
    if (bb) {
      const padPct = (100 * Math.min(bb.x0, bb.y0, buf.width - 1 - bb.x1, buf.height - 1 - bb.y1)) / buf.width;
      const fam = familyOf(rel).split('/').slice(0, -1).join('/');
      if (!trims.has(fam)) trims.set(fam, []);
      trims.get(fam).push({ rel, padPct, w: bb.x1 - bb.x0 + 1, h: bb.y1 - bb.y0 + 1 });
    }
  }

  if (lane.silhouette) {
    const fam = familyOf(rel);
    if (!sils.has(fam)) sils.set(fam, []);
    sils.get(fam).push({ rel, bits: await silhouette(file) });
  }
}

// families whose members are indistinguishable as silhouettes
for (const [fam, members] of sils) {
  if (members.length < 2) continue;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      let same = 0;
      for (let p = 0; p < 256; p++) if (members[i].bits[p] === members[j].bits[p]) same++;
      const sim = same / 256;
      if (sim >= THRESHOLDS.silhouetteSimilarity) {
        record('P1', members[j].rel, 'silhouette-clash',
          `${(100 * sim).toFixed(0)}% identical silhouette to ${members[i].rel.split('/').pop()} — these read as the same icon at HUD size`,
          { family: fam, similarity: +sim.toFixed(3), against: members[i].rel });
      }
    }
  }
}

// sprite families whose padding varies enough to change apparent scale
for (const [fam, members] of trims) {
  if (members.length < 2) continue;
  const pads = members.map((m) => m.padPct);
  const spread = Math.max(...pads) - Math.min(...pads);
  if (spread > THRESHOLDS.trimSpreadPct) {
    const lo = members.reduce((a, b) => (a.padPct < b.padPct ? a : b));
    const hi = members.reduce((a, b) => (a.padPct > b.padPct ? a : b));
    record('P1', fam, 'inconsistent-trim',
      `padding varies ${spread.toFixed(1)}% across the family (${lo.rel.split('/').pop()} ${lo.padPct.toFixed(1)}% … ${hi.rel.split('/').pop()} ${hi.padPct.toFixed(1)}%) — sprites render at different apparent scales`,
      { spreadPct: +spread.toFixed(1) });
  }
}

/* ------------------------------------------------------------------ report */

const p0 = findings.filter((f) => f.severity === 'P0');
const p1 = findings.filter((f) => f.severity === 'P1');

if (AS_JSON) {
  writeFileSync('art-qa-report.json', JSON.stringify({ checked: files.length, findings }, null, 2));
  console.log(`wrote art-qa-report.json (${findings.length} findings over ${files.length} assets)`);
} else {
  const byCheck = new Map();
  for (const f of findings) {
    if (!byCheck.has(f.check)) byCheck.set(f.check, []);
    byCheck.get(f.check).push(f);
  }
  for (const [check, group] of [...byCheck].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${group[0].severity}  ${check}  (${group.length})`);
    for (const f of group.slice(0, 6)) console.log(`    ${f.file}\n      ${f.message}`);
    if (group.length > 6) console.log(`    … and ${group.length - 6} more`);
  }
  console.log(`\n${files.length} assets checked — ${p0.length} P0, ${p1.length} P1`);
}

if (p0.length) {
  console.error(`\nart QA failed: ${p0.length} P0 violation(s). See docs/ART_BIBLE.md §6.`);
  process.exit(1);
}
