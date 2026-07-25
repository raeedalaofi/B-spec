// Bridges the career to the race screen. Handles five modes:
//  - championship events (standings, prizes, titles)
//  - standalone catalog events (trophies, endurance, rally, super league)
//  - Invitational Series events (endless endgame: prizes + points)
//  - license trials and driving missions (loaner cars, medals)
//  - Free Race exhibitions (no rewards)
//
// Every mode goes through the same two steps: commit to a strategy, then
// race. Routing them through one place is what keeps the pre-race decision
// from having to be re-implemented per event type.

import { AI_BY_ID } from '../../data/aidrivers';
import { CARS } from '../../data/cars';
import { CHAMPIONSHIP_BY_ID } from '../../data/championships';
import { STANDALONE_BY_ID } from '../../data/eventCatalog';
import { generateInvitational } from '../../data/invitationals';
import { LICENSE_BY_ID, TRIAL_BY_ID } from '../../data/licenses';
import { MISSION_BY_ID } from '../../data/missions';
import { tunedSpec } from '../../data/parts';
import { COMPOUNDS, type RaceStrategy } from '../../data/strategy';
import { getTrackDef, TRACK_DEFS } from '../../data/tracks';
import { evaluateAchievements } from '../../state/achievements';
import { rememberStrategy, strategyFor } from '../../state/gameState';
import {
  applyInvitationalResult,
  applyRaceResult,
  applyStandaloneResult,
} from '../../state/progression';
import { applyTrialMedal, evaluateTrial, trialTrackDef } from '../../state/trials';
import { hashSeed } from '../../sim/rng';
import { compileTrack } from '../../sim/trackCompiler';
import { clearRaceInProgress } from '../../state/raceSave';
import type {
  CarSpec,
  RaceConfig,
  RaceEntry,
  RaceResult,
  RaceState,
  Track,
  TrackDef,
} from '../../sim/types';
import { mountPreRace } from '../preRace';
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
  | { free: FreeRaceConfig }
  | { trial: string }
  | { standalone: string };

function aiEntries(driverIds: string[], carIds: string[], parts: string[] = []): RaceEntry[] {
  return driverIds.map((driverId, i) => ({
    carId: `ai-${driverId}`,
    spec: tunedSpec(CARS[carIds[i]], parts),
    driverName: AI_BY_ID[driverId].name,
    stats: AI_BY_ID[driverId].stats,
    isPlayer: false,
  }));
}

/** the wear this car will actually see per lap, for the stint estimate */
function wearPerLapFor(track: Track, spec: CarSpec, smoothness: number): number {
  return (
    track.def.tireWearBase *
    spec.tireWearMult *
    (1.25 - 0.5 * (smoothness / 100))
  );
}

interface RaceSetup {
  track: Track;
  /** the definition the track was compiled from, for resumable snapshots */
  trackDef: TrackDef;
  /** how to route back into this exact race after a reload */
  params: CareerRaceParams;
  laps: number;
  title: string;
  subtitle: string;
  entries: RaceEntry[];
  playerSpec: CarSpec;
  /** carId the remembered strategy is filed under */
  strategyKey: string;
  seed: number;
  onFinished(result: RaceResult, state: RaceState): void;
  onBack(): void;
}

/**
 * Shows the strategy panel, then hands the committed plan to the race. The
 * chosen compound and fuel load are applied to the player's entry here, so
 * the simulation never has to know a strategy screen exists.
 */
function runSetup(ctx: AppContext, setup: RaceSetup, restored?: RaceState): () => void {
  const gs = ctx.gs!;
  let dispose: (() => void) | null = null;

  const start = (strategy: RaceStrategy): void => {
    rememberStrategy(gs, setup.strategyKey, strategy);
    ctx.save();
    const entries = setup.entries.map((e) =>
      e.isPlayer
        ? {
            ...e,
            compound: strategy.compound,
            startFuelL: e.spec.fuelTankL * strategy.fuelFrac,
            order: strategy.order,
          }
        : e,
    );
    const config: RaceConfig = {
      track: setup.track,
      lapsTotal: setup.laps,
      seed: setup.seed,
      entries,
    };
    dispose?.();
    dispose = mountRaceScreen(ctx.root, {
      config,
      title: setup.title,
      subtitle: setup.subtitle,
      audio: gs.settings.audio,
      onAudioToggle: (on) => {
        gs.settings.audio = on;
        ctx.save();
      },
      defaultSpeed: gs.settings.defaultSpeed,
      onSpeedChange: (mult) => {
        gs.settings.defaultSpeed = mult;
        ctx.save();
      },
      coachSeen: gs.coachSeen,
      onCoachSeen: () => ctx.save(),
      resume: { trackDef: setup.trackDef, params: setup.params },
      restored,
      onFinished: (result, state) => {
        clearRaceInProgress();
        setup.onFinished(result, state);
      },
      onRetire: () => {
        clearRaceInProgress();
        setup.onBack();
      },
    });
  };

  // a restored race goes straight back on track — the strategy was committed
  // to before the tab closed, and re-asking would let the player rewrite it
  if (restored) {
    start(clampStrategy(strategyFor(gs, setup.strategyKey)));
    return () => dispose?.();
  }

  dispose = mountPreRace(ctx.root, {
    title: setup.title,
    subtitle: setup.subtitle,
    track: setup.track,
    laps: setup.laps,
    car: setup.playerSpec,
    wearPerLapBase: wearPerLapFor(setup.track, setup.playerSpec, gs.driver.stats.smoothness),
    fuelPerLapBase: setup.track.def.fuelBase * setup.playerSpec.fuelMult,
    initial: clampStrategy(strategyFor(gs, setup.strategyKey)),
    onStart: start,
    onBack: setup.onBack,
  });

  return () => dispose?.();
}

/** guards against a remembered strategy referencing something that moved */
function clampStrategy(s: RaceStrategy): RaceStrategy {
  return {
    compound: COMPOUNDS[s.compound] ? s.compound : 'medium',
    fuelFrac: Math.max(0.35, Math.min(1, s.fuelFrac)),
    order: s.order ?? 'push',
  };
}

export function careerRaceScreen(ctx: AppContext, params?: unknown): (() => void) | void {
  const gs = ctx.gs!;
  const wrapper = params as (CareerRaceParams & { __resume?: RaceState }) | undefined;
  const restored = wrapper?.__resume;
  const p = params as CareerRaceParams;

  const playerEntry = (carId: string): RaceEntry => ({
    carId: 'player',
    spec: tunedSpec(CARS[carId], gs.tuning[carId] ?? []),
    driverName: gs.driver.name,
    stats: { ...gs.driver.stats },
    isPlayer: true,
    paceCmd: 3,
  });

  if ('championshipId' in p) {
    const champ = CHAMPIONSHIP_BY_ID[p.championshipId];
    const event = champ.events.find((e) => e.id === p.eventId)!;
    const track = compileTrack(TRACK_DEFS[event.trackId]);
    const entries = aiEntries(champ.aiDriverIds, event.aiCarIds, event.aiParts ?? champ.aiParts);
    const gridSlot = entries.length + 1;
    const me = playerEntry(gs.activeCarId);
    entries.push(me);
    return runSetup(ctx, {
      track,
      trackDef: TRACK_DEFS[event.trackId],
      params: p,
      laps: event.laps,
      title: champ.name,
      subtitle: `${event.name} — ${track.def.name} · ${event.laps} laps`,
      entries,
      playerSpec: me.spec,
      strategyKey: gs.activeCarId,
      seed: hashSeed(`${event.id}-${gs.totals.races}-${gs.createdAt}-${Date.now()}`),
      onFinished: (result) => {
        const rewards = applyRaceResult(gs, champ, event.id, result, gridSlot);
        const unlocked = evaluateAchievements(gs, { type: 'race', result, rewards, gridSlot });
        ctx.save();
        showAchievementToasts(unlocked);
        ctx.go('results', { championshipId: champ.id, result, rewards });
      },
      onBack: () => ctx.go('events', { championshipId: champ.id }),
    }, restored);
  }

  if ('invitational' in p) {
    const inv = generateInvitational(p.invitational);
    const track = compileTrack(TRACK_DEFS[inv.trackId]);
    const entries = aiEntries(inv.aiDriverIds, inv.aiCarIds);
    const gridSlot = entries.length + 1;
    const me = playerEntry(gs.activeCarId);
    entries.push(me);
    return runSetup(ctx, {
      track,
      trackDef: TRACK_DEFS[inv.trackId],
      params: p,
      laps: inv.laps,
      title: 'Invitational Series',
      subtitle: `${inv.name} — ${track.def.name} · ${inv.laps} laps`,
      entries,
      playerSpec: me.spec,
      strategyKey: gs.activeCarId,
      seed: hashSeed(`inv-${inv.n}-${gs.totals.races}-${Date.now()}`),
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
      onBack: () => ctx.go('events'),
    }, restored);
  }

  if ('standalone' in p) {
    const event = STANDALONE_BY_ID[p.standalone];
    const baseDef = getTrackDef(event.trackId);
    const def = event.trackMods
      ? {
          ...baseDef,
          gripBase: baseDef.gripBase * (event.trackMods.gripMult ?? 1),
          tireWearBase: baseDef.tireWearBase * (event.trackMods.wearMult ?? 1),
        }
      : baseDef;
    const track = compileTrack(def);
    const entries = aiEntries(event.aiDriverIds, event.aiCarIds);
    const gridSlot = entries.length + 1;
    const me = playerEntry(gs.activeCarId);
    entries.push(me);
    return runSetup(ctx, {
      track,
      trackDef: def,
      params: p,
      laps: event.laps,
      title: event.name,
      subtitle: `${track.def.name} · ${event.laps} laps`,
      entries,
      playerSpec: me.spec,
      strategyKey: gs.activeCarId,
      seed: hashSeed(`${event.id}-${gs.totals.races}-${Date.now()}`),
      onFinished: (result) => {
        const rewards = applyStandaloneResult(gs, event, result, gridSlot);
        const unlocked = evaluateAchievements(gs, { type: 'race', result, rewards, gridSlot });
        ctx.save();
        showAchievementToasts(unlocked);
        ctx.go('results', { standaloneCategory: event.category, result, rewards });
      },
      onBack: () => ctx.go('catalog', { category: event.category }),
    }, restored);
  }

  if ('trial' in p) {
    const trial = TRIAL_BY_ID[p.trial] ?? MISSION_BY_ID[p.trial];
    const track = compileTrack(trialTrackDef(trial));
    const entries: RaceEntry[] = trial.ai.map(({ driverId, carId }, i) => ({
      carId: `ai-${driverId}-${i}`,
      spec: CARS[carId],
      driverName: AI_BY_ID[driverId].name,
      stats: AI_BY_ID[driverId].stats,
      isPlayer: false,
    }));
    // loaner car, stock spec — only the driver, the plan and the commands are yours
    const me: RaceEntry = {
      carId: 'player',
      spec: CARS[trial.carId],
      driverName: gs.driver.name,
      stats: { ...gs.driver.stats },
      isPlayer: true,
      paceCmd: 3,
    };
    entries.push(me);
    const license = trial.licenseId ? LICENSE_BY_ID[trial.licenseId] : null;
    const goBack = (flash?: unknown): void => {
      if (license) ctx.go('licenses', flash ? { flash } : undefined);
      else ctx.go('catalog', { category: 'missions', ...(flash ? { flash } : {}) });
    };
    return runSetup(ctx, {
      track,
      trackDef: trialTrackDef(trial),
      params: p,
      laps: trial.laps,
      title: license ? `${license.short} License — ${trial.name}` : `Mission — ${trial.name}`,
      subtitle: `${track.def.name} · ${trial.laps} laps`,
      entries,
      playerSpec: me.spec,
      strategyKey: `trial-${trial.id}`,
      seed: trial.seed,
      onFinished: (result, state) => {
        const grade = evaluateTrial(trial, result, state);
        const earned = applyTrialMedal(gs, trial, grade.medal);
        const unlocked = evaluateAchievements(gs, { type: 'generic' });
        ctx.save();
        showAchievementToasts(unlocked);
        goBack({
          trialId: trial.id,
          medal: grade.medal,
          detail: grade.detail + (earned > 0 ? ` (+${earned.toLocaleString('en-US')} Cr.)` : ''),
        });
      },
      onBack: () => goBack(),
    }, restored);
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
  const me = playerEntry(cfg.carId);
  entries.push(me);
  return runSetup(ctx, {
    track,
    trackDef: TRACK_DEFS[cfg.trackId],
    params: p,
    laps: cfg.laps,
    title: 'Free Race',
    subtitle: `Exhibition — ${track.def.name} · ${cfg.laps} laps · no rewards`,
    entries,
    playerSpec: me.spec,
    strategyKey: cfg.carId,
    seed: hashSeed(`free-${Date.now()}`),
    onFinished: () => ctx.go('free-race'),
    onBack: () => ctx.go('free-race'),
  }, restored);
}
