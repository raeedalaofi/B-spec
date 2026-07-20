// Bridges the career to the race screen. Handles three modes:
//  - championship events (standings, prizes, titles)
//  - Invitational Series events (endless endgame: prizes + points)
//  - Free Race exhibitions (no rewards)
// The player's car always races with its installed tuning parts.

import { AI_BY_ID } from '../../data/aidrivers';
import { CARS } from '../../data/cars';
import { CHAMPIONSHIP_BY_ID } from '../../data/championships';
import { generateInvitational } from '../../data/invitationals';
import { tunedSpec } from '../../data/parts';
import { TRACK_DEFS } from '../../data/tracks';
import { evaluateAchievements } from '../../state/achievements';
import { applyInvitationalResult, applyRaceResult } from '../../state/progression';
import { hashSeed } from '../../sim/rng';
import { compileTrack } from '../../sim/trackCompiler';
import type { RaceEntry } from '../../sim/types';
import type { AppContext } from '../screenManager';
import { showAchievementToasts } from '../toasts';
import { mountRaceScreen } from './race';

export interface FreeRaceConfig {
  carId: string;
  trackId: string;
  laps: number;
  /** index into the AI roster tiers: 0 rookies, 1 pros, 2 aces */
  rivalTier: 0 | 1 | 2;
}

export type CareerRaceParams =
  | { championshipId: string; eventId: string }
  | { invitational: number }
  | { free: FreeRaceConfig };

function aiEntries(driverIds: string[], carIds: string[]): RaceEntry[] {
  return driverIds.map((driverId, i) => ({
    carId: `ai-${driverId}`,
    spec: CARS[carIds[i]],
    driverName: AI_BY_ID[driverId].name,
    stats: AI_BY_ID[driverId].stats,
    isPlayer: false,
  }));
}

export function careerRaceScreen(ctx: AppContext, params?: unknown): (() => void) | void {
  const gs = ctx.gs!;
  const p = params as CareerRaceParams;

  const playerEntry = (carId: string): RaceEntry => ({
    carId: 'player',
    spec: tunedSpec(CARS[carId], gs.tuning[carId] ?? []),
    driverName: gs.driver.name,
    stats: { ...gs.driver.stats },
    isPlayer: true,
    paceCmd: 3,
  });

  const common = {
    audio: gs.settings.audio,
    onAudioToggle: (on: boolean) => {
      gs.settings.audio = on;
      ctx.save();
    },
  };

  if ('championshipId' in p) {
    const champ = CHAMPIONSHIP_BY_ID[p.championshipId];
    const event = champ.events.find((e) => e.id === p.eventId)!;
    const track = compileTrack(TRACK_DEFS[event.trackId]);
    const entries = aiEntries(champ.aiDriverIds, event.aiCarIds);
    const gridSlot = entries.length + 1;
    entries.push(playerEntry(gs.activeCarId));
    return mountRaceScreen(ctx.root, {
      ...common,
      config: {
        track,
        lapsTotal: event.laps,
        seed: hashSeed(`${event.id}-${gs.totals.races}-${gs.createdAt}-${Date.now()}`),
        entries,
      },
      title: champ.name,
      subtitle: `${event.name} — ${track.def.name} · ${event.laps} laps`,
      onFinished: (result) => {
        const rewards = applyRaceResult(gs, champ, event.id, result, gridSlot);
        const unlocked = evaluateAchievements(gs, { type: 'race', result, rewards, gridSlot });
        ctx.save();
        showAchievementToasts(unlocked);
        ctx.go('results', { championshipId: champ.id, result, rewards });
      },
      onRetire: () => ctx.go('events', { championshipId: champ.id }),
    });
  }

  if ('invitational' in p) {
    const inv = generateInvitational(p.invitational);
    const track = compileTrack(TRACK_DEFS[inv.trackId]);
    const entries = aiEntries(inv.aiDriverIds, inv.aiCarIds);
    const gridSlot = entries.length + 1;
    entries.push(playerEntry(gs.activeCarId));
    return mountRaceScreen(ctx.root, {
      ...common,
      config: {
        track,
        lapsTotal: inv.laps,
        seed: hashSeed(`inv-${inv.n}-${gs.totals.races}-${Date.now()}`),
        entries,
      },
      title: 'Invitational Series',
      subtitle: `${inv.name} — ${track.def.name} · ${inv.laps} laps`,
      onFinished: (result) => {
        const rewards = applyInvitationalResult(gs, inv, result, gridSlot);
        const unlocked = evaluateAchievements(gs, {
          type: 'race',
          result,
          rewards,
          gridSlot,
          invitational: true,
        });
        ctx.save();
        showAchievementToasts(unlocked);
        ctx.go('results', { invitational: true, result, rewards });
      },
      onRetire: () => ctx.go('events'),
    });
  }

  // free race — exhibition, no rewards
  const cfg = p.free;
  const track = compileTrack(TRACK_DEFS[cfg.trackId]);
  const playerCar = CARS[cfg.carId];
  const tierStart = cfg.rivalTier * 7;
  const roster = Object.keys(AI_BY_ID).slice(tierStart, tierStart + 7);
  // rivals drive the same class as the player, mixed around their car
  const classCars = Object.values(CARS)
    .filter((c) => c.class === playerCar.class)
    .map((c) => c.id);
  const carIds = Array.from({ length: 7 }, (_, i) => classCars[i % classCars.length]);
  const entries = aiEntries(roster, carIds);
  entries.push(playerEntry(cfg.carId));
  return mountRaceScreen(ctx.root, {
    ...common,
    config: {
      track,
      lapsTotal: cfg.laps,
      seed: hashSeed(`free-${Date.now()}`),
      entries,
    },
    title: 'Free Race',
    subtitle: `Exhibition — ${track.def.name} · ${cfg.laps} laps · no rewards`,
    onFinished: () => ctx.go('free-race'),
    onRetire: () => ctx.go('free-race'),
  });
}
