// Green Park Circuit — a compact club track: long main straight into a
// fast right, esses, a hairpin at the top of the hill, and a flowing
// return leg. The bread-and-butter starter circuit.

import type { TrackDef } from '../../sim/types';

export const GREENPARK: TrackDef = {
  id: 'greenpark',
  name: 'Green Park Circuit',
  controlPoints: [
    [100, 5],
    [350, 2],
    [600, 10],
    [700, 60],
    [745, 165],
    [715, 300],
    [640, 385],
    [555, 365],
    [480, 425],
    [425, 515],
    [385, 605],
    [305, 655],
    [230, 605],
    [173, 463],
    [117, 321],
    [60, 180],
    [30, 90],
    [45, 25],
  ],
  widthM: 12,
  pit: { entryT: 0.94, exitT: 0.04, laneTimeLossS: 20 },
  gripBase: 1.0,
  tireWearBase: 0.035,
  fuelBase: 2.3,
};
