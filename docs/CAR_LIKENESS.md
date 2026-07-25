# Car likeness

**Status: closed. All four views of all eight cars are regenerated original
designs.**

| View | Used by | State |
| --- | --- | --- |
| `{id}-studio` | dealership, garage | regenerated from a corrected prompt |
| `{id}-side` | tuning screen hero | Kontext img2img from the accepted studio render |
| `{id}-topdown` | the in-race sprite | Kontext, corrected to nose-up, sprite-prepped |
| `{id}-damaged` | the in-race sprite | Kontext from that car's own top-down |

Deriving the three other views from the accepted studio render — rather than
generating each independently — is what makes them the *same* car, and it
retired the photoreal-vs-cel-shaded mismatch at the same time.

## What was wrong

Seven of the eight studio renders **were** close likenesses
of identifiable production cars, and one was a near-exact copy of a specific
racing car. The table below is the record of what was replaced.

| Asset | Read as | Visible badge |
| --- | --- | --- |
| `arrow-studio.png` | Porsche 911 GT1 | — |
| `phantom-studio.png` | Nissan Skyline GT-R (R32/R33) | red "R" grille badge |
| `falcon-studio.png` | Nissan Skyline (R33/R34) saloon | "R" grille badge |
| `kite-studio.png` | Nissan Skyline (R34) | badge on the wing |
| `taro-studio.png` | Nissan Skyline (R33) coupe | — |
| `serval-studio.png` | Mazda MX-5 (NA) | oval nose badge |
| `kestrel-studio.png` | Toyota Starlet / small hatch | — |
| `vulpe-studio.png` | small hatch, less specific | oval nose badge |

There are two separate problems here.

**Legal.** Vehicle manufacturers hold trademarks in their badges and grille
designs, and in many jurisdictions design rights in body shapes. Racing games
license these. B-Spec was heading for a public itch.io release shipping
identifiable cars with badges on them.

**Art direction.** Four of the eight cars were the same Nissan Skyline. A roster
that spans Class C to Class A should read as eight distinct machines; half of it
was one car in four colours. That undermined the progression fantasy regardless
of the legal question.

## Why it happened

Not for the reason you would expect. The original prompts already asked for
clean cars, and the negative prompt already banned badges:

```
prompt:   "... 2000s Japanese turbocharged sports sedan with subtle rear wing,
           deep royal blue #3f74e8 paint, completely debadged with no
           manufacturer emblem and no license plate, ..."
negative: "... brand logo, manufacturer badge, sponsor logos,
           emblem of real brand, ..."
```

The model produced a badged Skyline anyway. Negative prompts do not overcome a
positive description that names an archetype with one famous exemplar — "2000s
Japanese turbocharged sports sedan with a rear wing" *is* the Skyline as far as
the model's latent space is concerned, and asking for it without a badge just
gets a Skyline with a smaller badge.

Two of the prompts made it worse by inheriting the car's in-game name:
`kite` is the "Kite GT-Four" and GT-Four is a Toyota Celica trim designation;
`phantom` is the "Phantom GT500" and GT500 is a real JGTC class.

## The fix

`scripts/art/manifests/regen-cars.json` rewrites all eight prompts on one
principle: **describe form, proportion and detail language — never a category
with a canonical exemplar.**

So instead of "2000s Japanese turbocharged sports sedan with subtle rear wing":

> fictional four-door sports saloon, three-box proportions with a long cabin and
> upright rear screen, slim horizontal headlamps either side of a narrow
> rectangular grille, subtle boot-lid lip spoiler rather than a wing, 17 inch
> ten-spoke alloy wheels

The rewrite also deliberately diversifies the roster by body style so the eight
cars stop converging: hatch, hot hatch, notchback coupe, saloon, roadster, rally
homologation hatch, mid-engine GT, closed prototype.

The shared negative now names the marques directly. That is a backstop, not the
mechanism — the positive description is what does the work.

Painting out the badges was considered and rejected as theatre: it removes the
trademark that is easiest to spot while leaving a recognisable 911 GT1
silhouette untouched, which is the larger part of the exposure.

## What the review rejected

Two rounds, 19 candidates, 152 CU. The review is not a formality — a third of
the first batch failed it:

- `phantom` (both candidates) — the first was a **Porsche 911 GT3 R with the
  crest on the nose**, garbled "PIRELLI" on the tyre sidewalls and text on the
  rear wing. The second lost the Porsche shape but kept the tyre lettering.
  Regenerated with round headlamps and tyre branding added to the negative,
  and "wedge nose with a single narrow full-width lamp strip" replacing the
  cab-forward canopy that was pulling toward the 911.
- `falcon.alt1` — boxy saloon with round quad lamps, back in Skyline/Accord
  territory. Rejected in favour of the base candidate.
- `taro.alt1` — read as an R33 Skyline coupe. Rejected.

Accepted: the base candidate for all seven others, plus the regenerated
phantom. `arrow` came out best of the eight — a genuinely original teardrop
prototype, no badge, no text, not attributable to any real car.

## What the derived pass taught us

Two things worth keeping, because neither was obvious:

**Kontext returns the overhead view nose-down, every time.** The renderer
rotates sprites by PI/2 assuming nose-up. Arguing with the model about which
way is up wastes credits; `rotate: 180` in the manifest is deterministic and
free.

**A photoreal render is a worse 30px sprite than a cel-shaded one, until you
finish it.** Dropped straight into the race view the raw Kontext top-downs read
*worse* than the anime sprites they replaced — paler, lower contrast, and
smaller in frame because the model leaves a lot of air around the car. Soft
studio lighting and a wide frame are precisely what a 30x downscale punishes.

That is not a reason to keep cel shading. It is a reason to prep the asset:
`scripts/art/spritePrep.mjs` trims to the opaque bounding box and lifts
saturation and contrast. After it, the new sprites read as well as the old ones
and are the right cars.

The trim had a second effect worth noting. Sprite padding across the family had
varied 84%–95%, which is why `spriteMetrics.ts` and the renderer's scale
compensation exist at all. Trimmed, the spread is 97.7%–98.2% — the
compensation is now very nearly a no-op, which is the correct end state: it was
there to paper over inconsistent art, and the art is consistent now.
