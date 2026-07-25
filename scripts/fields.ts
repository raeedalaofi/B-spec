// Standard race fields shared by the balancing harness and the CI guard
// tests, so both measure the same thing. Keeping these in one place means a
// quality regression shows up identically in `npm test` and in the sweeps.

import { CARS } from '../src/data/cars';
import { AI_BY_ID, AI_DRIVERS } from '../src/data/aidrivers';
import { tunedSpec } from '../src/data/parts';
import { getTrackDef } from '../src/data/tracks';
import { createRace } from '../src/sim/engine';
import { qualify } from '../src/sim/qualifying';
import { compileTrack } from '../src/sim/trackCompiler';
import type {
  Command,
  DriverOrder,
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
  const t = track(trackId);
  const { grid } = qualify(t, evenField(seed % 7, playerPace), seed ^ 0x5f3759df);
  return createRace({ track: t, lapsTotal: laps, seed, entries: grid });
}

export function championshipRace(
  trackId: string,
  laps: number,
  seed: number,
  aiDriverIds: string[],
  aiCarIds: string[],
  playerCarId: string,
  playerStats: DriverStats,
  playerParts: string[] = [],
  aiParts: string[] = [],
): RaceState {
  const entries: RaceEntry[] = aiDriverIds.map((driverId, i) => ({
    carId: `ai-${driverId}`,
    spec: tunedSpec(CARS[aiCarIds[i]], aiParts),
    driverName: AI_BY_ID[driverId].name,
    stats: AI_BY_ID[driverId].stats,
    isPlayer: false,
  }));
  entries.push({
    carId: 'player',
    spec: tunedSpec(CARS[playerCarId], playerParts),
    driverName: 'YOU',
    stats: playerStats,
    isPlayer: true,
    // no explicit pace: the opening order decides it, exactly as it does for
    // a player who never touches the radio
    order: 'push',
  });
  // the grid comes from qualifying, exactly as it does in the game
  const t = track(trackId);
  const { grid } = qualify(t, entries, seed ^ 0x5f3759df);
  return createRace({ track: t, lapsTotal: laps, seed, entries: grid });
}

/**
 * The reference "competent player" policy, used to measure difficulty. It
 * plays the strategy layer the way an engaged player would: attack when a
 * move is on, back off when the tires are gone, and take one stop when the
 * set will not reach the flag.
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
    const lapsRun = Math.max(1, me.lap);
    const wearPerLap = me.tireWear / lapsRun;
    const tireLapsLeft = wearPerLap > 1e-4 ? (1 - me.tireWear) / wearPerLap : 99;

    // stop when the current set genuinely will not last, not on a fixed number
    if (!me.pit && !pitCalled && lapsRemaining > 2 && tireLapsLeft < lapsRemaining - 1) {
      cmds.push({
        type: 'PIT',
        carId: 'player',
        tires: lapsRemaining > 8 ? 'medium' : 'soft',
        refuel: true,
        fuelTargetL: me.spec.fuelTankL,
      });
      pitCalled = true;
    }
    if (me.pit === null && pitCalled && me.tireWear < 0.1) pitCalled = false;

    // Attack only where it pays: right behind someone, with tires to spend.
    // Leaving it on burns the set for nothing, which is the trade the order
    // system is supposed to expose.
    const inRange = me.battle !== null && me.battle.phase !== 'CATCHING';
    const order: DriverOrder =
      me.tireWear > 0.85
        ? 'conserve'
        : inRange && me.tireWear < 0.6
          ? 'attack'
          : me.underAttack
            ? 'hold'
            : 'push';
    if (me.order !== order) cmds.push({ type: 'SET_ORDER', carId: 'player', order });
    return cmds;
  };
}

/**
 * A deliberately naive policy: leave the opening order alone and never touch
 * anything. This is the baseline every other policy is measured against.
 */
export function passivePolicy(): (state: RaceState) => Command[] {
  return () => [];
}

/** flat out from lights to flag, and damn the tires */
export function attackerPolicy(): (state: RaceState) => Command[] {
  let set = false;
  return () => {
    if (set) return [];
    set = true;
    return [{ type: 'SET_ORDER', carId: 'player', order: 'attack' }];
  };
}

/** hoard the tires early, spend everything in the last third */
export function closerPolicy(): (state: RaceState) => Command[] {
  let last: DriverOrder | null = null;
  return (state) => {
    if (state.tickCount % 10 !== 0) return [];
    const me = state.cars.find((c) => c.isPlayer);
    if (!me || me.finished) return [];
    const progress = (me.lap - 1) / Math.max(1, state.lapsTotal);
    const want: DriverOrder = progress < 0.6 ? 'conserve' : me.tireWear < 0.9 ? 'attack' : 'push';
    if (want === last) return [];
    last = want;
    return [{ type: 'SET_ORDER', carId: 'player', order: want }];
  };
}

/** one planned stop at half distance onto fresh softs */
export function oneStopPolicy(): (state: RaceState) => Command[] {
  let stopped = false;
  return (state) => {
    if (state.tickCount % 10 !== 0) return [];
    const me = state.cars.find((c) => c.isPlayer);
    if (!me || me.finished) return [];
    const half = Math.floor(state.lapsTotal / 2);
    if (!stopped && !me.pit && me.lap >= half && state.lapsTotal - me.lap > 1) {
      stopped = true;
      return [
        { type: 'PIT', carId: 'player', tires: 'soft', refuel: true, fuelTargetL: me.spec.fuelTankL },
        { type: 'SET_ORDER', carId: 'player', order: 'attack' },
      ];
    }
    return [];
  };
}

/**
 * Every distinct way of playing a race, for measuring the decision space.
 * The question worth asking is not "is my hand-written policy good" but
 * "does the game reward choosing the right approach, and does the right
 * approach change from race to race". If one entry here always wins, the
 * strategy layer has a dominant strategy and is therefore decoration.
 */
export const POLICIES: Array<{ name: string; make: () => (s: RaceState) => Command[] }> = [
  { name: 'passive', make: passivePolicy },
  { name: 'attack', make: attackerPolicy },
  { name: 'closer', make: closerPolicy },
  { name: 'one-stop', make: oneStopPolicy },
  { name: 'adaptive', make: competentPolicy },
];
