# B-Spec — Race Director

A browser racing-management game in the spirit of **Gran Turismo 4's B-Spec
mode**. You don't drive — you direct. Watch your AI driver from the pit wall,
issue tactical commands, manage tires and fuel, and build a career from a
compact hatchback to flagship machinery.

## Play

```bash
npm install
npm run dev      # open the printed localhost URL
```

Production build: `npm run build` (output in `dist/`, fully static — host it
anywhere).

## How the game works

**Career loop** — start with 15,000 Cr., buy a Class C car, enter the Sunday
Cup, and earn credits and *B-Spec points* with every race. Prize money buys
faster cars; points level up your driver (their abilities grow on their own —
that's the B-Spec fantasy). Three championships of rising difficulty:
Sunday Cup (C) → Clubman Series (B) → National Championship (A).

**During a race** you command, not steer:

| Command | Keys | Effect |
| --- | --- | --- |
| Pace 1–5 | `1`–`5` | Cruise → Attack. Faster laps cost tires, fuel and mistake risk. |
| Overtake | `O` | Aggressive passing mode — higher pass chance, higher risk. |
| Pit In | `P` | Fresh tires + fuel at the cost of ~30s. |
| Sim speed | `S` | x1 / x2 / x4 — outcomes are identical at any speed. |

Tires degrade gradually, then fall off a cliff past ~85% wear — box before it
or gamble. Slipstream, blocking, fatigue and driver morale are all simulated.
Progress autosaves to your browser after every race and purchase.

## Tech

- Vite + TypeScript, zero runtime dependencies. Canvas 2D for the race view,
  plain DOM for menus.
- The simulation (`src/sim/`) is a pure, deterministic, headless library:
  fixed 10 Hz timestep, seeded RNG carried in `RaceState`, commands applied at
  tick boundaries. Same seed + same commands = the same race, bit for bit, at
  any playback speed.
- Tracks are authored as spline control points and compiled to arc-length
  samples with curvature-derived corner speeds, auto-detected corners and
  overtaking zones (`src/sim/trackCompiler.ts`).
- Cars race on a 1D arc coordinate; a battle state machine resolves catching,
  slipstream, passes and blocking with a hard no-overlap invariant
  (`src/sim/battle.ts`).
- Every tunable constant lives in `src/data/balance.ts`.

## Development

```bash
npm test                              # Vitest: determinism, physics, content
npx tsx scripts/simulate.ts single    # headless single-car lap charts
npx tsx scripts/simulate.ts race      # full 8-car race with event log
npx tsx scripts/simulate.ts batch     # pass-count / winner statistics
npx tsx scripts/simulate.ts career    # balance sweep: win rate per event
```

The headless harness is how the game was balanced: hundreds of seeded races
per (car, driver, event) cell, asserting every championship event lands in a
winnable-but-not-trivial band.
