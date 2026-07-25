// Race quality metrics. Pure, headless, and shared between the balancing
// harness (scripts/simulate.ts) and the CI guard tests (tests/quality.test.ts)
// so "is the racing any good?" is a measured number, never a vibe.
//
// The metrics exist because the racing model has one failure mode that is
// invisible in a results table: a field can look competitive (small gaps,
// many overtake attempts) while actually being a frozen queue in which
// nobody can pass. trainPct and conversionPct catch exactly that.

import { BAL } from '../data/balance';
import { buildResult, tick } from './engine';
import type { Command, RaceEvent, RaceResult, RaceState } from './types';

export interface RaceMetrics {
  /** % of car-ticks spent glued inside the minimum following gap */
  trainPct: number;
  /** % of car-ticks spent in the largest contiguous queue of 4+ cars */
  bigTrainPct: number;
  /** longest contiguous queue of cars each within the following gap */
  longestTrain: number;
  passes: number;
  failedAttempts: number;
  /** passes / (passes + failed attempts) */
  conversionPct: number;
  /** spread between the fastest and slowest best lap in the field (s) */
  bestLapSpreadS: number;
  /** lead changes over the whole race */
  leadChanges: number;
  /** overtakes completed in the final third of the race */
  lateOvertakes: number;
  mistakes: number;
  raceTimeS: number;
  result: RaceResult;
}

export type CommandPolicy = (state: RaceState) => Command[];

const MAX_TICKS = 3 * 60 * 60 * 10; // 3 hours of sim time, hard stop

/**
 * Runs a race to completion, collecting quality metrics as it goes.
 * `policy` is called every tick and may return player commands.
 */
export function measureRace(
  state: RaceState,
  policy?: CommandPolicy,
  onEvent?: (e: RaceEvent, s: RaceState) => void,
): RaceMetrics {
  const L = state.track.lengthM;
  let ticks = 0;
  let carTicks = 0;
  let clampedTicks = 0;
  let bigTrainCarTicks = 0;
  let longestTrain = 0;
  let passes = 0;
  let failedAttempts = 0;
  let mistakes = 0;
  let leadChanges = 0;
  let lateOvertakes = 0;
  let leaderId: string | null = null;

  while (state.phase !== 'finished' && ticks++ < MAX_TICKS) {
    const cmds = policy ? policy(state) : [];
    for (const e of tick(state, cmds)) {
      onEvent?.(e, state);
      if (e.type === 'OVERTAKE') {
        passes++;
        // "late" = final third, where a healthy race still has movement
        if (state.raceTime > 0 && e.forPosition >= 1) {
          const frac = leadFraction(state);
          if (frac > 2 / 3) lateOvertakes++;
        }
      } else if (e.type === 'OVERTAKE_ATTEMPT_FAILED') {
        failedAttempts++;
      } else if (e.type === 'MISTAKE') {
        mistakes++;
      }
    }
    if (state.phase !== 'racing') continue;

    const racing = state.cars.filter((c) => !c.finished && c.pit === null);
    if (racing.length < 2) continue;
    const byS = [...racing].sort((a, b) => a.s - b.s);

    // pass 1: per-pair gap classification
    const following: boolean[] = [];
    for (let i = 0; i < byS.length; i++) {
      const follower = byS[i];
      const leader = byS[(i + 1) % byS.length];
      const gapM = (leader.s - follower.s + L) % L;
      const gapS = gapM / Math.max(follower.speed, 10);
      carTicks++;
      if (gapS <= BAL.minGapS) clampedTicks++;
      following.push(gapS <= BAL.battleFollowGapS && gapM <= L / 2);
    }

    // pass 2: longest contiguous queue (cars each following the next)
    const run = longestRun(following);
    const trainCars = run > 0 ? run + 1 : 0;
    if (trainCars > longestTrain) longestTrain = trainCars;
    if (trainCars >= 4) bigTrainCarTicks += trainCars;

    const lead = byS.length ? currentLeaderId(state) : null;
    if (lead && leaderId && lead !== leaderId) leadChanges++;
    if (lead) leaderId = lead;
  }

  const result = buildResult(state);
  const bestLaps = state.cars
    .map((c) => c.bestLapS)
    .filter((t): t is number => t !== null);

  return {
    trainPct: pct(clampedTicks, carTicks),
    bigTrainPct: pct(bigTrainCarTicks, carTicks),
    longestTrain,
    passes,
    failedAttempts,
    conversionPct: pct(passes, passes + failedAttempts),
    bestLapSpreadS: bestLaps.length ? Math.max(...bestLaps) - Math.min(...bestLaps) : 0,
    leadChanges,
    lateOvertakes,
    mistakes,
    raceTimeS: state.raceTime,
    result,
  };
}

function pct(a: number, b: number): number {
  return b > 0 ? (100 * a) / b : 0;
}

/** how far through the race the leader is, 0..1 */
function leadFraction(state: RaceState): number {
  let best = 0;
  for (const car of state.cars) {
    const f = (car.lap - 1 + car.s / state.track.lengthM) / state.lapsTotal;
    if (f > best) best = f;
  }
  return Math.max(0, Math.min(1, best));
}

function currentLeaderId(state: RaceState): string | null {
  let best: string | null = null;
  let bestDist = -Infinity;
  for (const car of state.cars) {
    if (car.totalDist > bestDist) {
      bestDist = car.totalDist;
      best = car.carId;
    }
  }
  return best;
}

/** longest run of consecutive `true` values in a circular array */
function longestRun(flags: boolean[]): number {
  const n = flags.length;
  if (n === 0) return 0;
  if (flags.every(Boolean)) return n;
  let best = 0;
  let cur = 0;
  for (let step = 0; step < 2 * n; step++) {
    if (flags[step % n]) {
      cur++;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  }
  return Math.min(best, n);
}

// ---------------------------------------------------------------------------
// Target bands. CI fails when a measured race falls outside these; they encode
// "what good racing looks like" as testable numbers rather than opinion.

export const QUALITY_TARGETS = {
  /** cars glued at the minimum gap — above this the field is a frozen queue */
  maxTrainPct: 12,
  /** overtake attempts that actually stick */
  minConversionPct: 45,
  maxConversionPct: 75,
  /** identical cars should lap within this of each other */
  maxBestLapSpreadS: 2.0,
  /** a healthy race keeps moving to the end */
  minLateOvertakes: 1,
  /** no permanent 5-car freight train */
  maxLongestTrain: 4,
} as const;
