// Saving a race in progress.
//
// A single endurance event runs to forty-five laps. Losing one to a closed
// tab, a phone call or a flat battery is the kind of thing that stops people
// playing a game, and "do not close the tab" is not a design.
//
// RaceState is almost trivially serialisable — it is plain data by
// construction, because the simulation is pure. The two things that are not
// are the compiled Track and each car's precomputed speed profile, and both
// are *derived*: the track from its definition, the profile from the car's
// spec. So the snapshot stores the definition and rebuilds the rest, which
// also keeps the saved blob small.

import { buildSpeedProfile } from '../sim/speedProfile';
import { compileTrack } from '../sim/trackCompiler';
import type { CarRaceState, RaceState, TrackDef } from '../sim/types';

export const RACE_SAVE_KEY = 'bspec-race';
const RACE_SAVE_VERSION = 1;

/** everything needed to put the player back exactly where they were */
export interface RaceSnapshot {
  version: number;
  savedAt: number;
  title: string;
  subtitle: string;
  /** the exact definition the race was compiled from, mods included */
  trackDef: TrackDef;
  /** how to get back to this race's screen when it finishes */
  params: unknown;
  /** RaceState with the derived, non-serialisable parts stripped */
  state: unknown;
}

type StrippedCar = Omit<CarRaceState, 'profile'>;

export function snapshotRace(
  state: RaceState,
  trackDef: TrackDef,
  title: string,
  subtitle: string,
  params: unknown,
): RaceSnapshot {
  const { track: _track, cars, ...rest } = state;
  return {
    version: RACE_SAVE_VERSION,
    savedAt: Date.now(),
    title,
    subtitle,
    trackDef,
    params,
    state: {
      ...rest,
      cars: cars.map((car) => {
        const { profile: _profile, ...carRest } = car;
        return carRest as StrippedCar;
      }),
    },
  };
}

/** rebuilds a live RaceState from a snapshot, or null if it cannot */
export function restoreRace(snap: RaceSnapshot): RaceState | null {
  try {
    if (snap.version !== RACE_SAVE_VERSION) return null;
    const track = compileTrack(snap.trackDef);
    const raw = snap.state as Omit<RaceState, 'track' | 'cars'> & { cars: StrippedCar[] };
    const cars: CarRaceState[] = raw.cars.map((car) => {
      // the profile is a pure function of track and spec, so recomputing it
      // gives back exactly what was there before
      const { profile, profileMax, idealLapS } = buildSpeedProfile(track, car.spec);
      return { ...car, profile, profileMax, idealLapS };
    });
    return { ...raw, track, cars };
  } catch {
    return null;
  }
}

export function saveRaceInProgress(snap: RaceSnapshot): void {
  try {
    localStorage.setItem(RACE_SAVE_KEY, JSON.stringify(snap));
  } catch {
    // storage full or blocked — the race keeps running, just unsaved
  }
}

export function loadRaceInProgress(): RaceSnapshot | null {
  try {
    const raw = localStorage.getItem(RACE_SAVE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as RaceSnapshot;
    return snap.version === RACE_SAVE_VERSION ? snap : null;
  } catch {
    return null;
  }
}

export function clearRaceInProgress(): void {
  try {
    localStorage.removeItem(RACE_SAVE_KEY);
  } catch {
    // nothing to do
  }
}
