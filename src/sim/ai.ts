// Opponent decision-making: pace choice, overtake mode and pit calls.
// Deliberately simple and fully deterministic — per-car variety comes from
// thresholds jittered once (seeded) at race creation, not per-tick rolls.

import { fuelPerLapFor } from './tiresFuel';
import type { RaceState } from './types';

/** runs at 1 Hz (every 10th tick); mutates AI cars' commands directly */
export function updateAI(state: RaceState): void {
  if (state.tickCount % 10 !== 0) return;
  for (const car of state.cars) {
    if (car.isPlayer || car.finished || !car.ai) continue;

    // pit call: worn tires or fuel about to run dry, and racing continues
    const fuelPerLap = fuelPerLapFor(state, car);
    const fuelLapsLeft = car.fuelL / Math.max(fuelPerLap, 0.01);
    const lapsRemaining = state.lapsTotal - car.lap + 1;
    if (
      !car.pit &&
      lapsRemaining >= 2 &&
      (car.tireWear > car.ai.wearThreshold || fuelLapsLeft < car.ai.fuelLapsMin)
    ) {
      car.pit = {
        phase: 'requested',
        tires: car.tireWear > 0.4,
        refuel: true,
        totalS: 0,
        timer: 0,
        entryS: 0,
        exitS: 0,
      };
    }

    // pace policy
    if (car.tireWear > 0.75) {
      car.paceCmd = 2; // nurse worn tires home / to the pit
    } else if (car.battle && car.battle.phase !== 'CATCHING') {
      car.paceCmd = 4; // fighting the car ahead
    } else if (car.underAttack) {
      car.paceCmd = 4; // defending
    } else if (car.lap >= state.lapsTotal - 1) {
      car.paceCmd = 4; // late-race push
    } else {
      car.paceCmd = 3;
    }
    car.overtakeMode =
      car.battle !== null &&
      car.battle.phase === 'FOLLOWING' &&
      car.stats.battle >= 45;
  }
}
