// Tire compounds and driver orders — the two dials the player actually turns.
//
// These live apart from balance.ts because they are not tuning constants so
// much as the shape of the game's decision space. Each row is a genuine
// trade: nothing here is strictly better than anything else, which is the
// whole point. A single "pace 1-5" slider fails this test, because turning it
// up is almost always right.

import type { DriverOrder, TireCompound } from '../sim/types';

export interface CompoundSpec {
  id: TireCompound;
  label: string;
  short: string;
  /** multiplies the car's grip */
  gripMult: number;
  /** multiplies how fast the tire wears out */
  wearMult: number;
  /** where the performance cliff starts, as a wear fraction */
  cliffStart: number;
  desc: string;
}

export const COMPOUNDS: Record<TireCompound, CompoundSpec> = {
  soft: {
    id: 'soft',
    label: 'Soft',
    short: 'S',
    gripMult: 1.028,
    wearMult: 1.65,
    // softs fall away earlier as well as faster — that is what makes a
    // one-stop on softs a gamble rather than a free lap time
    cliffStart: 0.72,
    desc: 'Fastest rubber there is, and it will be gone before the end.',
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    short: 'M',
    gripMult: 1,
    wearMult: 1,
    cliffStart: 0.85,
    desc: 'The compromise. Quick enough, lasts long enough.',
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    short: 'H',
    gripMult: 0.982,
    wearMult: 0.62,
    cliffStart: 0.93,
    desc: 'Slow but relentless. Wins races that others have to stop in.',
  },
};

export interface OrderSpec {
  id: DriverOrder;
  label: string;
  /** underlying pace level the order drives at */
  pace: 1 | 2 | 3 | 4 | 5;
  /** whether the driver uses overtake mode when a move is on */
  overtake: boolean;
  /** multiplies tire wear on top of the pace level */
  wearMult: number;
  /** multiplies fuel use on top of the pace level */
  fuelMult: number;
  /** scales willingness to commit to a passing move */
  commitScale: number;
  /** scales willingness to defend a position rather than concede it */
  defendScale: number;
  desc: string;
}

export const ORDERS: Record<DriverOrder, OrderSpec> = {
  attack: {
    id: 'attack',
    label: 'Attack',
    pace: 5,
    overtake: true,
    wearMult: 1.18,
    fuelMult: 1.06,
    commitScale: 2.4,
    defendScale: 1,
    desc: 'Everything you have. Costs tires, fuel and — often — the car.',
  },
  push: {
    id: 'push',
    label: 'Push',
    pace: 4,
    overtake: false,
    wearMult: 1,
    fuelMult: 1,
    commitScale: 1.2,
    defendScale: 1,
    desc: 'Race pace. Take a move if it is there, do not force one.',
  },
  hold: {
    id: 'hold',
    label: 'Hold Position',
    pace: 3,
    overtake: false,
    wearMult: 0.94,
    fuelMult: 0.97,
    commitScale: 0.45,
    defendScale: 1.7,
    desc: 'Bank the place. Defend hard, take no risks for another one.',
  },
  conserve: {
    id: 'conserve',
    label: 'Save Tires',
    pace: 2,
    overtake: false,
    wearMult: 0.68,
    fuelMult: 0.94,
    commitScale: 0.2,
    defendScale: 0.85,
    desc: 'Nurse the rubber. Slower now so there is something left later.',
  },
  'save-fuel': {
    id: 'save-fuel',
    label: 'Save Fuel',
    pace: 2,
    overtake: false,
    wearMult: 0.86,
    fuelMult: 0.76,
    commitScale: 0.2,
    defendScale: 0.85,
    desc: 'Lift and coast. The way to make a stop disappear.',
  },
  'let-by': {
    id: 'let-by',
    label: 'Let Them By',
    pace: 2,
    overtake: false,
    wearMult: 0.7,
    fuelMult: 0.9,
    commitScale: 0,
    defendScale: 0,
    desc: 'Concede the place rather than lose the race fighting for it.',
  },
};

/** the strategy the player commits to before the lights go out */
export interface RaceStrategy {
  compound: TireCompound;
  /** fraction of the tank to start with, 0.35..1 */
  fuelFrac: number;
  /** the order the driver starts on */
  order: DriverOrder;
}

export const DEFAULT_STRATEGY: RaceStrategy = {
  compound: 'medium',
  fuelFrac: 1,
  order: 'push',
};

/** the minimum fuel load the pre-race screen allows */
export const MIN_FUEL_FRAC = 0.35;
