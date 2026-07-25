# Publishing B-Spec on itch.io

Everything needed to create the project page, checked against itch.io's
[content creator quality guidelines](https://itch.io/docs/creators/quality-guidelines).

Run `npm run store` to regenerate the cover, the screenshots and the upload
zip. Everything lands in `store/` (git-ignored — it is all derived).

---

## 1. Upload

| | |
|---|---|
| File | `store/bspec-html5.zip` (~12 MB, 251 files) |
| Kind of project | **HTML** |
| “This file will be played in the browser” | **✓ tick this** |
| Embed size | **1280 × 720** |
| Fullscreen button | ✓ |
| Mobile friendly | ✓ (orientation: **Landscape**) |

`index.html` is at the root of the zip, and the build uses relative asset
paths, so it works from the arbitrary nested path itch.io serves games from.

**Verified before release** — the built zip was served from a nested path
inside a 1280×720 iframe, matching how itch.io hosts it:

- no console errors, no failed requests
- `localStorage` works in-frame, so careers and mid-race saves persist
- keyboard shortcuts work once the player clicks into the frame (normal for
  any embedded game — the page has to have focus)

---

## 2. Metadata

Guideline: *“Only select platforms your project directly runs on.”* This is
the most commonly broken rule on itch.io and the easiest to get delisted for.

**Platforms: leave Windows, macOS, Linux, Android and iOS unticked.** There
is no executable for any of them. It is a browser game, and the HTML upload
flag above is the only platform signal it should carry.

| Field | Value |
|---|---|
| Title | `B-Spec — Race Director` |
| Short description | `You don't drive. You decide. A racing-management sim: read the race from the pit wall, call the strategy, and take your driver through a career.` |
| Classification | Game |
| Kind of project | HTML |
| Release status | Released |
| Pricing | *(your call — see §7)* |
| Genre | **Racing** *(one only; management/simulation go in tags)* |
| Tags | `management`, `simulation`, `strategy`, `motorsport`, `top-down`, `singleplayer-campaign`, `no-install` |
| Average session | A few minutes *(a sprint is ~5 min; endurance events run longer)* |
| Languages | **English only** |
| Inputs | Mouse, Keyboard, Touchscreen |
| Accessibility | Configurable controls: no · **Colorblind friendly: yes** · Subtitles: n/a |
| Multiplayer | none (single player) |
| Adult content | **No** |

Notes on the choices:

- **Tags.** Guideline: prefer suggested tags, avoid synonyms, avoid tags that
  duplicate a metadata field. So no `singleplayer` tag (that is the
  Multiplayer field), no `html5` tag (that is the upload kind), no `racing`
  tag (that is the Genre), and no `b-spec` or `bspec` tag (guideline:
  *“avoid using tags for things like your name or your project's name”*).
- **Colorblind friendly** is a genuine claim, not a box ticked for reach:
  tire compounds carry a letter as well as a colour, cars carry their
  position, and every status is a word rather than a hue.
- **Languages: English only.** Guideline: *“Do not choose every language if
  your game has no language.”* The game is full of English prose.

---

## 3. AI disclosure — required, and strictly enforced

Fill in the **AI Disclosure** section on the project's edit page. itch.io
states it is *“strictly enforcing disclosure”* and that failure to tag can
result in delisting.

Declare that the project **does contain generative AI content**, and tick
every category that applies. For this project that is:

| Category | Declare | What, exactly |
|---|---|---|
| **Graphics** | **Yes** | All 237 images — car sprites, driver portraits, UI icons, track tiles, scenery props, backdrops, the logo — were generated with **Scenario** (a generative image model). The pipeline is in `scripts/art/`. |
| **Code** | **Yes** | The game code was written with **Claude** (Anthropic), an LLM. |
| **Text** | **Yes** | Driver names, circuit and event names, and the in-game prose were written with the same assistance. |
| **Sound** | **No** | All audio is synthesised at runtime with WebAudio oscillators and filtered noise — DSP, not a model, and no training data. itch.io's guidance is explicit that *“projects using self-contained algorithms without external large datasets don't require the use of generative AI tags”*. |

Two things worth saying plainly:

- **Do not skip this to avoid the AI-Assisted browse page.** Being delisted
  entirely is a far worse outcome than appearing there, and the rights
  position around generated art is exactly why they enforce it.
- **Check Scenario's licence terms for commercial use** before charging for
  the game. That is between you and Scenario; itch.io's disclosure rule does
  not settle it.

There is also a guideline against *“excessive amounts of automatically
generated content”*. This project is not that — the art is generated, but the
simulation, the balance and the design are authored, and it is one curated
game rather than mass-produced pages. Saying so in the description (§4)
costs nothing and answers the question before it is asked.

---

## 4. Page description

Paste this into the description editor.

> **You don't drive. You decide.**
>
> B-Spec is a racing-management game played from the pit wall. Your driver
> has their own hands on the wheel — what they don't have is a plan. That's
> your job.
>
> **Read the race.** A timing tower, live tire and fuel life, and a dossier on
> the driver ahead and the driver behind. Every rival has a reputation: a wall
> who will never hand you the place, a lunger who will throw it away if you
> hold your line and wait.
>
> **Call it.** Six standing orders, and every one of them costs something.
> Attack commits your driver to moves they'd otherwise wave off — and finishes
> the tires. Saving fuel makes a pit stop disappear and hands over the place
> you were defending. There is no setting that is simply "better".
>
> **Answer the radio.** Your driver reports and asks for a call, with a few
> seconds on the clock. Say nothing and they'll decide for themselves.
> Sometimes that's fine.
>
> **Commit before the lights.** Soft tires are quicker from lap one and gone
> before the flag. A light fuel load is worth real lap time and buys you a
> trip down the pit lane. Choose, then live with it.
>
> ---
>
> **What's in it**
>
> - A career from a compact hatchback to a prototype: three championships,
>   19 circuits (plus reverse layouts), 8 cars, 5 Director Licences and over
>   200 events
> - Racing simulated properly — dirty air, slipstream, side-by-side moves
>   decided by the ground the cars actually take off each other, contact,
>   damage, and full-course cautions that reshuffle a race
> - A driver who develops across the career, and rivals who develop their
>   cars right alongside you
> - A broadcast camera that follows the fight, and a highlight reel of how the
>   race actually went
> - Runs in the browser. No install, no account, no ads. Your career saves
>   locally, and a race you close mid-way is waiting when you come back.
>
> ---
>
> **Controls** — click into the game first, then `1`–`6` orders · `P` pit ·
> `Space` pause · `V` whole-circuit view · `S` speed · `←`/`→` answer the radio
>
> ---
>
> **A note on how this was made.** All of the artwork is AI-generated
> (Scenario), and the code and text were written with AI assistance (Claude).
> The simulation, the balance and the design are hand-built and hand-tuned —
> the racing model is measured against tests that fail the build if the field
> stops overtaking or the difficulty curve stops being a curve. Full detail is
> in the AI disclosure above.

---

## 5. Cover and screenshots

In `store/`, regenerated by `npm run store`:

| File | Use |
|---|---|
| `cover-630x500.png` | Cover image — **required**, this is what browsers see first |
| `banner-1600x500.png` | Optional page banner |
| `screenshot-1-title.png` | Title screen |
| `screenshot-2-race.png` | The race — camera on the pack, tower, rival dossier, orders |
| `screenshot-3-results.png` | Result and the highlight reel |
| `screenshot-4-strategy.png` | Pre-race strategy — compound, fuel, opening order |
| `screenshot-5-championship.png` | Championship, standings and title rival |
| `screenshot-6-dealership.png` | Dealership |
| `screenshot-7-wide.png` | Whole-circuit view |

Suggested order on the page: **2, 3, 4, 5, 7, 6, 1** — lead with the racing
and the result, not with a menu.

The cover is a static PNG, so the guideline about seizure-inducing animated
covers does not apply.

---

## 6. Guideline checklist

| Guideline | Status |
|---|---|
| Don't publish before it's ready | ✓ 90 tests, playthrough verified in-frame |
| Accurate metadata | ✓ §2 |
| Only platforms it runs on | ✓ **HTML only — no desktop platforms** |
| Relevant tags, prefer suggested | ✓ §2, no name/synonym/duplicate tags |
| Don't re-create the page for a boost | ✓ one page |
| Adult content labelled | ✓ none — no violence, no adult themes |
| Cover image | ✓ `cover-630x500.png` |
| Screenshots | ✓ seven |
| Don't select every language | ✓ English only |
| No unrelated tags to promote | ✓ |
| No misleading content | ✓ description matches what ships |
| No impersonation | ✓ **see below** |
| No paid contests / gambling / pyramid schemes | ✓ none |
| No reskins / many pages for minor changes | ✓ |
| No excessive auto-generated content | ✓ §3 |
| **Accurately tag generative AI** | **✓ §3 — the critical one** |
| Not just keys or links to another store | ✓ the game itself is uploaded |
| Upload files directly to itch.io | ✓ the zip, not a link to GitHub Pages |
| No obtrusive ads or third-party logins | ✓ none, no network calls at all |
| No shock content, flashing, loud noises | ✓ see below |

**Impersonation.** The game's own copy used to describe it as a revival of a
specific Sony/Polyphony Digital product. That has been removed from the
title screen, the page metadata and the README, and this listing describes
the genre instead. Naming another company's game as the thing yours revives
is exactly the kind of "confusingly similar" association the guideline is
about, and on a storefront it is a trademark question as well as a policy
one. The pitch is stronger without it. All cars, circuits and drivers in the
game are fictional and original.

**Flashing.** Two elements pulse — the caution flag and an active order —
both at about 1 Hz, well under the 3 Hz WCAG threshold. `prefers-reduced-motion`
is honoured, which disables them entirely.

---

## 7. Pricing

Not a compliance matter, but the guidelines are strict about sales:

- **Don't leave it permanently on sale.** A sale is meant to be an event.
  Perpetual discounts misrepresent the price and are illegal in a number of
  countries.
- **Don't raise the base price then "discount" back to it.** Same reason.
- **Don't run sales constantly.** Each one is worth less.

For a first browser release, "Free" or "Free, with a donation option" avoids
all of this and gets far more plays. If you do charge, be aware the AI
disclosure in §3 sits on a paid page, which is where the rights question
around generated art actually matters.

---

## 8. After publishing

- Announce it in **Release announcements**, which is the board for it.
  Posting it in other boards or in other projects' comments is spam under the
  guidelines and will cost you posting privileges.
- Don't submit it to unrelated game jams for exposure — same rule, harsher
  penalty.
- The page can be Draft or Restricted while you check it over; neither is
  indexed, so nothing is spent. Publishing to Public puts it on **Most
  Recent** exactly once, and it can never go back to the top of that list.
  Look at it as a stranger would before you flip it.
