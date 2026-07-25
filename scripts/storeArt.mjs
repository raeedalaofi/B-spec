// Builds the itch.io store art from the game's own assets.
//
// itch.io asks for a 630x500 cover (it is the first and often only thing a
// browsing player sees). Composing it from the title screen's own backdrop
// and logo keeps the store page and the game looking like the same product,
// and means it regenerates whenever the art does.
//
//   node scripts/storeArt.mjs [outDir]

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const outDir = process.argv[2] ?? 'store';
mkdirSync(outDir, { recursive: true });

const BACKDROP = 'public/assets/cinematic/intro-pitwall.png';
const LOGO = 'public/assets/ui/logo-main.png';

/** cover-crop an image to exactly w x h, then push it back toward the navy */
async function backdrop(w, h, blend) {
  const base = await sharp(BACKDROP)
    .resize(w, h, { fit: 'cover', position: 'centre' })
    .toBuffer();
  // a flat navy wash so the logo and type read over a busy photo
  return sharp(base)
    .composite([
      {
        input: {
          create: {
            width: w,
            height: h,
            channels: 4,
            background: { r: 8, g: 14, b: 26, alpha: blend },
          },
        },
      },
    ])
    .toBuffer();
}

/**
 * The logo master is a 1024x1024 square with the wordmark floating in a lot
 * of transparent padding, so sizing it by width alone makes it as tall as it
 * is wide and overflows the canvas. Trim the padding, then constrain both
 * axes — which also lets the wordmark fill the width it was given.
 */
async function logoAt(width, maxHeight) {
  return sharp(LOGO)
    .trim()
    .resize(width, maxHeight, { fit: 'inside', withoutEnlargement: true })
    .toBuffer();
}

/** SVG text, so there is no font file to ship or find on a build machine */
function textLayer(w, h, items) {
  const lines = items
    .map(
      (t) =>
        `<text x="50%" y="${t.y}" text-anchor="middle" fill="${t.fill}" ` +
        `font-family="Helvetica,Arial,sans-serif" font-size="${t.size}" ` +
        `font-weight="${t.weight ?? 700}" letter-spacing="${t.spacing ?? 0}">${t.text}</text>`,
    )
    .join('');
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`,
  );
}

// ---- cover: 630x500, the size itch.io asks for -----------------------------

const W = 630;
const H = 500;
const cover = await backdrop(W, H, 0.55);
const coverLogo = await logoAt(Math.round(W * 0.82), Math.round(H * 0.34));
const coverLogoMeta = await sharp(coverLogo).metadata();
const logoTop = Math.round(H * 0.3 - coverLogoMeta.height / 2);
const ruleY = logoTop + coverLogoMeta.height + 16;

await sharp(cover)
  .composite([
    { input: coverLogo, top: logoTop, left: Math.round((W - coverLogoMeta.width) / 2) },
    {
      input: {
        create: {
          width: Math.round(W * 0.56),
          height: 2,
          channels: 4,
          background: { r: 201, g: 165, b: 74, alpha: 1 },
        },
      },
      top: ruleY,
      left: Math.round(W * 0.22),
    },
    {
      input: textLayer(W, H, [
        {
          text: 'RACE DIRECTOR SIMULATION',
          y: ruleY + 34,
          size: 17,
          fill: '#ffd75e',
          spacing: 2,
        },
        {
          text: "You don't drive. You decide.",
          y: ruleY + 62,
          size: 15,
          fill: '#c8d4e4',
          weight: 400,
        },
      ]),
      top: 0,
      left: 0,
    },
  ])
  .png({ palette: true, quality: 92 })
  .toFile(join(outDir, 'cover-630x500.png'));

// ---- banner: the same mark, wide, for the page header ----------------------

const BW = 1600;
const BH = 500;
const banner = await backdrop(BW, BH, 0.45);
const bannerLogo = await logoAt(Math.round(BW * 0.42), Math.round(BH * 0.62));
const bannerMeta = await sharp(bannerLogo).metadata();

await sharp(banner)
  .composite([
    {
      input: bannerLogo,
      top: Math.round((BH - bannerMeta.height) / 2 - 10),
      left: Math.round((BW - bannerMeta.width) / 2),
    },
  ])
  .png({ palette: true, quality: 92 })
  .toFile(join(outDir, 'banner-1600x500.png'));

console.log(`cover + banner written to ${outDir}`);
