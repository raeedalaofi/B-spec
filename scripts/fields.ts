// Standard race fields shared by the balancing harness and the CI guard
// tests, so both measure the same thing. Keeping these in one place means a
// quality regression shows up identically in `npm test` and in the sweeps.

import { CARS } from '../src/data/cars';
import { AI_BY_ID, AI_DRIVERS } from '../src/data/aidrivers';
import { getTrackDef } from '../src/data/tracks';
import { createRace } from '../src/sim/engine';
import { compileTrack } from '../src/sim/trackCompiler';
import type {
  Command,
  DriverStats,
  RaceEntry,
  RaceState,
  Track,
} from '../src/sim/types';

const trackCache = new Map<string, Track>();

export function track(id: string): Track {
  let t = trackCache.get(id);
  if (!t) {
    t = compileTrack(getTrackDef(id));
    trackCache.set(id, t);
  }
  return t;
}

export const REFERENCE_TRACKS = ['greenpark', 'oval', 'aria', 'kaiserwald'] as const;

export function stats(
  pace: number,
  consistency: number,
  battle: number,
  smoothness: number,
  stamina: number,
  aggression = 50,
): DriverStats {
  return { pace, consistency, battle, smoothness, stamina, aggression };
}

/**
 * The canonical quality-measurement field: eight identical cars, one skill
 * tier, player mid-grid. Identical machinery is the point — any spread in
 * results then comes from the racing model, not from the car list.
 */
export function evenField(seedOffset: number, playerPace: 1 | 2 | 3 | 4 | 5 = 3): RaceEntry[] {
  const rookies = AI_DRIVERS.slice(0, 7);
  const entries: RaceEntry[] = rookies.map((_, i) => {
    const drv = rookies[(i + seedOffset) % rookies.length];
    return {
      carId: `ai-${drv.id}`,
      spec: CARS.vulpe,
      driverName: drv.name,
      stats: drv.stats,
      isPlayer: false,
    };
  });
  entries.splice(4, 0, {
    carId: 'player',
    spec: CARS.vulpe,
    driverName: 'YOU',
    stats: stats(50, 50, 50, 50, 50),
    isPlayer: true,
    paceCmd: playerPace,
  });
  return entries;
}

export function evenRace(
  trackId: string,
  laps: number,
  seed: number,
  playerPace: 1 | 2 | 3 | 4 | 5 = 3,
): RaceState {
  return createRace({
    track: track(trackId),
    lapsTotal: laps,
    seed,
    entries: evenField(seed % 7, playerPace),
  });
}

export function championshipRace(
  trackId: string,
  laps: number,
  seed: number,
  aiDriverIds: string[],
  aiCarIds: string[],
  playerCarId: string,
  playerStats: DriverStats,
): RaceState {
  const entries: RaceEntry[] = aiDriverIds.map((driverId, i) => ({
    carId: `ai-${driverId}`,
    spec: CARS[aiCarIds[i]],
    driverName: AI_BY_ID[driverId].name,
    stats: AI_BY_ID[driverId].stats,
    isPlayer: false,
  }));
  entries.push({
    carId: 'player',
    spec: CARS[playerCarId],
    driverName: 'YOU',
    stats: playerStats,
    isPlayer: true,
    paceCmd: 3,
  });
  return createRace({ track: track(trackId), lapsTotal: laps, seed, entries });
}

/**
 * The reference "competent player" policy, used to measure difficulty. It
 * plays the strategy layer sensibly but not perfectly: attack when in a
 * battle, nurse dead tires, pit once when they are gone.
 *
 * Difficulty numbers are only meaningful relative to a fixed policy, so this
 * function is the yardstick — change it and every measured win rate moves.
 */
export function competentPolicy(): (state: RaceState) => Command[] {
  let pitCalled = false;
  return (state) => {
    if (state.tickCount % 10 !== 0) return [];
    const me = state.cars.find((c) => c.isPlayer);
    if (!me || me.finished) return [];
    const cmds: Command[] = [];
    const lapsRemaining = state.lapsTotal - me.lap + 1;
    if (!pitCalled && !me.pit && me.tireWear > 0.8 && lapsRemaining > 2) {
      cmds.push({ type: 'PIT', carId: 'player', tires: true, refuel: true });
      pitCalled = true;
    }
    if (me.pit === null && pitCalled && me.tireWear < 0.1) pitCalled = false;
    const wantPace: 2 | 4 = me.tireWear > 0.92 ? 2 : 4;
    if (me.paceCmd !== wantPace) {
      cmds.push({ type: 'SET_PACE', carId: 'player', level: wantPace });
    }
    const wantOt = me.battle !== null;
    if (me.overtakeMode !== wantOt) {
      cmds.push({ type: 'OVERTAKE_MODE', carId: 'player', on: wantOt });
    }
    return cmds;
  };
}

/**
 * A deliberately naive policy: park it at the default pace and never touch
 * anything. The gap between this and competentPolicy() is the size of the
 * game's decision space — if they score the same, there is no game.
 */
export function passivePolicy(): (state: RaceState) => Command[] {
  return () => [];
}
