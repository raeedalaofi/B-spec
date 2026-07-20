// Copperline Raceway — a technical rhythm circuit: hairpin off the main
// straight, a winding infield, and a fast return straight. Rewards
// consistency and punishes ragged driving.

import type { TrackDef } from '../../sim/types';

export const COPPERLINE: TrackDef = {
  id: 'copperline',
  name: 'Copperline Raceway',
  controlPoints: [
    [0, 0],
    [250, -5],
    [500, 0],
    [590, 40],
    [620, 130],
    [560, 200],
    [460, 230],
    [400, 310],
    [440, 390],
    [530, 420],
    [570, 500],
    [500, 570],
    [390, 590],
    [280, 540],
    [180, 560],
    [80, 590],
    [-20, 540],
    [-60, 440],
    [-30, 330],
    [10, 220],
    [30, 110],
  ],
  widthM: 11,
  pit: { entryT: 0.95, exitT: 0.04, laneTimeLossS: 19 },
  gripBase: 0.98,
  tireWearBase: 0.042,
  fuelBase: 2.4,
};
