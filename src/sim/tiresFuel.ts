// Tire wear, fuel consumption and pit stop mechanics.

import { BAL } from '../data/balance';
import { effectivePace } from './pace';
import type { CarRaceState, RaceEvent, RaceState } from './types';

/** accrue wear/fuel/fatigue for distance ds just travelled */
export function accrueConsumption(
  state: RaceState,
  car: CarRaceState,
  ds: number,
  events: RaceEvent[],
): void {
  const track = state.track;
  const lapFrac = ds / track.lengthM;
  const pace = effectivePace(car);
  const inBattle = car.battle !== null;
  // circulating behind a safety car barely uses the car up — which is exactly
  // why a stop taken under caution is such a bargain
  const cautionWear = state.caution ? BAL.cautionWearFrac : 1;
  const cautionFuel = state.caution ? BAL.cautionFuelFrac : 1;

  const prevWear = car.tireWear;
  const wearPerLap =
    track.def.tireWearBase *
    car.spec.tireWearMult *
    BAL.paceWear[pace] *
    (1.25 - BAL.tireSmoothnessSpread * (car.stats.smoothness / 100)) *
    (inBattle ? BAL.tireBattleWearMult : 1) *
    cautionWear;
  car.tireWear = Math.min(1, car.tireWear + wearPerLap * lapFrac);

  for (const warnAt of BAL.tireWarnAt) {
    if (car.isPlayer && prevWear < warnAt && car.tireWear >= warnAt) {
      events.push({ type: 'TIRE_WARNING', carId: car.carId, wear: car.tireWear });
    }
  }

  const fuelPerLap = track.def.fuelBase * car.spec.fuelMult * BAL.paceFuel[pace] * cautionFuel;
  const prevFuel = car.fuelL;
  car.fuelL = Math.max(0, car.fuelL - fuelPerLap * lapFrac);
  const lapsLeft = car.fuelL / fuelPerLap;
  if (car.isPlayer && prevFuel / fuelPerLap >= 2 && lapsLeft < 2) {
    events.push({ type: 'FUEL_WARNING', carId: car.carId, lapsLeft });
  }
  if (prevFuel > 0 && car.fuelL <= 0) {
    events.push({ type: 'OUT_OF_FUEL', carId: car.carId });
  }

  car.fatigue = Math.min(
    1,
    car.fatigue +
      BAL.fatiguePerLap *
        BAL.paceFatigue[pace] *
        (1.5 - car.stats.stamina / 100) *
        lapFrac,
  );
}

export function fuelPerLapFor(state: RaceState, car: CarRaceState): number {
  return state.track.def.fuelBase * car.spec.fuelMult * BAL.paceFuel[effectivePace(car)];
}

/** arc position of pit entry / exit */
export function pitEntryS(state: RaceState): number {
  return state.track.def.pit.entryT * state.track.lengthM;
}
export function pitExitS(state: RaceState): number {
  return state.track.def.pit.exitT * state.track.lengthM;
}

/** total seconds spent between pit entry and exit for the requested work */
export function pitDurationS(state: RaceState, car: CarRaceState): number {
  const pit = car.pit;
  if (!pit) return 0;
  let stationary = BAL.pitStationaryBaseS;
  if (pit.tires) stationary += BAL.pitTiresS;
  if (pit.refuel) {
    const need = car.spec.fuelTankL - car.fuelL;
    stationary += need * BAL.pitFuelPerLiterS;
  }
  return state.track.def.pit.laneTimeLossS + stationary;
}

/** true if the car crossed arc position `mark` while advancing by ds */
export function crossed(sBefore: number, ds: number, mark: number, trackLen: number): boolean {
  const rel = (mark - sBefore + trackLen * 2) % trackLen;
  return rel <= ds && ds > 0;
}
