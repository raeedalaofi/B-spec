// Assembles a car's per-tick target speed from its ideal profile and all
// live modifiers: driver skill, pace command, tires, fuel weight, fatigue,
// morale, corner noise and mistake recovery.

import { BAL } from '../data/balance';
import { profileSpeedAt } from './speedProfile';
import type { CarRaceState, RaceState } from './types';

/** tire grip multiplier: gradual loss, then a cliff past tireCliffStart */
export function tireFactor(wear: number): number {
  let f = 1 - BAL.tireGripLoss * Math.pow(Math.min(wear, 1), 1.5);
  if (wear > BAL.tireCliffStart) {
    const over = (wear - BAL.tireCliffStart) / (1 - BAL.tireCliffStart);
    f -= BAL.tireCliffLoss * over * over;
  }
  return f;
}

export function fuelFactor(fuelL: number): number {
  return 1 - BAL.fuelWeightLoss * fuelL * BAL.fuelDensity;
}

export function fatigueFactor(fatigue: number, stamina: number): number {
  return 1 - BAL.fatigueSpeedLoss * fatigue * (1 - stamina / 150);
}

/**
 * Corner weight: 1 where the car is at its slowest (deep in corners),
 * 0 on flat-out straights. Driver skill, pace command, morale and noise
 * scale by this so straight-line speed stays a property of the car.
 */
export function cornerWeight(car: CarRaceState, idealV: number): number {
  const vMax = car.profileMax;
  const w = (vMax - idealV) / (vMax * BAL.cornerWeightWindow);
  return Math.max(0, Math.min(1, w));
}

export function effectivePace(car: CarRaceState): number {
  let level: number = car.paceCmd;
  if (car.overtakeMode && car.battle) {
    level = Math.min(5, level + BAL.overtakeModePaceBoost);
  }
  return level;
}

/**
 * Location-independent sustained pace (m/s average lap speed with all
 * live modifiers except corner noise). Used to compare two cars' genuine
 * pace when resolving overtakes — instantaneous noisy targets would make
 * pass probabilities swing wildly corner to corner.
 */
export function paceIndex(state: RaceState, car: CarRaceState): number {
  const avgV = state.track.lengthM / car.idealLapS;
  const pace = effectivePace(car);
  const fPace = BAL.paceSpeed[pace];
  const fDriver = BAL.driverSkillBase + BAL.driverSkillPer * car.stats.pace;
  const fMorale = 1 + (car.morale - 1) * BAL.moraleEffect;
  return (
    avgV *
    fPace *
    fDriver *
    fMorale *
    tireFactor(car.tireWear) *
    fuelFactor(car.fuelL) *
    fatigueFactor(car.fatigue, car.stats.stamina)
  );
}

/** target speed at the car's current position, before battle clamps */
export function computeVTarget(state: RaceState, car: CarRaceState): number {
  const idealV = profileSpeedAt(state.track, car.profile, car.s);
  const w = cornerWeight(car, idealV);

  const pace = effectivePace(car);
  const fPace = BAL.paceSpeed[pace];
  const fDriver = BAL.driverSkillBase + BAL.driverSkillPer * car.stats.pace;
  const fMorale = 1 + (car.morale - 1) * BAL.moraleEffect;

  // corner-weighted modifiers pull toward 1.0 on straights
  const blend = (f: number): number => 1 + (f - 1) * w;

  let v =
    idealV *
    blend(fDriver) *
    blend(fPace) *
    blend(fMorale) *
    blend(car.noise) *
    tireFactor(car.tireWear) *
    fuelFactor(car.fuelL) *
    fatigueFactor(car.fatigue, car.stats.stamina);

  if (car.mistake) v *= car.mistake.factor;
  if (car.fuelL <= 0) v = Math.min(v, BAL.fuelEmptyCrawl);
  return v;
}
