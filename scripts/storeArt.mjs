// Builds the itch.io store art from the game's own assets.
//
// itch.io asks for a 630x500 cover (it is the first and often only thing a
// browsing player sees) and a set of screenshots. Composing the cover from
// the title screen's own backdrop and logo keeps the store page and the game
// looking like the same product, and means it regenerates if the art does.
//
//   node scripts/storeArt.mjs [outDir]

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] ?? 'store';
mkdirSync(outDir, { recursive: true });

const script = `
import os, sys
from PIL import Image, ImageDraw, ImageFilter

out = sys.argv[1]
W, H = 630, 500

backdrop = Image.open("public/assets/cinematic/intro-pitwall.png").convert("RGB")
# cover-crop the backdrop to the cover's aspect ratio
scale = max(W / backdrop.width, H / backdrop.height)
bd = backdrop.resize((round(backdrop.width * scale), round(backdrop.height * scale)), Image.LANCZOS)
left = (bd.width - W) // 2
top = (bd.height - H) // 2
cover = bd.crop((left, top, left + W, top + H))

# darken so the logo reads: a vertical gradient, heaviest at the bottom where
# the text sits
overlay = Image.new("L", (1, H))
for y in range(H):
    t = y / H
    overlay.putpixel((0, y), int(120 + 110 * (t ** 1.6)))
mask = overlay.resize((W, H))
navy = Image.new("RGB", (W, H), (8, 14, 26))
cover = Image.composite(navy, cover, mask.point(lambda v: v))
cover = Image.blend(cover, navy, 0.18)

logo = Image.open("public/assets/ui/logo-main.png").convert("RGBA")
lw = int(W * 0.82)
logo = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
# a soft glow behind the mark so it survives a busy backdrop
glow = Image.new("RGBA", cover.size, (0, 0, 0, 0))
gx, gy = (W - logo.width) // 2, int(H * 0.30) - logo.height // 2
glow.paste(logo, (gx, gy), logo)
glow = glow.filter(ImageFilter.GaussianBlur(18))
cover = Image.alpha_composite(cover.convert("RGBA"), glow)
cover.alpha_composite(logo, (gx, gy))

d = ImageDraw.Draw(cover)
# gold rule + tagline, matching the game's own type treatment
bar_y = int(H * 0.30) + logo.height // 2 + 16
d.rectangle([W * 0.22, bar_y, W * 0.78, bar_y + 2], fill=(201, 165, 74, 255))

def centred(text, y, size, fill):
    try:
        from PIL import ImageFont
        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", size
        )
    except Exception:
        font = None
    if font:
        w = d.textbbox((0, 0), text, font=font)[2]
        d.text(((W - w) / 2, y), text, font=font, fill=fill)
    else:
        d.text((W / 2, y), text, fill=fill, anchor="ma")

centred("RACE DIRECTOR SIMULATION", bar_y + 18, 17, (255, 215, 94, 255))
centred("You don't drive. You decide.", bar_y + 46, 15, (200, 212, 228, 255))
cover.convert("RGB").save(os.path.join(out, "cover-630x500.png"), "PNG", optimize=True)

# The same mark on a wide banner, for the page header.
BW, BH = 1600, 500
scale = max(BW / backdrop.width, BH / backdrop.height)
bd2 = backdrop.resize((round(backdrop.width * scale), round(backdrop.height * scale)), Image.LANCZOS)
l2, t2 = (bd2.width - BW) // 2, (bd2.height - BH) // 2
banner = bd2.crop((l2, t2, l2 + BW, t2 + BH))
banner = Image.blend(banner, Image.new("RGB", (BW, BH), (8, 14, 26)), 0.45)
logo2 = Image.open("public/assets/ui/logo-main.png").convert("RGBA")
lw2 = int(BW * 0.42)
logo2 = logo2.resize((lw2, round(logo2.height * lw2 / logo2.width)), Image.LANCZOS)
banner = banner.convert("RGBA")
banner.alpha_composite(logo2, ((BW - lw2) // 2, (BH - logo2.height) // 2 - 10))
banner.convert("RGB").save(os.path.join(out, "banner-1600x500.png"), "PNG", optimize=True)

print("cover + banner written to", out)
`;

console.log(
  execFileSync('python3', ['-c', script, outDir], { encoding: 'utf8' }).trim(),
);
