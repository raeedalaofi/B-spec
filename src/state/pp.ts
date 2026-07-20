// Performance Points: a single number capturing a car's real pace with its
// tuning installed. Rather than a hand-made formula, PP is derived from the
// physics itself — the car's ideal lap time on a reference circuit — so
// every part's true effect (power, weight, grip, drag, top speed) is priced
// in automatically. Events can cap entries by PP.

import { GREENPARK } from '../data/tracks/greenpark';
import { buildSpeedProfile } from '../sim/speedProfile';
import { compileTrack } from '../sim/trackCompiler';
import type { CarSpec, Track } from '../sim/types';

let refTrack: Track | null = null;
const cache = new Map<string, number>();

export function ppOf(spec: CarSpec): number {
  const key = `${spec.id}:${spec.powerKw}:${spec.massKg}:${spec.grip}:${spec.dragCoeff.toExponential(3)}:${spec.topSpeedMs.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (!refTrack) refTrack = compileTrack(GREENPARK);
  const { idealLapS } = buildSpeedProfile(refTrack, spec);
  const pp = Math.round(35000 / idealLapS);
  cache.set(key, pp);
  return pp;
}
