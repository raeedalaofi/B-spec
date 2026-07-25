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
  /**
   * % of car-ticks spent glued inside the minimum following gap. Note this
   * is *not* by itself a defect — close racing looks exactly like this. It
   * is reported for context; `stuckPct` is the number that matters.
   */
  trainPct: number;
  /**
   * % of car-ticks spent in a welded stint lasting longer than STUCK_S
   * behind the same car. This is the real failure mode: not "cars are close"
   * but "cars are close, indefinitely, with nothing either driver can do".
   */
  stuckPct: number;
  /** longest single welded stint behind one car, seconds */
  maxStuckS: number;
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
  /**
   * Pace spread across the leading group, as a percentage of the fastest
   * lap. Percentage rather than seconds because nine seconds means something
   * very different on a five-minute lap than a one-minute one, and the
   * leading group rather than the whole field because a backmarker's best
   * lap measures traffic, not the model.
   */
  bestLapSpreadPct: number;
  /** lead changes over the whole race */
  leadChanges: number;
  /** overtakes completed in the final third of the race */
  lateOvertakes: number;
  mistakes: number;
  raceTimeS: number;
  result: RaceResult;
}

export type CommandPolicy = (state: RaceState) => Command[];

/** gap at which two cars count as welded together, seconds */
const WELDED_GAP_S = 0.3;
/** a welded stint longer than this counts as genuinely stuck */
const STUCK_S = 15;

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
  // per-follower: who they are welded behind, and for how long
  const weld = new Map<string, { behind: string; sinceS: number }>();
  let stuckTicks = 0;
  let maxStuckS = 0;

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
    // A bunched-up opening lap is correct racing, not a failure mode; queue
    // metrics only start once the field has had a chance to spread out.
    const settled = state.cars.every((c) => c.lap >= 2 || c.finished);

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
      // fixed threshold on purpose: reading BAL.minGapS here would let the
      // metric be "improved" by loosening the very clamp it measures
      const welded = gapS <= WELDED_GAP_S;
      if (welded) clampedTicks++;
      const prev = weld.get(follower.carId);
      if (welded && prev && prev.behind === leader.carId) {
        prev.sinceS += BAL.tickS;
        if (prev.sinceS > maxStuckS) maxStuckS = prev.sinceS;
        if (prev.sinceS > STUCK_S) stuckTicks++;
      } else if (welded) {
        weld.set(follower.carId, { behind: leader.carId, sinceS: 0 });
      } else {
        weld.delete(follower.carId);
      }
      following.push(gapS <= BAL.battleFollowGapS && gapM <= L / 2);
    }

    // pass 2: longest contiguous queue (cars each following the next)
    if (settled) {
      const run = longestRun(following);
      const trainCars = run > 0 ? run + 1 : 0;
      if (trainCars > longestTrain) longestTrain = trainCars;
      if (trainCars >= 4) bigTrainCarTicks += trainCars;
    }

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
    stuckPct: pct(stuckTicks, carTicks),
    maxStuckS,
    bigTrainPct: pct(bigTrainCarTicks, carTicks),
    longestTrain,
    passes,
    failedAttempts,
    conversionPct: pct(passes, passes + failedAttempts),
    bestLapSpreadS: bestLaps.length ? Math.max(...bestLaps) - Math.min(...bestLaps) : 0,
    bestLapSpreadPct: frontGroupSpreadPct(bestLaps),
    leadChanges,
    lateOvertakes,
    mistakes,
    raceTimeS: state.raceTime,
    result,
  };
}

/**
 * Pace spread inside the leading group: third-fastest best lap versus
 * fastest, as a percentage. Restricted to the front because those cars are
 * the ones that plausibly saw clean air — a backmarker's best lap measures
 * how much traffic it met, which is a fact about the race rather than about
 * whether identical cars are modelled identically.
 */
function frontGroupSpreadPct(laps: number[]): number {
  if (laps.length < 3) return 0;
  const sorted = [...laps].sort((a, b) => a - b);
  return (100 * (sorted[2] - sorted[0])) / sorted[0];
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
  /**
   * Cars sitting nose to tail for more than STUCK_S at a time with no move
   * possible. This — not raw proximity — is what makes a race a parade.
   */
  maxStuckPct: 8,
  /** no car should spend minutes on end welded behind the same gearbox */
  maxStuckS: 100,
  /** time the field spends in a queue of four or more */
  maxBigTrainPct: 15,
  /** overtake attempts that actually stick */
  minConversionPct: 45,
  maxConversionPct: 75,
  /**
   * Identical cars at the front should be lapping within this of each other.
   * Not zero, because driver stats, corner noise and — above all — tire state
   * are real: with compounds in play the leading cars are often on different
   * rubber at different points in its life. A large number here still means
   * the model is handing equal cars unequal pace.
   */
  maxBestLapSpreadPct: 3.2,
  /** a healthy race keeps moving to the end */
  minLateOvertakes: 1,
} as const;
