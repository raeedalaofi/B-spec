// Compiles an authored TrackDef (closed loop of control points) into the
// runtime Track: arc-length samples with curvature-derived corner speed caps,
// plus detected corner zones and overtaking zones.

import { BAL } from '../data/balance';
import type { CornerZone, OvertakeZone, Track, TrackDef, TrackSample } from './types';

interface Pt {
  x: number;
  y: number;
}

/** centripetal Catmull-Rom interpolation (Barry–Goldman) for one segment */
function catmullRom(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const alpha = 0.5;
  const knot = (a: Pt, b: Pt, tPrev: number): number =>
    tPrev + Math.pow(Math.hypot(b.x - a.x, b.y - a.y), alpha);
  const t0 = 0;
  const t1 = knot(p0, p1, t0);
  const t2 = knot(p1, p2, t1);
  const t3 = knot(p2, p3, t2);
  const tt = t1 + (t2 - t1) * t;

  const lerp = (a: Pt, b: Pt, ta: number, tb: number): Pt => {
    const denom = tb - ta;
    if (denom < 1e-9) return a;
    const u = (tt - ta) / denom;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** uniform Catmull-Rom on a scalar (used for elevation profiles) */
function catmullRom1D(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
  );
}

/**
 * Builds the reverse-direction variant of a track: same ribbon, opposite
 * racing direction, pit entry/exit mirrored. Compiles like any other def.
 */
export function reverseTrackDef(def: TrackDef): TrackDef {
  return {
    ...def,
    id: `${def.id}-r`,
    name: `${def.name} II`,
    controlPoints: [...def.controlPoints].reverse(),
    elevations: def.elevations ? [...def.elevations].reverse() : undefined,
    pit: {
      entryT: (1 - def.pit.exitT) % 1,
      exitT: (1 - def.pit.entryT) % 1,
      laneTimeLossS: def.pit.laneTimeLossS,
    },
  };
}

export function compileTrack(def: TrackDef): Track {
  const cps = def.controlPoints.map(([x, y]) => ({ x, y }));
  const n = cps.length;
  if (n < 4) throw new Error(`track ${def.id}: need at least 4 control points`);

  // 1. densely sample the closed spline (positions + elevation)
  const STEPS = 48;
  const dense: Pt[] = [];
  const denseElev: number[] = [];
  const elevs = def.elevations;
  if (elevs && elevs.length !== n) {
    throw new Error(`track ${def.id}: elevations length must match controlPoints`);
  }
  for (let i = 0; i < n; i++) {
    const p0 = cps[(i - 1 + n) % n];
    const p1 = cps[i];
    const p2 = cps[(i + 1) % n];
    const p3 = cps[(i + 2) % n];
    for (let k = 0; k < STEPS; k++) {
      dense.push(catmullRom(p0, p1, p2, p3, k / STEPS));
      denseElev.push(
        elevs
          ? catmullRom1D(
              elevs[(i - 1 + n) % n],
              elevs[i],
              elevs[(i + 1) % n],
              elevs[(i + 2) % n],
              k / STEPS,
            )
          : 0,
      );
    }
  }

  // 2. resample by arc length at fixed stride
  const cum: number[] = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const totalLen = cum[dense.length];
  const DS = BAL.sampleStepM;
  const count = Math.max(16, Math.floor(totalLen / DS));
  const stride = totalLen / count; // exact stride so the loop closes cleanly
  const pts: Pt[] = [];
  const ptElev: number[] = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const target = i * stride;
    while (j < dense.length - 1 && cum[j + 1] < target) j++;
    const segLen = cum[j + 1] - cum[j];
    const u = segLen > 1e-9 ? (target - cum[j]) / segLen : 0;
    const a = dense[j];
    const b = dense[(j + 1) % dense.length];
    pts.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    const ea = denseElev[j];
    const eb = denseElev[(j + 1) % dense.length];
    ptElev.push(ea + (eb - ea) * u);
  }

  // 3. headings and curvature (finite differences, wrap-aware)
  const headings = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const a = pts[(i - 1 + count) % count];
    const b = pts[(i + 1) % count];
    headings[i] = Math.atan2(b.y - a.y, b.x - a.x);
  }
  const rawK = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const dh = wrapAngle(headings[(i + 1) % count] - headings[(i - 1 + count) % count]);
    rawK[i] = dh / (2 * stride);
  }
  // smooth curvature
  const w = BAL.curvatureSmoothWindow;
  const half = Math.floor(w / 2);
  const kappa = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let d = -half; d <= half; d++) sum += rawK[(i + d + count) % count];
    kappa[i] = sum / (2 * half + 1);
  }

  // 3b. smoothed elevation gradient
  const rawGrade = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const d = ptElev[(i + 1) % count] - ptElev[(i - 1 + count) % count];
    rawGrade[i] = d / (2 * stride);
  }
  const grade = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let d = -half; d <= half; d++) sum += rawGrade[(i + d + count) % count];
    grade[i] = sum / (2 * half + 1);
  }

  // 4. corner speed caps for reference grip 1.0
  const samples: TrackSample[] = [];
  for (let i = 0; i < count; i++) {
    const k = Math.abs(kappa[i]);
    const vCap = k > 1e-6 ? Math.sqrt((BAL.aLatRef * def.gripBase) / k) : BAL.vCapCeiling;
    samples.push({
      s: i * stride,
      x: pts[i].x,
      y: pts[i].y,
      heading: headings[i],
      curvature: kappa[i],
      vCapBase: Math.min(vCap, BAL.vCapCeiling),
      elev: ptElev[i],
      grade: grade[i],
    });
  }

  // 5. corner zones: maximal runs of |k| > 1/cornerRadius, merged across small gaps
  const kCorner = 1 / BAL.cornerRadiusM;
  const isCorner = samples.map((s) => Math.abs(s.curvature) > kCorner);
  const runs: Array<{ start: number; end: number }> = [];
  {
    // find the first non-corner sample so runs never straddle the array seam ambiguously
    let seam = isCorner.indexOf(false);
    if (seam === -1) seam = 0;
    let runStart = -1;
    for (let step = 0; step <= count; step++) {
      const i = (seam + step) % count;
      const inCorner = step < count && isCorner[i];
      if (inCorner && runStart === -1) runStart = i;
      if (!inCorner && runStart !== -1) {
        runs.push({ start: runStart, end: (i - 1 + count) % count });
        runStart = -1;
      }
    }
  }
  // drop 1-sample noise blips, then merge runs separated by small gaps
  const gapSamples = Math.round(BAL.cornerMergeGapM / stride);
  const merged: Array<{ start: number; end: number }> = [];
  const runLen = (r: { start: number; end: number }): number =>
    (r.end - r.start + count) % count;
  const realRuns = runs.filter((r) => runLen(r) >= 2);
  for (const r of realRuns) {
    const prev = merged[merged.length - 1];
    if (prev && (r.start - prev.end + count) % count <= gapSamples) {
      prev.end = r.end;
    } else {
      merged.push({ ...r });
    }
  }
  if (merged.length > 1) {
    const first = merged[0];
    const last = merged[merged.length - 1];
    if ((first.start - last.end + count) % count <= gapSamples) {
      last.end = first.end;
      merged.shift();
    }
  }

  // long technical complexes merge into one huge run — chop those into
  // sub-corners so mistake rolls and names stay granular
  const maxLen = Math.round(BAL.cornerMaxLenM / stride);
  const chopped: Array<{ start: number; end: number }> = [];
  for (const r of merged) {
    const len = runLen(r);
    if (len <= maxLen) {
      chopped.push(r);
    } else {
      const parts = Math.ceil(len / maxLen);
      const per = Math.floor(len / parts);
      for (let p = 0; p < parts; p++) {
        chopped.push({
          start: (r.start + p * per) % count,
          end: p === parts - 1 ? r.end : (r.start + (p + 1) * per - 1) % count,
        });
      }
    }
  }

  // order corners by entry position and name them T1, T2, ...
  chopped.sort((a, b) => a.start - b.start);
  const corners: CornerZone[] = chopped.map((r) => {
      let apexIdx = r.start;
      let maxK = 0;
      for (let step = 0; step <= runLen(r); step++) {
        const i = (r.start + step) % count;
        if (Math.abs(kappa[i]) > maxK) {
          maxK = Math.abs(kappa[i]);
          apexIdx = i;
        }
      }
      const apexSpeed = samples[apexIdx].vCapBase;
      return {
        name: '',
        entryS: samples[r.start].s,
        apexS: samples[apexIdx].s,
        exitS: samples[r.end].s,
        apexSpeed,
        severity: Math.max(0.7, Math.min(1.4, 1.7 - apexSpeed / 35)),
      };
    });
  corners.forEach((c, i) => (c.name = `T${i + 1}`));

  // 6. overtaking zones: straights >= minLength that feed a corner entry
  const kStraight = 1 / BAL.zoneStraightRadiusM;
  const zones: OvertakeZone[] = [];
  for (const corner of corners) {
    const entryIdx = Math.round(corner.entryS / stride) % count;
    // skip the curvature transition band just before the corner entry,
    // then walk backwards while the track stays straight (tolerating
    // 1-2 sample curvature blips from spline transitions)
    let i = entryIdx;
    let skip = 0;
    while (
      Math.abs(kappa[(i - 1 + count) % count]) > kStraight &&
      skip++ < Math.round(120 / stride)
    ) {
      i = (i - 1 + count) % count;
    }
    let len = 0;
    let blips = 0;
    while (len < 2000) {
      const prev = (i - 1 + count) % count;
      if (Math.abs(kappa[prev]) > kStraight) {
        blips++;
        if (blips > 2) break;
      } else {
        blips = 0;
      }
      i = prev;
      len += stride;
    }
    // dev-only diagnostics (TRACK_DEBUG=1 with the Node harness)
    const env = (globalThis as { process?: { env?: Record<string, string> } }).process?.env;
    if (env?.TRACK_DEBUG) {
      console.log(`zone-walk ${corner.name}: entryIdx=${entryIdx} skippedTo=${i} len=${Math.round(len)}`);
    }
    if (len >= BAL.overtakeMinStraightM) {
      const startIdx = i;
      // zone covers the last 60% of the straight plus the braking point
      const zoneLen = len * 0.6;
      const zoneStartIdx = Math.round((startIdx + (len - zoneLen) / stride)) % count;
      zones.push({
        name: corner.name,
        startS: samples[zoneStartIdx % count].s,
        endS: corner.entryS,
        difficulty: Math.max(0.2, Math.min(1, 1 - (len - BAL.overtakeMinStraightM) / 600)),
      });
    }
  }

  return {
    def,
    lengthM: count * stride,
    samples,
    sampleStepM: stride,
    corners,
    overtakingZones: zones,
  };
}

/** map an arc position to interpolated x/y/heading for rendering */
export function posAt(
  track: Track,
  s: number,
): { x: number; y: number; heading: number } {
  const L = track.lengthM;
  let sw = s % L;
  if (sw < 0) sw += L;
  const f = sw / track.sampleStepM;
  const i = Math.floor(f) % track.samples.length;
  const u = f - Math.floor(f);
  const a = track.samples[i];
  const b = track.samples[(i + 1) % track.samples.length];
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    heading: a.heading + wrapAngle(b.heading - a.heading) * u,
  };
}
