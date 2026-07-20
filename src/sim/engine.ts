// The public simulation API: createRace() and tick(). Everything else in
// src/sim/ is internal. The engine is deterministic: fixed timestep, seeded
// RNG carried in RaceState, commands applied at tick boundaries.

import { BAL } from '../data/balance';
import { updateBattles } from './battle';
import { rollCornerNoise, rollMistake } from './mistakes';
import { computeVTarget } from './pace';
import { buildSpeedProfile } from './speedProfile';
import {
  accrueConsumption,
  crossed,
  pitDurationS,
  pitEntryS,
  pitExitS,
} from './tiresFuel';
import type {
  CarRaceState,
  Command,
  RaceConfig,
  RaceEvent,
  RaceResult,
  RaceState,
} from './types';

export const TICK_S = BAL.tickS;

export function createRace(cfg: RaceConfig): RaceState {
  const track = cfg.track;
  const cars: CarRaceState[] = cfg.entries.map((entry, i) => {
    const { profile, profileMax, idealLapS } = buildSpeedProfile(track, entry.spec);
    const behind = BAL.gridSpacingM * (i + 1);
    const s = (track.lengthM - behind + track.lengthM) % track.lengthM;
    return {
      carId: entry.carId,
      spec: entry.spec,
      driverName: entry.driverName,
      stats: entry.stats,
      isPlayer: entry.isPlayer,
      profile,
      profileMax,
      idealLapS,
      s,
      lap: 0,
      totalDist: -behind,
      speed: 0,
      lane: 0,
      paceCmd: entry.paceCmd ?? 3,
      overtakeMode: false,
      tireWear: 0,
      fuelL: entry.spec.fuelTankL,
      fatigue: 0,
      morale: 1,
      battle: null,
      mistake: null,
      pit: null,
      pitCount: 0,
      nextCornerIdx: firstCornerAhead(track, s),
      noise: 1,
      noiseUntilS: -1,
      lapStartTime: 0,
      lastLapS: null,
      bestLapS: null,
      finished: false,
      finishPosition: null,
      finishTime: null,
      raceStats: {
        overtakes: 0,
        timesPassed: 0,
        mistakes: 0,
        lapsLed: 0,
        fastestLap: false,
      },
    };
  });

  return {
    tickCount: 0,
    rngState: cfg.seed | 0,
    track,
    lapsTotal: cfg.lapsTotal,
    phase: 'countdown',
    countdown: BAL.countdownS,
    raceTime: 0,
    cars,
    fastestLap: null,
    finishedCount: 0,
  };
}

function firstCornerAhead(track: RaceState['track'], s: number): number {
  const corners = track.corners;
  if (corners.length === 0) return 0;
  for (let i = 0; i < corners.length; i++) {
    if (corners[i].entryS > s) return i;
  }
  return 0; // wraps to the first corner
}

/** cars in race order: finished first (by position), then by distance */
export function raceOrder(state: RaceState): CarRaceState[] {
  return [...state.cars].sort((a, b) => {
    if (a.finished && b.finished) return a.finishPosition! - b.finishPosition!;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.totalDist - a.totalDist;
  });
}

/** current 1-based position of a car */
export function positionOf(state: RaceState, carId: string): number {
  return raceOrder(state).findIndex((c) => c.carId === carId) + 1;
}

export function tick(state: RaceState, commands: Command[]): RaceEvent[] {
  const events: RaceEvent[] = [];
  const dt = TICK_S;

  applyCommands(state, commands);

  if (state.phase === 'countdown') {
    state.countdown -= dt;
    state.tickCount++;
    if (state.countdown <= 0) {
      state.phase = 'racing';
      events.push({ type: 'GREEN_FLAG' });
    }
    return events;
  }
  if (state.phase === 'finished') {
    state.tickCount++;
    return events;
  }

  state.raceTime += dt;

  // 1. per-car target speeds (fixed entry order for RNG determinism)
  const vTargets = new Float64Array(state.cars.length);
  for (let i = 0; i < state.cars.length; i++) {
    const car = state.cars[i];
    if (car.finished) continue;
    if (car.mistake) {
      car.mistake.timer -= dt;
      if (car.mistake.timer <= 0) car.mistake = null;
    }
    vTargets[i] = computeVTarget(state, car);
  }

  // 2. traffic: clamps, slipstream, battles, passes
  updateBattles(state, vTargets, events);

  // 3. integrate motion, corners, laps, pits, consumption
  for (let i = 0; i < state.cars.length; i++) {
    const car = state.cars[i];
    if (car.finished) continue;
    moveCar(state, car, vTargets[i], dt, events);
  }

  state.tickCount++;
  return events;
}

function applyCommands(state: RaceState, commands: Command[]): void {
  for (const cmd of commands) {
    const car = state.cars.find((c) => c.carId === cmd.carId);
    if (!car || car.finished) continue;
    switch (cmd.type) {
      case 'SET_PACE':
        car.paceCmd = cmd.level;
        break;
      case 'OVERTAKE_MODE':
        car.overtakeMode = cmd.on;
        break;
      case 'PIT':
        if (!car.pit) {
          car.pit = {
            phase: 'requested',
            tires: cmd.tires,
            refuel: cmd.refuel,
            totalS: 0,
            timer: 0,
            entryS: 0,
            exitS: 0,
          };
        }
        break;
    }
  }
}

function moveCar(
  state: RaceState,
  car: CarRaceState,
  vTarget: number,
  dt: number,
  events: RaceEvent[],
): void {
  const track = state.track;
  const L = track.lengthM;
  const grip = car.spec.grip * track.def.gripBase;

  // pit lane overrides normal driving: constant crawl from entry to exit
  if (car.pit?.phase === 'in-lane') {
    const pit = car.pit;
    pit.timer -= dt;
    const laneDist = (pit.exitS - pit.entryS + L) % L;
    const pitSpeed = laneDist / pit.totalS;
    car.speed = pitSpeed;
    const ds = pitSpeed * dt;
    advance(state, car, ds, events);
    if (pit.timer <= 0) {
      if (pit.tires) car.tireWear = 0;
      if (pit.refuel) car.fuelL = car.spec.fuelTankL;
      car.pitCount++;
      events.push({ type: 'PIT_OUT', carId: car.carId, stopTimeS: pit.totalS });
      car.pit = null;
    }
    return;
  }

  // accelerate / brake toward target
  if (vTarget > car.speed) {
    const vp = Math.max(car.speed, 5);
    const aPower = (car.spec.powerKw * 1000) / (car.spec.massKg * vp);
    const a =
      Math.min(BAL.aAccelGripRef * grip, aPower) - car.spec.dragCoeff * vp * vp;
    car.speed = Math.min(vTarget, car.speed + Math.max(a, 0.3) * dt);
  } else {
    const aBrake = BAL.aBrakeRef * grip;
    car.speed = Math.max(vTarget, car.speed - aBrake * dt);
  }

  const sBefore = car.s;
  const ds = car.speed * dt;

  // corner entries crossed this tick: roll noise + mistakes
  const corners = track.corners;
  if (corners.length > 0) {
    let guard = 0;
    while (
      guard++ < 4 &&
      crossed(sBefore, ds, corners[car.nextCornerIdx].entryS, L)
    ) {
      const idx = car.nextCornerIdx;
      car.noise = rollCornerNoise(state, car);
      car.noiseUntilS = corners[idx].exitS;
      rollMistake(state, car, idx, events);
      car.nextCornerIdx = (idx + 1) % corners.length;
    }
    if (car.noiseUntilS >= 0 && crossed(sBefore, ds, car.noiseUntilS, L)) {
      car.noise = 1;
      car.noiseUntilS = -1;
    }
  }

  // pit entry commitment
  if (car.pit?.phase === 'requested' && crossed(sBefore, ds, pitEntryS(state), L)) {
    const pit = car.pit;
    pit.entryS = pitEntryS(state);
    pit.exitS = pitExitS(state);
    pit.totalS = pitDurationS(state, car);
    pit.timer = pit.totalS;
    pit.phase = 'in-lane';
    car.battle = null;
    events.push({ type: 'PIT_IN', carId: car.carId });
  }

  advance(state, car, ds, events);
  if (!car.pit) accrueConsumption(state, car, ds, events);
}

/** advance arc position, handle start/finish crossings and lap timing */
function advance(
  state: RaceState,
  car: CarRaceState,
  ds: number,
  events: RaceEvent[],
): void {
  const L = state.track.lengthM;
  const sBefore = car.s;
  car.s += ds;
  car.totalDist += ds;

  if (car.s >= L) {
    car.s -= L;
    const overshoot = car.s;
    const frac = ds > 0 ? 1 - overshoot / ds : 1;
    const crossTime = state.raceTime - TICK_S + TICK_S * frac;
    completeLapCrossing(state, car, crossTime, events);
  } else if (sBefore < 0 && car.s >= 0) {
    // grid cars start at negative totalDist but positive s; not applicable
  }
}

function completeLapCrossing(
  state: RaceState,
  car: CarRaceState,
  crossTime: number,
  events: RaceEvent[],
): void {
  if (car.lap === 0) {
    // crossing the line for the first time starts lap 1
    car.lap = 1;
    car.lapStartTime = crossTime;
    return;
  }

  const lapTimeS = crossTime - car.lapStartTime;
  car.lapStartTime = crossTime;
  car.lastLapS = lapTimeS;
  const isPersonalBest = car.bestLapS === null || lapTimeS < car.bestLapS;
  if (isPersonalBest) car.bestLapS = lapTimeS;
  const isRaceFastest =
    state.fastestLap === null || lapTimeS < state.fastestLap.timeS;
  if (isRaceFastest) state.fastestLap = { carId: car.carId, timeS: lapTimeS };
  events.push({
    type: 'LAP_COMPLETE',
    carId: car.carId,
    lap: car.lap,
    lapTimeS,
    isPersonalBest,
    isRaceFastest,
  });

  if (positionOf(state, car.carId) === 1) car.raceStats.lapsLed++;

  if (car.lap >= state.lapsTotal) {
    car.finished = true;
    car.finishPosition = ++state.finishedCount;
    car.finishTime = crossTime;
    car.speed = 0;
    car.battle = null;
    events.push({ type: 'FINISH', carId: car.carId, position: car.finishPosition });

    const player = state.cars.find((c) => c.isPlayer);
    const allDone = state.cars.every((c) => c.finished);
    if (allDone || (player && player.finished)) {
      classifyRemaining(state, events);
      state.phase = 'finished';
    }
  } else {
    car.lap++;
  }
}

/** when the race ends, classify cars still on track by distance */
function classifyRemaining(state: RaceState, events: RaceEvent[]): void {
  const running = state.cars
    .filter((c) => !c.finished)
    .sort((a, b) => b.totalDist - a.totalDist);
  for (const car of running) {
    car.finished = true;
    car.finishPosition = ++state.finishedCount;
    car.finishTime = null;
    events.push({ type: 'FINISH', carId: car.carId, position: car.finishPosition });
  }
}

export function buildResult(state: RaceState): RaceResult {
  const ordered = raceOrder(state);
  const winner = ordered[0];
  return {
    trackId: state.track.def.id,
    laps: state.lapsTotal,
    rows: ordered.map((car, i) => ({
      carId: car.carId,
      driverName: car.driverName,
      carName: car.spec.name,
      isPlayer: car.isPlayer,
      position: i + 1,
      gapS:
        car.finishTime !== null && winner.finishTime !== null
          ? car.finishTime - winner.finishTime
          : null,
      lapsDown:
        car.finishTime !== null ? 0 : Math.max(0, state.lapsTotal - car.lap),
      bestLapS: car.bestLapS,
      overtakes: car.raceStats.overtakes,
      mistakes: car.raceStats.mistakes,
      fastestLap: state.fastestLap?.carId === car.carId,
    })),
  };
}
