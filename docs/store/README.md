# Store art

The images for the itch.io page, committed so they can be downloaded from
anywhere — including a phone — rather than only existing in a build folder.

| File | Use |
|---|---|
| `cover-630x500.png` | **Cover image.** Exactly the 630×500 itch.io asks for. |
| `banner-1600x500.png` | Optional page banner. |
| `screenshot-2-race.png` | The race — camera on the pack, timing tower, rival dossier, orders |
| `screenshot-3-results.png` | Result and the highlight reel |
| `screenshot-4-strategy.png` | Pre-race strategy — compound, fuel, opening order |
| `screenshot-5-championship.png` | Championship, standings and title rival |
| `screenshot-7-wide.png` | Whole-circuit view |
| `screenshot-6-dealership.png` | Dealership |
| `screenshot-1-title.png` | Title screen |

Upload the screenshots in the order listed — lead with the racing and the
result, not with a menu.

These are re-encoded from `store/`, which `npm run store` regenerates: the
screenshots are capped at 1600px wide and palette-encoded, which takes the
set from 5.9 MB to 2.5 MB with no visible loss at the size a store page
displays them. The cover and banner keep their exact required dimensions.

The game build itself (`bspec-html5.zip`, ~6.6 MB) is *not* committed — it is
a build artefact that changes every time, and `npm run store` produces it.
