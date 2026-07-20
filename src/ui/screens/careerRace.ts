// Bridges the career to the race screen: builds the field from the
// championship roster, runs the race, applies rewards, then hands off to
// the results screen.

import { AI_BY_ID } from '../../data/aidrivers';
import { CARS } from '../../data/cars';
import { CHAMPIONSHIP_BY_ID } from '../../data/championships';
import { TRACK_DEFS } from '../../data/tracks';
import { applyRaceResult } from '../../state/progression';
import { hashSeed } from '../../sim/rng';
import { compileTrack } from '../../sim/trackCompiler';
import type { RaceEntry } from '../../sim/types';
import type { AppContext } from '../screenManager';
import { mountRaceScreen } from './race';

export interface CareerRaceParams {
  championshipId: string;
  eventId: string;
}

export function careerRaceScreen(ctx: AppContext, params?: unknown): (() => void) | void {
  const gs = ctx.gs!;
  const { championshipId, eventId } = params as CareerRaceParams;
  const champ = CHAMPIONSHIP_BY_ID[championshipId];
  const event = champ.events.find((e) => e.id === eventId)!;
  const track = compileTrack(TRACK_DEFS[event.trackId]);

  const entries: RaceEntry[] = champ.aiDriverIds.map((driverId, i) => ({
    carId: `ai-${driverId}`,
    spec: CARS[event.aiCarIds[i]],
    driverName: AI_BY_ID[driverId].name,
    stats: AI_BY_ID[driverId].stats,
    isPlayer: false,
  }));
  // the player starts from the back — overtaking is the game
  const gridSlot = entries.length + 1;
  entries.push({
    carId: 'player',
    spec: CARS[gs.activeCarId],
    driverName: gs.driver.name,
    stats: { ...gs.driver.stats },
    isPlayer: true,
    paceCmd: 3,
  });

  return mountRaceScreen(ctx.root, {
    config: {
      track,
      lapsTotal: event.laps,
      seed: hashSeed(`${eventId}-${gs.totals.races}-${gs.createdAt}-${Date.now()}`),
      entries,
    },
    title: champ.name,
    subtitle: `${event.name} — ${track.def.name} · ${event.laps} laps`,
    onFinished: (result) => {
      const rewards = applyRaceResult(gs, champ, eventId, result, gridSlot);
      ctx.save();
      ctx.go('results', { championshipId, eventId, result, rewards });
    },
  });
}
