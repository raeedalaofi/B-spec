# Car likeness — open issue

**Status: unresolved. Needs regeneration; it cannot be fixed on disk.**

## What is wrong

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

## What has been done in the meantime

Nothing that solves it. Painting out the badges was considered and rejected as
theatre: it removes the trademark that is easiest to spot while leaving a
recognisable 911 GT1 silhouette untouched, which is the larger part of the
exposure. Shipping a de-badged copy of a real car is not materially safer than
shipping a badged one, and it would make the problem look handled when it is
not.

## To close this out

1. Configure Scenario credentials (`scripts/art/scenario.mjs`).
2. Run the batch from `scripts/art/manifests/regen-cars.json`.
3. Generate 8–16 candidates per car, as §5 of `ART_PRODUCTION_PLAN.md` requires.
4. **Likeness review before shortlisting** — for each candidate ask "which real
   car is this?". If the answer comes quickly and confidently, reject it. Pay
   particular attention to `arrow`, which produced the most exact copy.
5. Re-run the top-down (Kontext) pass from the approved renders so
   `{id}-studio` and `{id}-topdown` finally match — see the separate style
   mismatch noted in `ART_BIBLE.md`.
6. `npm run qa:art`, then `node scripts/art/spriteMetrics.mjs` to re-measure.
