// Aria GP Circuit — the flagship grand-prix track: a 700 m main straight
// into heavy braking, fast sweepers, a far-loop hairpin and a long return
// run. High speeds, big slipstream battles, real pit strategy.

import type { TrackDef } from '../../sim/types';

export const ARIA: TrackDef = {
  id: 'aria',
  name: 'Aria GP Circuit',
  controlPoints: [
    [0, 0],
    [350, 0],
    [700, 0],
    [800, 50],
    [840, 150],
    [780, 260],
    [690, 300],
    [720, 400],
    [800, 470],
    [830, 570],
    [770, 660],
    [660, 690],
    [550, 650],
    [480, 560],
    [430, 470],
    [300, 440],
    [170, 470],
    [80, 540],
    [-40, 500],
    [-80, 390],
    [-60, 260],
    [-30, 130],
  ],
  widthM: 13,
  pit: { entryT: 0.94, exitT: 0.05, laneTimeLossS: 22 },
  gripBase: 1.02,
  tireWearBase: 0.05,
  fuelBase: 3.0,
};
