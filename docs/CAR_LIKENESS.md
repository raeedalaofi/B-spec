# Car likeness

**Status: studio renders regenerated and accepted. The three other views per
car are still the old art and still carry the original likeness.**

| View | Used by | State |
| --- | --- | --- |
| `{id}-studio` | dealership, garage | **regenerated, accepted** |
| `{id}-side` | tuning screen hero | old art — original likeness |
| `{id}-topdown` | the in-race sprite | old art — original likeness, and cel-shaded |
| `{id}-damaged` | the in-race sprite | old art — original likeness, and cel-shaded |

So the exposure is reduced, not removed: the dealership now shows eight
original cars and the race still shows the old ones. Closing this out means
running the Kontext img2img pass from the accepted studio renders, which is
what §2.1 of `ART_PRODUCTION_PLAN.md` always intended and which also fixes the
photoreal-vs-cel-shaded mismatch in one move.

## What was wrong

Seven of the eight studio renders in `public/assets/cars/` are close likenesses
of identifiable production cars, and one is a near-exact copy of a specific
racing car.

| Asset | Reads as | Visible badge |
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
license these. B-Spec is heading for a public itch.io release and ships
identifiable cars with badges on them.

**Art direction.** Four of the eight cars are the same Nissan Skyline. A roster
that spans Class C to Class A should read as eight distinct machines; instead
half of it is one car in four colours. That undermines the progression fantasy
regardless of the legal question.

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

## To close this out

1. Run the Kontext img2img pass from the eight accepted studio renders to
   produce `-side`, `-topdown` and `-damaged`. Until then the race view still
   shows the old cars.
2. Review those the same way, then `npm run qa:art` and
   `node scripts/art/spriteMetrics.mjs` to re-measure the sprite padding.
