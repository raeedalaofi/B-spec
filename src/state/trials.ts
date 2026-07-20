// Trial evaluation (license tests and driving missions): grades a finished
// trial race into gold/silver/bronze, tracks best medals and license
// completion, and pays first-time/upgrade rewards.

import { CARS } from '../data/cars';
import {
  LICENSES,
  type LicenseDef,
  type LicenseId,
  type Medal,
  type TrialDef,
} from '../data/licenses';
import { getTrackDef } from '../data/tracks';
import { buildSpeedProfile } from '../sim/speedProfile';
import { compileTrack } from '../sim/trackCompiler';
import type { RaceResult, RaceState, TrackDef } from '../sim/types';
import type { GameState } from './gameState';

const MEDAL_RANK: Record<Medal, number> = { gold: 3, silver: 2, bronze: 1 };

export function trialTrackDef(trial: TrialDef): TrackDef {
  const base = getTrackDef(trial.trackId);
  if (!trial.trackMods) return base;
  return {
    ...base,
    gripBase: base.gripBase * (trial.trackMods.gripMult ?? 1),
    tireWearBase: base.tireWearBase * (trial.trackMods.wearMult ?? 1),
  };
}

/** the reference "ideal race time" that time-objective multipliers apply to */
export function trialIdealTimeS(trial: TrialDef): number {
  const track = compileTrack(trialTrackDef(trial));
  const { idealLapS } = buildSpeedProfile(track, CARS[trial.carId]);
  const START_OVERHEAD_S = 6; // standing start + grid offset
  return idealLapS * trial.laps + START_OVERHEAD_S;
}

export interface TrialGrade {
  medal: Medal | null;
  /** human-readable performance line, e.g. "Finished P2" or "4:02.1 (gold 3:58.0)" */
  detail: string;
}

export function evaluateTrial(
  trial: TrialDef,
  result: RaceResult,
  state: RaceState,
): TrialGrade {
  const player = result.rows.find((r) => r.isPlayer)!;
  const obj = trial.objective;
  const fmt = (t: number): string => {
    const m = Math.floor(t / 60);
    return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
  };

  switch (obj.type) {
    case 'position': {
      const p = player.position;
      const medal = p <= obj.gold ? 'gold' : p <= obj.silver ? 'silver' : p <= obj.bronze ? 'bronze' : null;
      return { medal, detail: `Finished P${p}` };
    }
    case 'time': {
      const ideal = trialIdealTimeS(trial);
      const playerCar = state.cars.find((c) => c.isPlayer)!;
      const t = playerCar.finishTime ?? state.raceTime;
      const medal =
        t <= ideal * obj.goldMult
          ? 'gold'
          : t <= ideal * obj.silverMult
            ? 'silver'
            : t <= ideal * obj.bronzeMult
              ? 'bronze'
              : null;
      return { medal, detail: `${fmt(t)} (gold ${fmt(ideal * obj.goldMult)})` };
    }
    case 'duel': {
      if (player.position === 1) return { medal: 'gold', detail: 'Won the duel' };
      const gap = player.gapS ?? Infinity;
      const medal = gap <= obj.silverGapS ? 'silver' : gap <= obj.bronzeGapS ? 'bronze' : null;
      return { medal, detail: `Beaten by ${gap === Infinity ? 'a distance' : gap.toFixed(1) + 's'}` };
    }
    case 'perfect': {
      if (player.position === 1 && player.fastestLap && player.mistakes === 0) {
        return { medal: 'gold', detail: 'Perfection.' };
      }
      if (player.position === 1) return { medal: 'silver', detail: 'Won — but not flawlessly' };
      if (player.position <= 3) return { medal: 'bronze', detail: `Podium, P${player.position}` };
      return { medal: null, detail: `Finished P${player.position}` };
    }
  }
}

/** stores the best medal; returns credits earned (full on first medal,
 *  the difference in reward on an upgrade) */
export function applyTrialMedal(gs: GameState, trial: TrialDef, medal: Medal | null): number {
  if (!medal) return 0;
  const prev = gs.trialMedals[trial.id];
  if (prev && MEDAL_RANK[prev] >= MEDAL_RANK[medal]) return 0;
  const idx = { gold: 0, silver: 1, bronze: 2 } as const;
  const reward = trial.rewardCr[idx[medal]] - (prev ? trial.rewardCr[idx[prev]] : 0);
  gs.trialMedals[trial.id] = medal;
  gs.credits += Math.max(0, reward);
  return Math.max(0, reward);
}

export function hasLicense(gs: GameState, licenseId: LicenseId): boolean {
  return LICENSES.some(
    (l) =>
      l.id === licenseId &&
      trialIdsOf(licenseId).every((id) => gs.trialMedals[id] !== undefined),
  );
}

function trialIdsOf(licenseId: LicenseId): string[] {
  // avoid importing LICENSE_TRIALS circularly heavy — ids follow '<lic>-N'
  return [1, 2, 3, 4].map((n) => `${licenseId}-${n}`);
}

/** a license can be attempted once its prerequisite license is held */
export function licenseAttemptable(gs: GameState, def: LicenseDef): boolean {
  return def.requires === null || hasLicense(gs, def.requires);
}

/** highest license the player holds, or null */
export function highestLicense(gs: GameState): LicenseDef | null {
  let best: LicenseDef | null = null;
  for (const l of LICENSES) {
    if (hasLicense(gs, l.id)) best = l;
  }
  return best;
}
