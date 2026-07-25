# B-Spec — Art Bible

This supersedes §1 and §6 of `ART_PRODUCTION_PLAN.md`. That document is still
the record of *how* the assets are produced (models, prompts, manifests); this
one defines *what is acceptable*, and unlike its predecessor every rule here is
machine-checked by `scripts/art/qaAssets.mjs` on every pull request.

## Why this exists

The original plan had a good art direction and a 7-point QA checklist. Nothing
ran the checklist. 237 assets were generated across five model lanes and
committed unreviewed, and the lanes drifted independently:

- the icon lane came back **green** — 41 assets in a hue the palette does not
  contain, including a silver medal that was 100% green and a mint-coloured
  skid mark
- the top-down car lane came back **cel-shaded**, against a negative prompt that
  explicitly banned `anime`, while the studio renders of the same cars are
  photoreal
- the checkered flag came back **gold**, and the green flag came back
  **checkered**, so the two most important state signals in a racing game shared
  a silhouette and differed only in hue
- seven backdrops and cinematics were **padded to square with flat bars**
- eleven "seamless" tiles **do not tile**

None of that is a rendering bug or a model failure. It is the predictable result
of having a standard and no gate. The gate is the deliverable.

## 1. The look

Mid-2000s *Gran Turismo* reinterpreted as a modern 2D broadcast package: clean,
premium, televised motorsport. Never cartoonish, never "AI-shiny".

| Pillar | Rule |
| --- | --- |
| Palette | Navy, gold and steel. Full set below — it is shared code, not prose. |
| Hue discipline | Saturated pixels must sit in the gold family (45° ± 26) or the navy/steel family (217° ± 34). Near-neutrals are always legal. Green, magenta, teal and orange are not B-Spec colours. |
| Semantic exceptions | Flags and status icons may use regulatory green/yellow/red. These are enumerated in `HUE_EXEMPT` in `qaAssets.mjs` — if an asset needs an exception, add it there so the exception is reviewable. |
| Lighting | Soft studio key + rim for cars and portraits; overcast neutral daylight for track elements. No HDR bloom. |
| Iconography | Flat, geometric, single-hue on alpha. An icon must be identifiable **by silhouette alone at 20 px**. |
| Typography in images | None. All text is rendered by the UI, in Barlow Condensed / Roboto Mono. |
| Vehicles | Original silhouettes. **No badges, no marque-identifiable styling cues, no sponsor liveries.** |

## 2. The palette

Defined once in `scripts/art/palette.mjs`, mirrored in `src/ui/tokens.css`.
Changing a value means changing both.

| Token | Hex | Use |
| --- | --- | --- |
| `navy-0 … navy-3` | `#060A12` `#0B1322` `#101C30` `#1B2C48` | surfaces, deepest to raised |
| `gold` / `gold-bright` / `gold-deep` | `#C9A54A` `#FFD75E` `#8A6E2A` | brand, highlights, shadow side |
| `silver` / `silver-dim` / `steel` | `#E8ECF4` `#93A0B4` `#5B6472` | text and neutral metal |
| `accent` | `#4F8EDC` | interactive, links, player marker |
| `good` / `bad` | `#58D68A` `#E06C5C` | success and alarm only |

## 3. Per-lane rules

| Lane | Palette-locked | Cut-out | Notes |
| --- | --- | --- | --- |
| `ui/` | yes | yes | single hue, 20 px silhouette test, families must not collide |
| `fx/` | yes | yes | additive-blended sprites must be luminance-carrying on black |
| `cars/` | no | yes | uniform trim; `-studio` and `-topdown` must match in render style |
| `portraits/`, `tracks/props/` | no | yes | photoreal, must sit on navy without fringing |
| `tracks/tiles/` | no | no | **must tile** — opposite edges within ΔE 12 |
| `tracks/backdrops/`, `cinematic/` | no | no | real aspect ratio, **no bars baked in** |

## 4. Acceptance — what the gate checks

Run locally with `node scripts/art/qaAssets.mjs`; CI runs it on every PR and
fails the build on any **P0**.

| Check | Severity | Fails when |
| --- | --- | --- |
| `off-palette` | P0 | >12% of saturated pixels sit outside the allowed hue families |
| `unreadable` | P0 | the file cannot be decoded |
| `silhouette-clash` | P1 | two icons in a family share ≥94% of their 16×16 alpha mask |
| `not-tileable` | P1 | opposite edges of a tile differ by more than ΔE 12 |
| `letterboxed` | P1 | more than 6px of flat bar at the top or bottom |
| `inconsistent-trim` | P1 | padding varies >4% of canvas across a sprite family |
| `matte-residue` | P2 | transparent pixels carry a colour far from the subject edge |
| `hard-cutout` | P2 | fewer than 0.45 soft pixels per pixel of silhouette perimeter |

### A note on halos

An earlier draft of this audit called matte residue a P0 and claimed every
sprite would halo on downscale. **It was measured and it is false through this
build path.** libvips (via `sharp`) premultiplies alpha when resizing, and
browsers store canvas textures premultiplied, so leftover background colour in
the transparent channel never reaches the screen. Downscaling a car sprite to
30 px yields edge pixels *darker* than the body, not lighter.

The checks are retained at P2 because the residue is still a sign of a careless
background-removal pass, and it would bite immediately if anyone resampled
these masters with a naive non-premultiplied filter. It is not a reason to
regenerate anything.

## 5. Known-open issues

Fixed in this pass: the green icon lane (41 assets re-hued), the flags, the
letterboxed backdrops, the photoreal lanes' palettisation, the inconsistent
sprite scales, and the missing type system.

Still open, because none of it can be fixed by editing pixels:

| Issue | Where | Needs |
| --- | --- | --- |
| **Car likeness** | all 8 `cars/*-studio` | regeneration — see `CAR_LIKENESS.md` |
| **Top-downs are cel-shaded** while the studio renders are photoreal, against a negative prompt that bans `anime` | `cars/*-topdown`, `*-damaged` | regeneration through the Kontext lane from approved studio renders |
| **Garbled text on the menu backdrop** — nine monitors of AI pseudo-text, behind the title | `cinematic/intro-pitwall.png` | regeneration, text-free |
| **11 tiles do not tile** | `tracks/tiles/` | regeneration with a seamless workflow, or an offline seam-blend pass |
| **Trim varies 7.7% across the car family** | `cars/` | the renderer compensates via `spriteMetrics.ts`; a re-cut would remove the need |
| Matte residue on one prop | `tracks/props/speedway-3.png` | advisory only — see the note above |

The icons were re-hued rather than redrawn. That fixes the palette, and it
does not fix draughtsmanship: `icon-part-power-{1,2,3}` are still three
detailed engine drawings that differ only in interior linework, which is not a
difference you can see at 24px. A redraw as flat geometric glyphs is the right
answer and is not done.

## 6. Adding an asset

1. Generate against the prompt template in `ART_PRODUCTION_PLAN.md` §4–5.
2. `node scripts/art/qaAssets.mjs --filter <your-asset>` until it is clean.
3. If it needs a semantic hue exception, add it to `HUE_EXEMPT` with a comment.
4. Log seed and prompt in `docs/art-manifest.csv`.
5. Commit the master to `public/assets/`. The build downsizes and re-encodes it
   per lane (`scripts/optimizeAssets.mjs`) — never hand-optimise a master.
