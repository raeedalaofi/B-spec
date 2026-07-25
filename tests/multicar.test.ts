import { describe, expect, it } from 'vitest';
import { AI_DRIVERS } from '../src/data/aidrivers';
import { BAL } from '../src/data/balance';
import { CARS } from '../src/data/cars';
import { TRACK_DEFS } from '../src/data/tracks';
import { buildResult, createRace, tick } from '../src/sim/engine';
import { compileTrack } from '../src/sim/trackCompiler';
import type { Command, RaceEntry, RaceEvent, RaceState } from '../src/sim/types';

const GREENPARK = compileTrack(TRACK_DEFS.greenpark);

function field(playerCar = 'vulpe', aiCar = 'vulpe', playerPace: 1 | 2 | 3 | 4 | 5 = 3): RaceEntry[] {
  const entries: RaceEntry[] = AI_DRIVERS.slice(0, 7).map((drv) => ({
    carId: `ai-${drv.id}`,
    spec: CARS[aiCar],
    driverName: drv.name,
    stats: drv.stats,
    isPlayer: false,
  }));
  entries.splice(4, 0, {
    carId: 'player',
    spec: CARS[playerCar],
    driverName: 'YOU',
    stats: { pace: 50, consistency: 50, battle: 50, smoothness: 50, stamina: 50, aggression: 50 },
    isPlayer: true,
    paceCmd: playerPace,
  });
  return entries;
}

function run(
  state: RaceState,
  commandsAt: Record<number, Command[]> = {},
  perTick?: (s: RaceState) => void,
): RaceEvent[] {
  const events: RaceEvent[] = [];
  let guard = 0;
  while (state.phase !== 'finished' && guard++ < 200000) {
    events.push(...tick(state, commandsAt[state.tickCount] ?? []));
    perTick?.(state);
  }
  expect(state.phase).toBe('finished');
  return events;
}

describe('multi-car races', () => {
  it('is deterministic with 8 cars and mid-race commands', () => {
    const cmds: Record<number, Command[]> = {
      400: [{ type: 'SET_PACE', carId: 'player', level: 5 }],
      900: [{ type: 'OVERTAKE_MODE', carId: 'player', on: true }],
      2500: [{ type: 'PIT', carId: 'player', tires: true, refuel: true }],
    };
    const mk = (): RaceState =>
      createRace({ track: GREENPARK, lapsTotal: 5, seed: 777, entries: field() });
    const a = mk();
    const b = mk();
    run(a, cmds);
    run(b, cmds);
    expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
  });

  it('never lets cars ghost through each other', () => {
    const state = createRace({ track: GREENPARK, lapsTotal: 5, seed: 31337, entries: field() });
    const L = GREENPARK.lengthM;
    run(state, {}, (s) => {
      const racing = s.cars.filter((c) => !c.finished && !c.pit);
      const byS = [...racing].sort((x, y) => x.s - y.s);
      for (let i = 0; i < byS.length; i++) {
        const follower = byS[i];
        const leader = byS[(i + 1) % byS.length];
        if (leader === follower) continue;
        const gapM = (leader.s - follower.s + L) % L;
        if (gapM > L / 2) continue;
        if (follower.battle?.phase === 'PASSING') continue;
        // spun or crawling leaders are legitimately driven around
        if (Math.max(leader.speed, 1) < BAL.slowLeaderFrac * Math.max(follower.speed, 1)) continue;
        expect(gapM).toBeGreaterThanOrEqual(BAL.minGapM - 0.6);
      }
    });
  });

  it('produces a sane number of overtakes across seeds', () => {
    let total = 0;
    const perRace: number[] = [];
    for (let seed = 1; seed <= 8; seed++) {
      const state = createRace({
        track: GREENPARK,
        lapsTotal: 5,
        seed: seed * 104729,
        entries: field(),
      });
      const events = run(state);
      const n = events.filter((e) => e.type === 'OVERTAKE').length;
      perRace.push(n);
      total += n;
    }
    const avg = total / perRace.length;
    expect(avg).toBeGreaterThan(2);
    expect(avg).toBeLessThan(20);
  });

  it('a clearly faster car carves through the field', () => {
    let top2 = 0;
    const N = 10;
    for (let seed = 1; seed <= N; seed++) {
      // player in a class-B car vs class-C AI, starting last
      const entries = field('falcon', 'kestrel', 4);
      const player = entries.splice(4, 1)[0];
      entries.push(player);
      const state = createRace({ track: GREENPARK, lapsTotal: 5, seed: seed * 7919, entries });
      run(state);
      const result = buildResult(state);
      const pos = result.rows.find((r) => r.isPlayer)!.position;
      if (pos <= 2) top2++;
    }
    expect(top2 / N).toBeGreaterThanOrEqual(0.8);
  });

  it('AI cars pit when tires wear out and rejoin with fresh tires', () => {
    const wornTrack = compileTrack({ ...TRACK_DEFS.greenpark, tireWearBase: 0.13 });
    const state = createRace({ track: wornTrack, lapsTotal: 12, seed: 5, entries: field() });
    const events = run(state);
    const pits = events.filter((e) => e.type === 'PIT_IN');
    expect(pits.length).toBeGreaterThan(3);
    const outs = events.filter((e) => e.type === 'PIT_OUT');
    expect(outs.length).toBeGreaterThan(0);
  });

  it('the race ends when the player finishes and everyone is classified', () => {
    const state = createRace({ track: GREENPARK, lapsTotal: 3, seed: 9, entries: field() });
    const events = run(state);
    const finishes = events.filter((e) => e.type === 'FINISH');
    expect(finishes.length).toBe(8);
    const result = buildResult(state);
    expect(result.rows.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // every classified-on-lead-lap car has a plausible gap
    for (const row of result.rows) {
      if (row.gapS !== null) expect(row.gapS).toBeGreaterThanOrEqual(0);
    }
  });

  it('overtake events carry consistent data', () => {
    const state = createRace({ track: GREENPARK, lapsTotal: 5, seed: 12, entries: field() });
    const events = run(state);
    for (const e of events) {
      if (e.type === 'OVERTAKE') {
        expect(e.carId).not.toBe(e.passedId);
        expect(e.forPosition).toBeGreaterThanOrEqual(1);
        expect(e.forPosition).toBeLessThanOrEqual(8);
      }
    }
  });
});
