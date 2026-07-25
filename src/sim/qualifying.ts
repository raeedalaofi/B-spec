// Qualifying: a one-lap shootout that decides the grid.
//
// Without it the grid is entry order, which means the player starts last in
// every race regardless of what they are driving. That is not a difficulty
// setting so much as a tax — it makes a slow car hopeless and a fast car
// tedious, and it gives the player nothing to earn before the lights go out.
//
// The lap is computed rather than simulated: each car's ideal lap time from
// the quasi-static profile, scaled by the driver, with noise scaled by their
// consistency. Deterministic from the seed like everything else in src/sim/.

import { BAL } from '../data/balance';
import { rngGaussian } from './rng';
import { buildSpeedProfile } from './speedProfile';
import type { RaceEntry, Track } from './types';

export interface QualifyingRow {
  carId: string;
  driverName: string;
  /** the lap that set the grid slot */
  lapS: number;
  /** gap to pole, seconds */
  gapS: number;
  isPlayer: boolean;
}

export interface QualifyingResult {
  /** entries reordered into grid order — pole first */
  grid: RaceEntry[];
  rows: QualifyingRow[];
  /** the player's grid slot, 1-based */
  playerSlot: number;
}

export function qualify(track: Track, entries: RaceEntry[], seed: number): QualifyingResult {
  const rng = { rngState: seed | 0 };
  const laps = entries.map((entry) => {
    const { idealLapS } = buildSpeedProfile(track, entry.spec);
    // the same driver-skill model the race uses, so qualifying pace and race
    // pace cannot disagree about who is quick
    const fDriver = BAL.driverSkillBase + BAL.driverSkillPer * entry.stats.pace;
    // a scrappy driver is more likely to bin the lap than a metronome
    const sigma =
      BAL.qualiSigmaBase + BAL.qualiSigmaConsistency * (1 - entry.stats.consistency / 100);
    const noise = 1 + rngGaussian(rng) * sigma;
    return { entry, lapS: (idealLapS / fDriver) * noise };
  });

  laps.sort((a, b) => a.lapS - b.lapS);
  const pole = laps[0].lapS;
  return {
    grid: laps.map((l) => l.entry),
    rows: laps.map((l) => ({
      carId: l.entry.carId,
      driverName: l.entry.driverName,
      lapS: l.lapS,
      gapS: l.lapS - pole,
      isPlayer: l.entry.isPlayer,
    })),
    playerSlot: laps.findIndex((l) => l.entry.isPlayer) + 1,
  };
}
