import type { TrackDef } from '../../sim/types';
import { GREENPARK } from './greenpark';
import { OVAL } from './oval';

export const TRACK_DEFS: Record<string, TrackDef> = {
  [OVAL.id]: OVAL,
  [GREENPARK.id]: GREENPARK,
};
