// Team radio: the driver reports, and asks the player to decide.
//
// This is the game's moment-to-moment loop. Without it a B-Spec race is
// something you watch — you set an order at the start and the result arrives
// twenty minutes later. A radio call turns each turning point of the race
// into a question with a deadline and two defensible answers, which is the
// difference between a simulation and a game.
//
// Deliberately a UI-layer concern: the simulation stays pure and emits
// nothing but facts. What counts as "worth asking about" is a design
// judgement, and design judgements do not belong in the physics.

import { COMPOUNDS } from '../data/strategy';
import { fuelPerLapFor } from '../sim/tiresFuel';
import type {
  CarRaceState,
  Command,
  DriverOrder,
  RaceState,
  TireCompound,
} from '../sim/types';

export interface RadioOption {
  label: string;
  /** commands issued if the player picks this */
  commands(playerId: string, player: CarRaceState): Command[];
}

export interface RadioPrompt {
  /** stable id so the same call is not raised twice */
  id: string;
  text: string;
  /** seconds the player has to answer before the driver decides */
  timeoutS: number;
  /** which option the driver takes on their own if nobody answers */
  defaultIndex: number;
  options: RadioOption[];
}

const order = (o: DriverOrder): RadioOption['commands'] => (playerId) =>
  [{ type: 'SET_ORDER', carId: playerId, order: o }];

const box =
  (tires: TireCompound | null): RadioOption['commands'] =>
  (playerId, player) =>
    [{ type: 'PIT', carId: playerId, tires, refuel: true, fuelTargetL: player.spec.fuelTankL }];

const nothing: RadioOption['commands'] = () => [];

/** laps of tire life left at the current wear rate */
function tireLapsLeft(player: CarRaceState): number {
  const lapsRun = Math.max(1, player.lap);
  const perLap = player.tireWear / lapsRun;
  return perLap > 1e-4 ? (1 - player.tireWear) / perLap : 99;
}

function fuelLapsLeft(state: RaceState, player: CarRaceState): number {
  return player.fuelL / Math.max(0.01, fuelPerLapFor(state, player));
}

/**
 * Picks the single most pressing thing the driver would say right now, or
 * null if there is nothing worth interrupting for. One call at a time, on
 * purpose: a stream of prompts is noise, and noise gets dismissed unread.
 */
export function nextRadioPrompt(
  state: RaceState,
  player: CarRaceState,
  alreadyAsked: Set<string>,
): RadioPrompt | null {
  if (state.phase !== 'racing' || player.finished || player.pit) return null;
  const lapsLeft = state.lapsTotal - player.lap + 1;
  const lap = player.lap;

  const ask = (p: RadioPrompt): RadioPrompt | null => (alreadyAsked.has(p.id) ? null : p);

  // 1. A caution is the cheapest stop the player will ever get. Ask once.
  if (state.caution && state.caution.phase !== 'ending' && lapsLeft > 2) {
    const p = ask({
      id: `caution-${state.cautionCount}`,
      text: 'Safety car is out — this is the cheapest stop we will get all race. Box now?',
      timeoutS: 8,
      defaultIndex: 1,
      options: [
        { label: 'Box now, fresh tires', commands: box(bestCompoundFor(state, player)) },
        { label: 'Stay out, hold track position', commands: nothing },
      ],
    });
    if (p) return p;
  }

  // 2. Tires about to fall off the cliff with real distance still to run.
  const tLeft = tireLapsLeft(player);
  if (player.tireWear > COMPOUNDS[player.compound].cliffStart - 0.12 && lapsLeft > 2) {
    const p = ask({
      id: `tires-${lap}`,
      text: `These tires are done in about ${Math.max(1, Math.round(tLeft))} lap(s) and there are ${lapsLeft} to go. What do you want?`,
      timeoutS: 10,
      defaultIndex: 0,
      options: [
        { label: 'Box, fit fresh', commands: box(bestCompoundFor(state, player)) },
        { label: 'Nurse them home', commands: order('conserve') },
      ],
    });
    if (p) return p;
  }

  // 3. Fuel will not reach the flag — lift and coast, or take a splash.
  const fLeft = fuelLapsLeft(state, player);
  if (fLeft < lapsLeft - 0.2 && lapsLeft > 1) {
    const p = ask({
      id: `fuel-${lap}`,
      text: `We are ${(lapsLeft - fLeft).toFixed(1)} laps short on fuel. I can save it, or we take a splash.`,
      timeoutS: 10,
      defaultIndex: 0,
      options: [
        { label: 'Save fuel', commands: order('save-fuel') },
        {
          label: 'Splash and dash',
          commands: (playerId, p2) => [
            { type: 'PIT', carId: playerId, tires: null, refuel: true, fuelTargetL: p2.spec.fuelTankL },
          ],
        },
      ],
    });
    if (p) return p;
  }

  // 4. Someone quick is closing in the closing stages.
  const chaser = closingRival(state, player);
  if (chaser && lapsLeft <= Math.max(2, Math.ceil(state.lapsTotal * 0.35))) {
    const p = ask({
      id: `defend-${chaser.carId}-${lap}`,
      text: `${chaser.driverName} is coming and they are quicker than us. Do I fight, or bank the place?`,
      timeoutS: 8,
      defaultIndex: 0,
      options: [
        { label: 'Hold them off', commands: order('hold') },
        { label: 'Do not risk the car', commands: order('let-by') },
      ],
    });
    if (p) return p;
  }

  // 5. A car ahead is in reach late on, but going for it costs the tires.
  const target = catchableRival(state, player);
  if (target && lapsLeft <= Math.max(3, Math.ceil(state.lapsTotal * 0.4)) && player.tireWear < 0.8) {
    const p = ask({
      id: `attack-${target.carId}-${lap}`,
      text: `I can catch ${target.driverName} if I really go for it. It will finish the tires.`,
      timeoutS: 8,
      defaultIndex: 1,
      options: [
        { label: 'Go and get them', commands: order('attack') },
        { label: 'Bring it home', commands: order('push') },
      ],
    });
    if (p) return p;
  }

  // 6. Damage: nurse it, or accept the risk of not finishing.
  if (player.damage > 0.45 && lapsLeft > 1) {
    const p = ask({
      id: `damage-${lap}`,
      text: 'The car is hurt and it does not feel right. Do you want me to back off?',
      timeoutS: 10,
      defaultIndex: 0,
      options: [
        { label: 'Bring it home', commands: order('conserve') },
        { label: 'Press on regardless', commands: order('push') },
      ],
    });
    if (p) return p;
  }

  return null;
}

/** the compound that best covers the remaining distance */
function bestCompoundFor(state: RaceState, player: CarRaceState): TireCompound {
  const lapsLeft = Math.max(1, state.lapsTotal - player.lap + 1);
  const lapsRun = Math.max(1, player.lap);
  const currentPerLap = player.tireWear / lapsRun;
  const basePerLap = currentPerLap / COMPOUNDS[player.compound].wearMult;
  let best: TireCompound = 'medium';
  let bestScore = -Infinity;
  for (const id of ['soft', 'medium', 'hard'] as TireCompound[]) {
    const spec = COMPOUNDS[id];
    const stint = basePerLap > 1e-5 ? 1 / (basePerLap * spec.wearMult) : 99;
    const score = spec.gripMult * 100 - Math.max(0, lapsLeft - stint) * 12;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

/** a genuinely faster car within striking distance behind */
function closingRival(state: RaceState, player: CarRaceState): CarRaceState | null {
  const L = state.track.lengthM;
  for (const car of state.cars) {
    if (car === player || car.finished || car.pit) continue;
    const behindM = (player.s - car.s + L) % L;
    if (behindM > L / 2 || behindM > 90) continue;
    if (car.totalDist > player.totalDist) continue;
    if (car.tireWear < player.tireWear - 0.15) return car;
  }
  return null;
}

/** a car close enough ahead to be worth chasing */
function catchableRival(state: RaceState, player: CarRaceState): CarRaceState | null {
  const L = state.track.lengthM;
  for (const car of state.cars) {
    if (car === player || car.finished || car.pit) continue;
    const aheadM = (car.s - player.s + L) % L;
    if (aheadM > L / 2 || aheadM > 140) continue;
    if (car.totalDist < player.totalDist) continue;
    if (car.tireWear > player.tireWear + 0.1) return car;
  }
  return null;
}
