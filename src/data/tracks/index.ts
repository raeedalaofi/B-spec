import type { TrackDef } from '../../sim/types';
import { ARIA } from './aria';
import { COPPERLINE } from './copperline';
import { GREENPARK } from './greenpark';
import { OVAL } from './oval';

export const TRACK_DEFS: Record<string, TrackDef> = {
  [OVAL.id]: OVAL,
  [GREENPARK.id]: GREENPARK,
  [COPPERLINE.id]: COPPERLINE,
  [ARIA.id]: ARIA,
};
