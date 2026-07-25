// The locked B-Spec palette, shared by the art QA gate and the recolour tools.
//
// These are the same values as the CSS tokens in src/ui/tokens.css and the
// palette table in docs/ART_BIBLE.md. If you change one, change all three —
// qaAssets.mjs will fail the build if generated art drifts away from this set.

/** Core brand colours. Every generated asset must be built from these. */
export const PALETTE = {
  'navy-0': '#060A12',
  'navy-1': '#0B1322',
  'navy-2': '#101C30',
  'navy-3': '#1B2C48',
  gold: '#C9A54A',
  'gold-bright': '#FFD75E',
  'gold-deep': '#8A6E2A',
  silver: '#E8ECF4',
  'silver-dim': '#93A0B4',
  steel: '#5B6472',
  accent: '#4F8EDC',
  good: '#58D68A',
  bad: '#E06C5C',
};

/**
 * Colours that are legal in art but are not brand colours — pure black and
 * white for the checkered flag, and the flag greens/yellows that carry
 * regulatory meaning and must stay true to motorsport convention.
 */
export const SEMANTIC = {
  white: '#FFFFFF',
  black: '#101318',
  'flag-green': '#2FA84F',
  'flag-yellow': '#F2C230',
  'flag-red': '#D8443A',
};

export const ALL = { ...PALETTE, ...SEMANTIC };

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** sRGB -> CIE Lab, so colour distance means something perceptual. */
export function rgbToLab(r, g, b) {
  let [rr, gg, bb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  });
  // sRGB D65 -> XYZ
  let x = (rr * 0.4124 + gg * 0.3576 + bb * 0.1805) / 0.95047;
  let y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
  let z = (rr * 0.0193 + gg * 0.1192 + bb * 0.9505) / 1.08883;
  [x, y, z] = [x, y, z].map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIE76 distance. ~2.3 is a just-noticeable difference; 10+ is obvious. */
export function deltaE(rgbA, rgbB) {
  const a = rgbToLab(...rgbA);
  const b = rgbToLab(...rgbB);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const LAB_CACHE = Object.entries(ALL).map(([name, hex]) => ({
  name,
  hex,
  rgb: hexToRgb(hex),
}));

/**
 * Nearest palette entry to an arbitrary colour, with its perceptual distance.
 * Greys are measured against the navy/silver ramp, so a neutral mid-grey is
 * never "far" from the palette in a way that matters.
 */
export function nearestPaletteColor(rgb) {
  let best = null;
  for (const entry of LAB_CACHE) {
    const d = deltaE(rgb, entry.rgb);
    if (!best || d < best.distance) best = { ...entry, distance: d };
  }
  return best;
}
