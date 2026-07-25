// Assembles a car's per-tick target speed from its ideal profile and all
// live modifiers: driver skill, pace command, tires, fuel weight, fatigue,
// morale, corner noise and mistake recovery.

import { BAL } from '../data/balance';
import { COMPOUNDS, ORDERS } from '../data/strategy';
import { profileSpeedAt } from './speedProfile';
import type { CarRaceState, RaceState, TireCompound } from './types';

/**
 * Tire grip: a gradual loss, then a cliff. The compound sets both the peak
 * grip and where the cliff begins — softs are quicker from the first lap and
 * fall away much earlier, which is what turns compound choice into a bet on
 * how long the stint has to be.
 */
export function tireFactor(wear: number, compound: TireCompound = 'medium'): number {
  // compounds arrive from saved games and commands, so an unknown one is a
  // data problem rather than a crash
  const spec = COMPOUNDS[compound] ?? COMPOUNDS.medium;
  let f = spec.gripMult - BAL.tireGripLoss * Math.pow(Math.min(wear, 1), 1.5);
  if (wear > spec.cliffStart) {
    const over = (wear - spec.cliffStart) / (1 - spec.cliffStart);
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

/** a damaged car is simply a slower car */
export function damageFactor(damage: number): number {
  return 1 - BAL.damageSpeedLoss * damage;
}

/**
 * Cost of not being on the racing line. Applied in corners only — off-line
 * tarmac is dirty and the geometry is worse, but a straight is a straight.
 * This is what makes an overtake a genuine trade rather than a free move:
 * the attacker gives up corner speed for track position.
 */
export function offLineFactor(car: CarRaceState): number {
  const offLine = Math.min(1, Math.abs(car.lateral));
  const defending = car.defence === 'cover' ? BAL.defendLoss : 0;
  return 1 - BAL.offLineLoss * offLine - defending;
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

/** the standing order this car is driving to */
export function orderSpec(car: CarRaceState) {
  return ORDERS[car.order] ?? ORDERS.push;
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
    tireFactor(car.tireWear, car.compound) *
    fuelFactor(car.fuelL) *
    fatigueFactor(car.fatigue, car.stats.stamina) *
    damageFactor(car.damage)
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
    // aero and line effects are corner-weighted too: dirty air costs grip in
    // the turns, and being off-line only matters where geometry matters
    blend(car.dirtyAir) *
    blend(offLineFactor(car)) *
    tireFactor(car.tireWear, car.compound) *
    fuelFactor(car.fuelL) *
    fatigueFactor(car.fatigue, car.stats.stamina) *
    damageFactor(car.damage);

  if (car.mistake) v *= car.mistake.factor;
  if (car.fuelL <= 0) v = Math.min(v, BAL.fuelEmptyCrawl);
  return v;
}
