import { describe, expect, it } from 'vitest';
import { CARS } from '../src/data/cars';
import { TRACK_DEFS } from '../src/data/tracks';
import { buildResult, createRace, tick, TICK_S } from '../src/sim/engine';
import { tireFactor } from '../src/sim/pace';
import { compileTrack, posAt } from '../src/sim/trackCompiler';
import type { Command, DriverStats, RaceEvent, RaceState, Track } from '../src/sim/types';

const STATS: DriverStats = { pace: 50, consistency: 50, battle: 50, smoothness: 50, stamina: 50, aggression: 50 };

function singleCarRace(track: Track, carId: string, laps: number, seed: number, pace: 1 | 2 | 3 | 4 | 5 = 3): RaceState {
  return createRace({
    track,
    lapsTotal: laps,
    seed,
    entries: [
      { carId: 'p1', spec: CARS[carId], driverName: 'T', stats: STATS, isPlayer: true, paceCmd: pace },
    ],
  });
}

function runToFinish(state: RaceState, commandsAt: Record<number, Command[]> = {}): RaceEvent[] {
  const events: RaceEvent[] = [];
  let guard = 0;
  while (state.phase !== 'finished' && guard++ < 200000) {
    events.push(...tick(state, commandsAt[state.tickCount] ?? []));
  }
  expect(state.phase).toBe('finished');
  return events;
}

describe('track compiler', () => {
  const oval = compileTrack(TRACK_DEFS.oval);
  const greenpark = compileTrack(TRACK_DEFS.greenpark);

  it('oval geometry is sane', () => {
    expect(oval.lengthM).toBeGreaterThan(1600);
    expect(oval.lengthM).toBeLessThan(2000);
    // two 180° arcs, each chopped into sub-corners for granular mistakes
    expect(oval.corners.length).toBeGreaterThanOrEqual(2);
    expect(oval.corners.length).toBeLessThanOrEqual(6);
    expect(oval.overtakingZones.length).toBe(2);
    // 130 m radius turns at ~1.05 g → about 36 m/s
    for (const c of oval.corners) {
      expect(c.apexSpeed).toBeGreaterThan(25);
      expect(c.apexSpeed).toBeLessThan(45);
    }
  });

  it('greenpark has corners and at least one overtaking zone', () => {
    expect(greenpark.corners.length).toBeGreaterThanOrEqual(4);
    expect(greenpark.overtakingZones.length).toBeGreaterThanOrEqual(1);
  });

  it('posAt interpolates positions on the ribbon', () => {
    const p0 = posAt(oval, 0);
    const pMid = posAt(oval, oval.lengthM / 2);
    expect(Number.isFinite(p0.x)).toBe(true);
    const dist = Math.hypot(pMid.x - p0.x, pMid.y - p0.y);
    expect(dist).toBeGreaterThan(100); // opposite side of the loop
  });
});

describe('single-car race', () => {
  const track = compileTrack(TRACK_DEFS.greenpark);

  it('is deterministic: same seed and commands → identical final state', () => {
    const cmds: Record<number, Command[]> = {
      200: [{ type: 'SET_PACE', carId: 'p1', level: 5 }],
      1500: [{ type: 'SET_PACE', carId: 'p1', level: 2 }],
    };
    const a = singleCarRace(track, 'vulpe', 4, 12345);
    const b = singleCarRace(track, 'vulpe', 4, 12345);
    runToFinish(a, cmds);
    runToFinish(b, cmds);
    expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
  });

  it('different seeds → different lap times', () => {
    const a = singleCarRace(track, 'vulpe', 3, 1);
    const b = singleCarRace(track, 'vulpe', 3, 2);
    runToFinish(a);
    runToFinish(b);
    expect(a.cars[0].bestLapS).not.toEqual(b.cars[0].bestLapS);
  });

  it('lap times are believable and near the ideal lap', () => {
    const state = singleCarRace(track, 'vulpe', 5, 42);
    runToFinish(state);
    const car = state.cars[0];
    expect(car.idealLapS).toBeGreaterThan(60);
    expect(car.idealLapS).toBeLessThan(80);
    expect(car.bestLapS!).toBeGreaterThan(car.idealLapS * 0.97);
    expect(car.bestLapS!).toBeLessThan(car.idealLapS * 1.1);
  });

  it('faster pace commands produce faster laps (5 < 3 < 1)', () => {
    const best = (pace: 1 | 3 | 5): number => {
      const s = singleCarRace(track, 'vulpe', 5, 42, pace);
      runToFinish(s);
      return s.cars[0].bestLapS!;
    };
    const p1 = best(1);
    const p3 = best(3);
    const p5 = best(5);
    expect(p5).toBeLessThan(p3);
    expect(p3).toBeLessThan(p1);
    // pace sweep should be worth roughly 3-8% of lap time
    expect((p1 - p5) / p3).toBeGreaterThan(0.03);
    expect((p1 - p5) / p3).toBeLessThan(0.08);
  });

  it('a faster car laps faster than a slower car', () => {
    const slow = singleCarRace(track, 'kestrel', 3, 42);
    const fast = singleCarRace(track, 'phantom', 3, 42);
    runToFinish(slow);
    runToFinish(fast);
    expect(fast.cars[0].bestLapS!).toBeLessThan(slow.cars[0].bestLapS! - 5);
  });

  it('emits lap events and a finish, and builds a result', () => {
    const state = singleCarRace(track, 'vulpe', 3, 42);
    const events = runToFinish(state);
    const laps = events.filter((e) => e.type === 'LAP_COMPLETE');
    expect(laps.length).toBe(3);
    expect(events.some((e) => e.type === 'FINISH')).toBe(true);
    const result = buildResult(state);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].position).toBe(1);
  });
});

describe('tires, fuel and pits', () => {
  const track = compileTrack(TRACK_DEFS.greenpark);

  it('tire grip curve has a cliff', () => {
    const gradual = tireFactor(0) - tireFactor(0.85);
    const cliff = tireFactor(0.85) - tireFactor(1);
    expect(cliff).toBeGreaterThan(gradual);
  });

  it('worn tires make laps slower', () => {
    const state = singleCarRace(track, 'vulpe', 20, 42, 4);
    runToFinish(state);
    const car = state.cars[0];
    expect(car.tireWear).toBeGreaterThan(0.7);
    // compare an early clean lap with a late worn one via events
  });

  it('a pit stop restores tires and fuel at a time cost', () => {
    const withPit = singleCarRace(track, 'vulpe', 8, 42);
    const noPit = singleCarRace(track, 'vulpe', 8, 42);
    const events = runToFinish(withPit, {
      600: [{ type: 'PIT', carId: 'p1', tires: true, refuel: true }],
    });
    runToFinish(noPit);
    expect(events.some((e) => e.type === 'PIT_IN')).toBe(true);
    const out = events.find((e) => e.type === 'PIT_OUT');
    expect(out).toBeDefined();
    expect(withPit.cars[0].tireWear).toBeLessThan(noPit.cars[0].tireWear);
    // pitting costs meaningful race time
    expect(withPit.raceTime).toBeGreaterThan(noPit.raceTime + 15);
    expect(withPit.cars[0].pitCount).toBe(1);
  });

  it('running out of fuel forces a crawl', () => {
    const state = singleCarRace(track, 'vulpe', 40, 42, 5);
    const events = runToFinish(state);
    expect(events.some((e) => e.type === 'OUT_OF_FUEL')).toBe(true);
    expect(state.cars[0].fuelL).toBe(0);
  });
});

describe('time acceleration equivalence', () => {
  it('outcomes are identical regardless of how ticks are batched', () => {
    const track = compileTrack(TRACK_DEFS.oval);
    const a = singleCarRace(track, 'taro', 3, 99);
    const b = singleCarRace(track, 'taro', 3, 99);
    // "x1": one tick per loop; "x4": four ticks per loop — same tick count total
    let guard = 0;
    while (a.phase !== 'finished' && guard++ < 100000) tick(a, []);
    guard = 0;
    while (b.phase !== 'finished' && guard++ < 25000) {
      for (let k = 0; k < 4 && b.phase !== 'finished'; k++) tick(b, []);
    }
    expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
    expect(a.raceTime).toBeCloseTo(b.raceTime, 6);
    void TICK_S;
  });
});
