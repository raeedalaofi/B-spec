// Brings the icon and FX lanes back onto the B-Spec palette.
//
// The icon lane was generated green. Not "slightly warm green" — the silver
// medal is 100% green, the skid mark is mint, the smoke is sage, and 41 assets
// in total sit in a hue the palette does not contain. The art bible asks for
// "flat, geometric, 1-color-on-alpha with gold/silver/blue variants"; what
// arrived was three-tone green-and-cream clipart.
//
// Rather than regenerate 41 assets and hope the next roll lands on-brand, this
// re-hues them deterministically. Lightness is preserved exactly, so every
// shape, outline and highlight survives — only the hue moves. That is enough
// to turn the set into the single-hue icon system the bible specified, and it
// is reversible because the masters are in git.
//
//   node scripts/art/recolour.mjs [--dry] [--only <substring>]

import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

/** Brand hues, in degrees. */
const H = { gold: 45, navy: 217, steel: 210, good: 146, bad: 7, amber: 40 };

/**
 * Per-asset recolour intent. First matching rule wins.
 *
 * `hue`      target hue, or null to desaturate to neutral
 * `sat`      multiplier on the source saturation (1 = keep)
 * `light`    optional lightness remap, for assets whose value range is wrong
 *            as well as its hue (a skid mark should be near-black, not mint)
 */
const RULES = [
  // --- FX: physical phenomena, which should read as neutral or warm ----------
  { match: /fx\/skid\./, hue: null, sat: 0, light: (l) => l * 0.28 },
  { match: /fx\/smoke-/, hue: null, sat: 0.08 },
  { match: /fx\/rain-/, hue: H.steel, sat: 0.5 },
  { match: /fx\/heat-haze/, hue: null, sat: 0.1 },
  { match: /fx\/dust-/, hue: H.gold, sat: 0.55, light: (l) => 0.18 + l * 0.78 },
  { match: /fx\/confetti-/, hue: H.gold, sat: 0.9 },
  { match: /fx\/celebration-/, hue: H.gold, sat: 0.9 },
  { match: /fx\/start-lights/, hue: null, sat: 0.12 },
  // a yellow flag must actually be yellow
  { match: /fx\/flag-yellow/, hue: 50, sat: 1.35, light: (l) => Math.min(1, l * 1.45) },

  // --- UI: semantic colours keep their meaning, everything else goes gold ----
  { match: /ui\/icon-check/, hue: H.good, sat: 1 },
  { match: /ui\/icon-warning/, hue: H.amber, sat: 1.15 },
  { match: /ui\/icon-retire/, hue: H.bad, sat: 1 },
  { match: /ui\/icon-ach-green-flag/, hue: H.good, sat: 1.1 },
  { match: /ui\/medal-silver/, hue: null, sat: 0.05, light: (l) => 0.2 + l * 0.72 },
  { match: /ui\/medal-bronze/, hue: 28, sat: 1 },
  { match: /ui\/medal-gold/, hue: H.gold, sat: 1 },
  // everything else in the icon lane becomes the single brand gold
  { match: /^ui\//, hue: H.gold, sat: 1 },
];

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255));
}

async function recolour(file, rel, rule) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let touched = 0;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i + ch - 1] === 0) continue;
    const [, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    // leave true neutrals alone — they are the white/black structure of the icon
    if (s < 0.08 && rule.hue !== null) continue;
    const nl = rule.light ? Math.max(0, Math.min(1, rule.light(l))) : l;
    const ns = Math.max(0, Math.min(1, s * rule.sat));
    const [r, g, b] = rule.hue === null ? hslToRgb(0, ns, nl) : hslToRgb(rule.hue, ns, nl);
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
    touched++;
  }
  if (DRY) return touched;
  const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(file, out);
  return touched;
}

const report = JSON.parse(readFileSync('art-qa-report.json', 'utf8'));
const targets = [...new Set(report.findings.filter((f) => f.check === 'off-palette').map((f) => f.file))]
  .filter((rel) => !ONLY || rel.includes(ONLY));

let done = 0;
for (const rel of targets) {
  const rule = RULES.find((r) => r.match.test(rel));
  if (!rule) { console.log(`  no rule for ${rel} — skipped`); continue; }
  const touched = await recolour(`public/assets/${rel}`, rel, rule);
  const target = rule.hue === null ? 'neutral' : `${rule.hue}°`;
  console.log(`  ${rel.padEnd(34)} → ${target.padEnd(8)} (${touched.toLocaleString()} px)`);
  done++;
}
console.log(`\n${DRY ? 'would recolour' : 'recoloured'} ${done} assets`);
