// Opponent decision-making: pace choice, overtake appetite and pit calls.
//
// Rivals are not meant to be optimal — they are meant to be *legible*. A
// driver the player can read ("Rossi always goes early and dies on his tires")
// is worth more than one that plays perfectly, because it turns the race into
// a puzzle with knowable pieces. Personality therefore comes from stats and
// a declared trait, never from per-tick randomness.

import { COMPOUNDS, ORDERS } from '../data/strategy';
import { fuelPerLapFor } from './tiresFuel';
import {
  TIRE_COMPOUNDS,
  type CarRaceState,
  type DriverOrder,
  type RaceState,
  type TireCompound,
} from './types';

/** how far through the race we are, 0..1, for the whole field */
function raceProgress(state: RaceState, car: CarRaceState): number {
  return Math.max(0, Math.min(1, (car.lap - 1 + car.s / state.track.lengthM) / state.lapsTotal));
}

/**
 * The order an AI would give itself. Rivals run the same order system as the
 * player — same trades, same costs — so what the player sees in the timing
 * tower is the truth, and a rival's race can be read rather than guessed at.
 */
function chooseOrder(state: RaceState, car: CarRaceState): DriverOrder {
  const progress = raceProgress(state, car);
  const aggression = car.stats.aggression / 100;
  const lapsLeft = state.lapsTotal - car.lap + 1;
  const lapsRun = Math.max(1, car.lap);
  const wearPerLap = car.tireWear / lapsRun;
  const tireLapsLeft = wearPerLap > 1e-4 ? (1 - car.tireWear) / wearPerLap : 99;

  // tires that will not reach the flag get nursed, unless a stop is coming
  if (car.tireWear > 0.85) return 'conserve';
  if (!car.pit && tireLapsLeft < lapsLeft - 1 && car.tireWear > 0.4) return 'conserve';
  // a hurt car is brought home rather than thrown at the next corner
  if (car.damage > 0.5) return 'conserve';

  // right behind someone, with rubber to spend: this is what attack is for
  const inRange = car.battle !== null && car.battle.phase !== 'CATCHING';
  if (inRange && car.tireWear < 0.6) {
    // "fast starter" goes early and pays later; "closer" waits for the end
    const nowIsTheMoment = aggression > 0.6 ? progress < 0.5 : progress > 0.55;
    if (nowIsTheMoment || progress > 0.85) return 'attack';
    return 'push';
  }
  if (car.underAttack) return 'hold';
  return 'push';
}

/**
 * Which compound to bolt on, given how much race is left. Estimated from the
 * car's own wear rate rather than a lookup, so it stays correct on a
 * high-wear rally event or a gentle oval without any special-casing.
 */
function pickCompound(state: RaceState, car: CarRaceState): TireCompound {
  const lapsLeft = Math.max(1, state.lapsTotal - car.lap + 1);
  const baseWearPerLap =
    state.track.def.tireWearBase *
    car.spec.tireWearMult *
    (1.25 - 0.5 * (car.stats.smoothness / 100));
  let best: TireCompound = 'medium';
  let bestScore = -Infinity;
  for (const id of TIRE_COMPOUNDS) {
    const spec = COMPOUNDS[id];
    const stintLaps = 1 / Math.max(1e-4, baseWearPerLap * spec.wearMult);
    // reward pace, but punish heavily for not reaching the flag
    const shortfall = Math.max(0, lapsLeft - stintLaps);
    const score = spec.gripMult * 100 - shortfall * 12;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

/** runs at 1 Hz (every 10th tick); mutates AI cars' commands directly */
export function updateAI(state: RaceState): void {
  if (state.tickCount % 10 !== 0) return;
  const underCaution = state.caution !== null;

  for (const car of state.cars) {
    if (car.isPlayer || car.finished || !car.ai) continue;

    const fuelPerLap = fuelPerLapFor(state, car);
    const fuelLapsLeft = car.fuelL / Math.max(fuelPerLap, 0.01);
    const lapsRemaining = state.lapsTotal - car.lap + 1;
    const needsService =
      car.tireWear > car.ai.wearThreshold || fuelLapsLeft < car.ai.fuelLapsMin;

    // A caution is a cheap stop, and good crews take it. This is the single
    // biggest reason a caution reshuffles a race rather than just pausing it.
    const opportunistic =
      underCaution && (car.tireWear > 0.45 || fuelLapsLeft < lapsRemaining + 1);

    if (!car.pit && lapsRemaining >= 2 && (needsService || opportunistic)) {
      car.pit = {
        phase: 'requested',
        tires: car.tireWear > 0.35 ? pickCompound(state, car) : null,
        refuel: true,
        totalS: 0,
        timer: 0,
        entryS: 0,
        exitS: 0,
      };
    }

    if (underCaution) {
      car.order = 'hold';
      car.paceCmd = 3;
      car.overtakeMode = false;
      continue;
    }

    const order = chooseOrder(state, car);
    car.order = order;
    car.paceCmd = ORDERS[order].pace;
    // Overtake mode is the driver's own appetite for risk on top of the
    // order: aggressive drivers use it freely, cautious ones only when it
    // actually decides something.
    const closingIn = car.battle !== null && car.battle.phase === 'FOLLOWING';
    const worthIt = car.stats.aggression >= 55 || raceProgress(state, car) > 0.7;
    car.overtakeMode =
      ORDERS[order].overtake || (closingIn && worthIt && car.tireWear < 0.85);
  }
}
