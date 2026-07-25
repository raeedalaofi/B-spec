// Per-corner-entry rolls: lap-time noise and driving mistakes.

import { BAL } from '../data/balance';
import { maybeDeployCaution } from './engine';
import { rngGaussian, rngNext } from './rng';
import type { CarRaceState, RaceEvent, RaceState } from './types';

/** roll the corner-noise multiplier held through the upcoming corner */
export function rollCornerNoise(state: RaceState, car: CarRaceState): number {
  const sigma =
    BAL.noiseSigmaBase + BAL.noiseSigmaConsistency * (1 - car.stats.consistency / 100);
  return 1 + rngGaussian(state) * sigma;
}

/** roll for a mistake at a corner entry; mutates car + pushes events */
export function rollMistake(
  state: RaceState,
  car: CarRaceState,
  cornerIdx: number,
  events: RaceEvent[],
): void {
  if (car.mistake || car.pit) return;
  // a neutralised field is not being driven hard enough to make errors
  if (state.caution) return;
  const corner = state.track.corners[cornerIdx];
  const wheelToWheel = car.battle?.phase === 'COMMITTED' || car.defence === 'cover';

  const p =
    BAL.mistakeBase *
    (1 + BAL.mistakeConsistency * (1 - car.stats.consistency / 100)) *
    BAL.paceRisk[car.paceCmd] *
    (1 + car.tireWear * car.tireWear * BAL.mistakeWear) *
    (1 + car.fatigue * BAL.mistakeFatigue) *
    // a damaged car is harder to place
    (1 + car.damage * BAL.mistakeDamage) *
    (wheelToWheel ? BAL.mistakeOvertakeMult : 1) *
    corner.severity;

  if (rngNext(state) >= p) return;

  const sevRoll = rngNext(state);
  let severity: 'minor' | 'major' | 'spin';
  if (sevRoll < BAL.mistakeMinor.p) {
    severity = 'minor';
    car.mistake = { factor: BAL.mistakeMinor.factor, timer: BAL.mistakeMinor.durS, severity };
  } else if (sevRoll < BAL.mistakeMinor.p + BAL.mistakeMajor.p) {
    severity = 'major';
    car.mistake = { factor: BAL.mistakeMajor.factor, timer: BAL.mistakeMajor.durS, severity };
    car.morale = Math.max(BAL.moraleMin, car.morale + BAL.mistakeMajor.morale);
  } else {
    severity = 'spin';
    car.mistake = { factor: BAL.mistakeSpin.factor, timer: BAL.mistakeSpin.durS, severity };
    car.morale = Math.max(BAL.moraleMin, car.morale + BAL.mistakeSpin.morale);
    car.damage = Math.min(1, car.damage + BAL.spinDamage);
    // a car spinning in front of the field is the classic caution trigger
    car.battle = null;
  }
  car.raceStats.mistakes++;
  events.push({ type: 'MISTAKE', carId: car.carId, severity, cornerName: corner.name });
  if (severity === 'spin') {
    maybeDeployCaution(
      state,
      `${car.driverName} spun at ${corner.name}`,
      BAL.cautionFromContactP,
      events,
    );
  }
}
