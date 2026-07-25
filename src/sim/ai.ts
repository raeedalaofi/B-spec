// Opponent decision-making: pace choice, overtake appetite and pit calls.
//
// Rivals are not meant to be optimal — they are meant to be *legible*. A
// driver the player can read ("Rossi always goes early and dies on his tires")
// is worth more than one that plays perfectly, because it turns the race into
// a puzzle with knowable pieces. Personality therefore comes from stats and
// a declared trait, never from per-tick randomness.

import { fuelPerLapFor } from './tiresFuel';
import type { CarRaceState, PaceLevel, RaceState } from './types';

/** how far through the race we are, 0..1, for the whole field */
function raceProgress(state: RaceState, car: CarRaceState): number {
  return Math.max(0, Math.min(1, (car.lap - 1 + car.s / state.track.lengthM) / state.lapsTotal));
}

/**
 * Base pace an AI wants to run, before situational adjustments. Aggression
 * and stamina shape the whole shift: an aggressive driver burns the car early,
 * a durable one keeps something back.
 */
function basePace(state: RaceState, car: CarRaceState): PaceLevel {
  const progress = raceProgress(state, car);
  const aggression = car.stats.aggression / 100;

  // "fast starter" behaviour falls out of high aggression: push early, pay later
  const earlyPush = aggression > 0.6 && progress < 0.35;
  // "closer" behaviour: conserve, then attack once the tires still have life
  const lateCharge = aggression <= 0.6 && progress > 0.65 && car.tireWear < 0.7;

  if (car.tireWear > 0.88) return 2; // nurse it home or to the pit lane
  if (car.tireWear > 0.72) return 3;
  if (earlyPush || lateCharge) return 4;
  if (progress > 0.9) return 4; // everyone empties the tank at the end
  return 3;
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
        tires: car.tireWear > 0.35,
        refuel: true,
        totalS: 0,
        timer: 0,
        entryS: 0,
        exitS: 0,
      };
    }

    if (underCaution) {
      car.paceCmd = 3;
      car.overtakeMode = false;
      continue;
    }

    let pace = basePace(state, car);
    if (car.battle && car.battle.phase !== 'CATCHING') pace = Math.min(5, pace + 1) as PaceLevel;
    else if (car.underAttack) pace = Math.min(5, pace + 1) as PaceLevel;
    // a damaged car is nursed home rather than thrown at the next corner
    if (car.damage > 0.5) pace = Math.max(2, pace - 1) as PaceLevel;
    car.paceCmd = pace;

    // Overtake mode is the AI's own appetite for risk, not a skill check:
    // aggressive drivers use it liberally, cautious ones only when it counts.
    const closingIn = car.battle !== null && car.battle.phase === 'FOLLOWING';
    const worthIt = car.stats.aggression >= 55 || raceProgress(state, car) > 0.7;
    car.overtakeMode = closingIn && worthIt && car.tireWear < 0.85;
  }
}
