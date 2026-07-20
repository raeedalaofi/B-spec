import { reverseTrackDef } from '../../sim/trackCompiler';
import type { TrackDef } from '../../sim/types';
import { ARIA } from './aria';
import { COPPERLINE } from './copperline';
import { EXPANSION_TRACKS } from './expansion';
import { GREENPARK } from './greenpark';
import { OVAL } from './oval';

/** the 19-circuit roster */
export const TRACK_DEFS: Record<string, TrackDef> = Object.fromEntries(
  [OVAL, GREENPARK, COPPERLINE, ARIA, ...EXPANSION_TRACKS].map((t) => [t.id, t]),
);

export const TRACK_COUNT = Object.keys(TRACK_DEFS).length;

/**
 * Resolves a track def by id, including reverse-layout variants
 * ('<id>-r'), which are generated on demand from the base layout.
 */
export function getTrackDef(id: string): TrackDef {
  const def = TRACK_DEFS[id];
  if (def) return def;
  if (id.endsWith('-r')) {
    const base = TRACK_DEFS[id.slice(0, -2)];
    if (base) return reverseTrackDef(base);
  }
  throw new Error(`unknown track '${id}'`);
}
