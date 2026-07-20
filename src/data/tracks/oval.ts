// Sunrise Speedway — a simple stadium oval. Deliberately the first track:
// its geometry is predictable, which validates the track compiler
// (two straights ~500 m, two 130 m-radius 180° turns, length ~1.8 km).

import type { TrackDef } from '../../sim/types';

export const OVAL: TrackDef = {
  id: 'oval',
  name: 'Sunrise Speedway',
  controlPoints: [
    [-250, 130],
    [-83, 130],
    [83, 130],
    [250, 130],
    [342, 92],
    [380, 0],
    [342, -92],
    [250, -130],
    [83, -130],
    [-83, -130],
    [-250, -130],
    [-342, -92],
    [-380, 0],
    [-342, 92],
  ],
  widthM: 14,
  pit: { entryT: 0.93, exitT: 0.05, laneTimeLossS: 16 },
  gripBase: 1.0,
  tireWearBase: 0.03,
  fuelBase: 1.7,
};
