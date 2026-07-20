# B-Spec — Visual Asset Production Plan (Scenario Pipeline)

**Version 1.1 · July 2026 · Status: ready for production — READY-MADE MODELS ONLY**

> **Revision v1.1 (client decision):** production uses Scenario's ready-made
> platform models exclusively — no custom LoRA training. Consistency is
> achieved instead through: (1) a locked shared prompt prefix per lane,
> (2) the Flux **Kontext** platform model for the studio-render → top-down
> transformation (instruction-based img2img, no training needed),
> (3) fixed seed families logged per car in `docs/art-manifest.csv`, and
> (4) native-alpha lanes (Ideogram V3 Generate Transparent / Recraft v3).
> §2.1 below is retained for reference but is OUT OF SCOPE.
> Pipeline runner: `scripts/art/scenario.mjs` (credentials via env vars,
> never committed). A 6-asset pilot batch
> (`scripts/art/manifest-pilot.json`) gates mass production on style
> approval.

This document is the single source of truth for producing 100% of B-Spec's
visual assets through [Scenario](https://www.scenario.com). It is written so
production can start the moment the Scenario workspace is connected: every
asset has an ID, size, count, assigned model, prompt template, and an
integration target in the codebase.

**Hard requirement: every generated asset ships as PNG with an alpha
channel.** Isolated subjects (cars, icons, portraits, props, badges) use
native transparent generation or background removal. The only
alpha-trivial category is tileable ground textures, which are exported as
PNG-32 with a fully opaque alpha channel (see §4.2 note).

---

## 1. Art Direction — the "B-Spec Broadcast" style

The target is the mid-2000s *Gran Turismo 4* feeling reinterpreted for a
modern 2D broadcast presentation — **clean, premium, televised motorsport**,
never cartoonish, never "AI-shiny".

| Pillar | Rule |
| --- | --- |
| Palette | Anchor to the game UI tokens: deep navy `#0B1322`/`#101C30`, gold `#C9A54A`/`#FFD75E`, silver text `#E8ECF4`, accent blue `#4F8EDC`, alert red `#E06C5C`. Assets must sit naturally on dark navy panels. |
| Lighting | Soft studio lighting for cars/portraits (single key + rim), overcast neutral daylight for track elements. No harsh HDR bloom. |
| Materials | Believable automotive paint, brushed metal, matte plastics. Restrained reflections. |
| Line & form | Realistic proportions with slightly idealized "brochure" cleanliness. UI iconography is flat, geometric, 1-color-on-alpha with gold/silver/blue variants. |
| Typography in images | None. All text is rendered by the game UI. Generated assets must be text-free (negative-prompt it). |
| Era flavor | 2000s JDM/Euro racing aesthetic: sponsor-less liveries, period silhouettes, GT-style menu elegance. |

**Global negative prompt (append to everything):**
`text, watermark, logo, letters, numbers, signature, frame, border, cartoon, anime, low-poly, blurry, oversaturated, extra wheels, deformed`

---

## 2. Scenario Setup — models & custom training

### 2.1 Custom models to train first (Week 0)

Scenario's core strength is style-locked custom models (LoRA, 15–50 curated
reference images each; can be merged 2–5 at a time with weight sliders).
Train these three before mass production:

| Custom model | Dataset (we curate) | Purpose |
| --- | --- | --- |
| **BSPEC-Style** (style LoRA) | 30–40 refs of the target look: GT-era menu screens vibe, studio car photography, dark-navy/gold UI mood boards, our existing CSS screens | The global style glue — merged at 0.4–0.6 weight into almost every generation for cross-asset consistency |
| **BSPEC-Vehicle** (subject LoRA) | 25–35 clean studio shots of sponsor-less 2000s-style cars (3/4 views, side, top-down), consistent lighting | All car renders & sprites keep one "photographer" |
| **BSPEC-TopDown** (Flux **Kontext** LoRA — paired before→after) | 15–20 pairs: 3/4 beauty render → same car exact top-down orthographic sprite | The critical transformation: guarantees the in-race top-down sprite matches the garage render of the *same* car |

> Optional 4th: **BSPEC-Icon** style LoRA (12–20 flat gold/navy icon refs)
> if Recraft/Ideogram outputs drift; usually the two base models below are
> consistent enough with a shared prompt prefix.

### 2.2 Base/third-party model routing

| Asset class | Primary model on Scenario | Why | Alpha method |
| --- | --- | --- | --- |
| Car beauty renders | **Flux (latest, e.g. FLUX.2/1.1-pro tier) + BSPEC-Vehicle + BSPEC-Style** | Best automotive photorealism with LoRA support | Scenario **Remove Background** pass |
| Car top-down sprites | **BSPEC-TopDown (Flux Kontext LoRA)** applied to each approved render | View-transformation consistency per car | Remove Background |
| UI icons, license badges, medals, class chips, part icons, category glyphs | **Ideogram V3 — Generate Transparent** (native alpha at generation) | Alpha is produced *in* the render — cleanest edges for UI | **Native alpha** ✅ |
| Flat vector-feel illustrations (trophy cups, achievement icons) | **Recraft v3** (design/icon specialist), fallback Ideogram V3 Transparent | Best-in-class flat/vector iconography | Native (Recraft transparent style) or Remove Background |
| Driver portraits | **Flux + BSPEC-Style** | Consistent "team photo" look | Remove Background |
| Track scenery props (trees, grandstands, barriers, buildings, bridges, pit gantry) | **Flux + BSPEC-Style**, batch per biome | Photoreal props that compose into scenes | Ideogram V3 Transparent for simple props; Remove Background for complex ones |
| Tileable ground textures (asphalt, grass, gravel, dirt, curbs, city road) | **Flux texture/tileable workflow** (+ Scenario upscale) | Seamless tiles for the canvas renderer | Opaque PNG-32 (see §4.2) |
| Podium / cinematic layer art | **GPT Image 2 or Imagen 4 tier + BSPEC-Style** | Large hero compositions, layered export | Remove Background per layer |
| Menu backdrop plates (soft abstract navy/gold scenes) | **Flux + BSPEC-Style** | Mood consistency | Opaque (full-bleed backdrops) — flagged as the second alpha exception |

Pipeline tools used throughout: Scenario upscaler (2×/4× before export),
inpainting (fix wheels/edges), model merging (style blends), background
removal (single click, batch).

---

## 3. Delivery standard

- **Format:** PNG-32 (RGBA). Isolated assets: tight alpha crop + 8 px
  padding. sRGB.
- **Scale:** master at 2× listed size (e.g. icon listed 128 → deliver 256),
  game ships downscaled.
- **Naming:** `category/asset-id.png`, kebab-case, deterministic ids listed
  below (they map 1:1 to code).
- **Folders:** `public/assets/{cars|tracks|ui|portraits|fx|cinematic}/…`
- **QA gate per batch (§6):** style match vs. BSPEC-Style board, clean alpha
  edge at 200% zoom on navy `#0B1322`, no text artifacts, correct silhouette
  readability at in-game size.

---

## 4. Asset Inventory (itemized)

### 4.1 Cars — 40 assets

8 cars: `kestrel, vulpe, taro, falcon, serval, kite, phantom, arrow`
(specs & colors in `src/data/cars/index.ts`; each car's canonical paint =
its `color` token).

| ID pattern | Description | Size (master) | Count | Batch |
| --- | --- | --- | --- | --- |
| `cars/{id}-studio.png` | 3/4 front studio beauty render, isolated | 1600×1000 | 8 | **P0** |
| `cars/{id}-topdown.png` | Orthographic top-down sprite, nose up, from Kontext LoRA | 512×1024 | 8 | **P0** |
| `cars/{id}-side.png` | Side profile (dealership compare strip) | 1600×700 | 8 | P2 |
| `cars/{id}-damaged.png` | Top-down with dust/scuff overlay state | 512×1024 | 8 | P2 |
| `cars/{id}-aero.png` | Top-down variant with visible aero kit (tuning feedback) | 512×1024 | 8 | P3 |

Integration: garage/dealership cards (`src/ui/screens/garage.ts`,
`dealership.ts`), race renderer replaces chevrons
(`src/render/raceRenderer.ts` — sprite drawn at `posAt()` with heading
rotation; tinting stays available via canvas composite for AI liveries).

### 4.2 Tracks — 6 biomes + 19 thumbnails = 85 assets

Scenery is **composed in-engine**: tileable ground + alpha props scattered
along the ribbon. This keeps every prop alpha-native and lets 19 tracks
share 6 biome packs.

Biomes: `meadow` (oval, greenpark, sonora), `forest-mountain` (kaiserwald,
alpenstrasse, condorpass), `speedway` (neonspeedway, lacourbe, fujimi,
motegrand), `city` (newport, lumiere, kowloon, hanriver), `classic-gp`
(aria, copperline, shirakawa, tsubame), `dirt` (dustbowl).

| ID pattern | Description | Size | Count | Batch |
| --- | --- | --- | --- | --- |
| `tracks/tiles/{biome}-ground.png` | Seamless base terrain tile (opaque PNG-32) | 512×512 | 6 | **P0** |
| `tracks/tiles/{biome}-asphalt.png` | Seamless road surface tile | 512×512 | 6 | **P0** |
| `tracks/tiles/curb.png`, `runoff.png`, `dirt-road.png` | Shared surface strips | 512×128 | 3 | **P0** |
| `tracks/props/{biome}-{n}.png` | Alpha props: trees, rocks, grandstand, buildings, lamps, cranes… (6 per biome) | 512–1024² | 36 | **P1** |
| `tracks/props/shared-{n}.png` | Pit building, start gantry, marshals post, tire walls, barriers, flags (8 shared) | 512–1024² | 8 | **P1** |
| `tracks/thumbs/{trackId}.png` | Stylized minimap card (gold line on navy, alpha) — generated from our real spline render, styled via img2img | 600×400 | 19 | P2 |
| `tracks/backdrops/{biome}.png` | Soft horizon backdrop plate (opaque) | 1920×600 | 6 | P3 |
| `tracks/decals/{n}.png` | Skid patches, oil stains, painted grid slots (alpha decals) | 256² | 6 | P2 |

Integration: `raceRenderer.buildRibbon()` gains tile-pattern fills + a
deterministic prop scatterer seeded per track (props never overlap the
ribbon; density per biome).

### 4.3 People — 30 assets

| ID pattern | Description | Size | Count | Batch |
| --- | --- | --- | --- | --- |
| `portraits/{aiDriverId}.png` | Bust portrait, racing suit, neutral bg removed; 21 named AI drivers (`src/data/aidrivers.ts`), tier-coded suit trim (rookie blue / pro silver / ace gold) | 512×512 | 21 | **P1** |
| `portraits/player-{n}.png` | Player avatar set (selectable) | 512×512 | 6 | P2 |
| `portraits/celebration-{n}.png` | Generic podium poses (spray, trophy lift, wave) | 800×1000 | 3 | P2 |

Integration: timing tower rows, standings, driver screen, results podium.

### 4.4 UI System — 118 assets

All flat, gold/silver/navy, alpha-native (Ideogram V3 Transparent / Recraft).

| Group | IDs | Count | Batch |
| --- | --- | --- | --- |
| Brand | `ui/logo-main`, `logo-mark`, `logo-mono`, `favicon-src` | 4 | **P0** |
| Core icons | credits, pp, laps, tires, fuel, fatigue, morale, pace, overtake, pit, speed, audio-on/off, back, settings, save, lock, checkmark, warning, info, home, garage, dealer, driver, events, freerace, retire, trophy-generic, calendar, stopwatch | 30 | **P0** |
| License badges | `ui/license-{b,a,ic,ia,s}` × normal/held | 10 | **P1** |
| Medals | gold, silver, bronze (+ empty slot) | 4 | **P1** |
| Class chips | C, B, A | 3 | **P1** |
| Part icons | 9 parts + 5 category glyphs (`src/data/parts.ts`) | 14 | **P1** |
| Achievement icons | 1 per achievement (`src/state/achievements.ts`, 27) | 27 | P2 |
| Category art | trophy, reverse-gp, endurance, rally, super, missions, invitational, one-make, grand-tour | 9 | P2 |
| Trophies/cups | championship cup ×3 tiers, invitational shield, title laurel | 5 | P2 |
| Panel furniture | 9-slice panel, card frame, divider flourish, ribbon banner, tooltip arrow, slider knob, toggle | 8 | P2 |
| Menu backdrops | main-menu hero, hub, garage floor, dealership showroom (opaque plates) | 4 | P3 |

### 4.5 Race FX — 20 assets

| IDs | Description | Size | Count | Batch |
| --- | --- | --- | --- | --- |
| `fx/dust-{1..3}`, `smoke-{1..3}` | Puff sprites (alpha, grayscale-tintable) | 256² | 6 | P2 |
| `fx/spark-{1..2}`, `confetti-{1..2}` | Overtake/finish accents | 256² | 4 | P2 |
| `fx/skid`, `glow-line` | Tire mark strip, battle highlight | 256×64 | 2 | P2 |
| `fx/light-tower`, `flag-green`, `flag-checkered`, `flag-yellow` | Start sequence & flags | 512² | 4 | P1 |
| `fx/rain-{1..2}`, `night-vignette`, `heat-haze` | Future weather hooks | var | 4 | P3 |

### 4.6 Cinematic layers — 11 assets

| IDs | Description | Count | Batch |
| --- | --- | --- | --- |
| `cinematic/podium-{back,mid,front}.png` | Layered podium scene (parallax) | 3 | P2 |
| `cinematic/title-{sunday,clubman,national}.png` | Championship title cards (no text — art only) | 3 | P2 |
| `cinematic/intro-grid.png`, `intro-pitwall.png` | Race intro plates | 2 | P3 |
| `cinematic/license-{pass,perfect}.png`, `gameover-retire.png` | Moment cards | 3 | P3 |

### Inventory totals

| Batch | Assets | Cumulative |
| --- | --- | --- |
| **P0 — playable reskin core** (cars ×2 views, ground tiles, brand + core icons) | 65 | 65 |
| **P1 — world & identity** (props, portraits, badges/medals/parts, flags) | 93 | 158 |
| **P2 — full dress** (achievements, category art, FX, cinematics, thumbs, variants) | 108 | 266 |
| **P3 — luxury** (aero variants, backdrops, weather, extra plates) | 38 | **304** |

---

## 5. Prompt Template Library

**Shared prefix (every generation):**
`professional game asset, Gran Turismo era broadcast aesthetic, deep navy and gold palette, clean studio quality, isolated on transparent background` *(+ global negative prompt from §1)*

- **Car studio render** — *Flux + BSPEC-Vehicle + BSPEC-Style:*
  `{car description from data file: e.g. "compact 2000s Japanese hatchback, {colorHex} paint, sponsor-less"}, three-quarter front studio shot, soft key light with gold rim light, glossy showroom floor reflection cropped out`
- **Top-down sprite** — *BSPEC-TopDown Kontext, input = approved studio render:*
  `convert to orthographic top-down view, nose pointing up, full car visible, crisp silhouette, even neutral lighting`
- **UI icon** — *Ideogram V3 Generate Transparent:*
  `flat minimal game UI icon of {subject}, single weight geometric line-and-fill, metallic gold #C9A54A on transparent, subtle silver accent, no text`
- **License badge:** `heraldic racing license badge, letter-free shield, {tier metal: bronze/silver/gold/platinum/black-gold}, laurel detail, flat emblem style`
- **Portrait** — *Flux + BSPEC-Style:*
  `professional portrait of a {age} {region-neutral} racing driver, {tier} team racing suit with {trim color} trim, confident expression, studio headshot, chest-up`
- **Biome prop:** `{prop}, {biome} environment, viewed from high angle 60 degrees, game map object, consistent overcast daylight`
- **Seamless tile:** `seamless tileable texture, {surface}, top-down orthographic, even lighting, no vignette, high detail`

Batch discipline: generate 8–16 candidates per asset, shortlist 2, upscale
the winner, alpha-pass, file under the exact ID. Log seed + prompt of every
accepted asset in `docs/art-manifest.csv` (created at production start) so
any asset can be regenerated or style-matched later.

---

## 6. QA Checklist (per batch)

1. Renders on `#0B1322` panel with zero halo/fringing at 200% zoom.
2. Style board side-by-side: palette, lighting, and finish match BSPEC-Style.
3. Silhouette test at true in-game size (icons at 20 px, car sprites at ~28 px).
4. No embedded text, no watermark ghosts, no borders.
5. File: PNG-32, correct ID, correct master size, tight crop + 8 px pad.
6. Same-car consistency: `{id}-studio` vs `{id}-topdown` pass a paint/shape match review.
7. Batch committed to `public/assets/…` + manifest row added.

---

## 7. Production Order (day-one plan when Scenario connects)

1. **Day 0:** curate the 3 training datasets → train BSPEC-Style, BSPEC-Vehicle, BSPEC-TopDown → lock a 12-image approved style board.
2. **P0 (65):** 8 studio renders → approve → 8 Kontext top-downs → tiles + brand + 30 core icons. *Engine work in parallel: sprite renderer + tile ribbon.*
3. **P1 (93):** props + portraits + badges/medals/parts/flags. *Engine: prop scatterer, portrait slots.*
4. **P2 (108):** achievements, category art, FX, cinematics, thumbnails, car variants.
5. **P3 (38):** luxury pass.

Deferred by agreement: audio assets, store/publishing art, and platform SDK
work — a separate plan before release.
