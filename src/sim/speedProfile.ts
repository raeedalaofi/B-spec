// Quasi-static lap simulation: computes a car's ideal speed at every track
// sample (grip-limited corner caps + backward braking pass + forward
// power-limited acceleration pass) and the resulting ideal lap time.

import { BAL } from '../data/balance';
import type { CarSpec, Track } from './types';

export interface SpeedProfile {
  /** ideal speed per track sample (m/s) */
  profile: Float64Array;
  profileMax: number;
  idealLapS: number;
}

export function buildSpeedProfile(track: Track, car: CarSpec): SpeedProfile {
  const n = track.samples.length;
  const ds = track.sampleStepM;
  const gripScale = Math.sqrt(car.grip);
  const aBrake = BAL.aBrakeRef * car.grip * track.def.gripBase;
  const aGripCap = BAL.aAccelGripRef * car.grip * track.def.gripBase;
  const powerW = car.powerKw * 1000;

  // grip-limited caps (vCapBase is for grip 1.0; scale by sqrt(grip))
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    v[i] = Math.min(track.samples[i].vCapBase * gripScale, car.topSpeedMs);
  }

  // Closed loop: run backward+forward passes twice so limits propagate
  // across the start/finish seam.
  for (let pass = 0; pass < 2; pass++) {
    // backward pass — braking
    for (let step = 2 * n - 1; step >= 0; step--) {
      const i = step % n;
      const next = (i + 1) % n;
      const vAllowed = Math.sqrt(v[next] * v[next] + 2 * aBrake * ds);
      if (vAllowed < v[i]) v[i] = vAllowed;
    }
    // forward pass — acceleration (power- and traction-limited, minus drag)
    for (let step = 0; step < 2 * n; step++) {
      const i = step % n;
      const prev = (i - 1 + n) % n;
      const vp = Math.max(v[prev], 5);
      const aPower = powerW / (car.massKg * vp);
      const a = Math.max(0.3, Math.min(aGripCap, aPower) - car.dragCoeff * vp * vp);
      const vAllowed = Math.sqrt(vp * vp + 2 * a * ds);
      if (vAllowed < v[i]) v[i] = vAllowed;
    }
  }

  let lapS = 0;
  let vMax = 0;
  for (let i = 0; i < n; i++) {
    lapS += ds / v[i];
    if (v[i] > vMax) vMax = v[i];
  }
  return { profile: v, profileMax: vMax, idealLapS: lapS };
}

/** interpolated ideal speed at arc position s */
export function profileSpeedAt(track: Track, profile: Float64Array, s: number): number {
  const L = track.lengthM;
  let sw = s % L;
  if (sw < 0) sw += L;
  const f = sw / track.sampleStepM;
  const i = Math.floor(f) % profile.length;
  const u = f - Math.floor(f);
  const a = profile[i];
  const b = profile[(i + 1) % profile.length];
  return a + (b - a) * u;
}
