// Driver progression (B-Spec points, levels, stat growth) and race
// payouts. Stat growth is auto-distributed — B-Spec drivers develop on
// their own, that's the fantasy — with deterministic seeded draws.

import { BAL } from '../data/balance';
import { CHAMP_POINTS, type ChampionshipDef } from '../data/championships';
import { hashSeed, rngNext } from '../sim/rng';
import type { DriverStats, RaceResult, RaceResultRow } from '../sim/types';
import {
  championshipProgress,
  pushHistory,
  type EventOutcome,
  type GameState,
} from './gameState';

export interface StatGain {
  stat: keyof DriverStats;
  amount: number;
}

export interface LevelUp {
  level: number;
  gains: StatGain[];
}

export interface RaceRewards {
  position: number;
  creditsEarned: number;
  pointsEarned: number;
  pointsBreakdown: string[];
  levelUps: LevelUp[];
  championshipDecided: boolean;
  wonTitle: boolean;
  titleBonus: number;
}

export function pointsToNextLevel(level: number): number {
  return BAL.levelBase + BAL.levelPer * level;
}

/** weighted stat-growth profile: early levels favor raw speed and
 *  consistency, later levels racecraft */
function growthWeights(level: number): Array<[keyof DriverStats, number]> {
  const t = Math.min(1, level / 20);
  return [
    ['pace', 0.32 - 0.12 * t],
    ['consistency', 0.28 - 0.06 * t],
    ['battle', 0.14 + 0.14 * t],
    ['smoothness', 0.14 + 0.06 * t],
    ['stamina', 0.12 - 0.02 * t],
  ];
}

function rollStatGains(gs: GameState, newLevel: number): StatGain[] {
  const rng = { rngState: hashSeed(`levelup-${gs.driver.name}-${newLevel}-${gs.createdAt}`) };
  const gains = new Map<keyof DriverStats, number>();
  for (let i = 0; i < BAL.statPointsPerLevel; i++) {
    const weights = growthWeights(newLevel).filter(
      // soft cap: stats at/above the cap stop growing, points spill over
      ([stat]) => gs.driver.stats[stat] < BAL.statSoftCap,
    );
    const total = weights.reduce((sum, [, w]) => sum + w, 0);
    if (total <= 0) break;
    let roll = rngNext(rng) * total;
    for (const [stat, w] of weights) {
      roll -= w;
      if (roll <= 0) {
        gains.set(stat, (gains.get(stat) ?? 0) + 1);
        gs.driver.stats[stat] = Math.min(100, gs.driver.stats[stat] + 1);
        break;
      }
    }
  }
  return [...gains.entries()].map(([stat, amount]) => ({ stat, amount }));
}

function awardBspecPoints(gs: GameState, points: number): LevelUp[] {
  gs.driver.totalPoints += points;
  gs.driver.bspecPoints += points;
  const ups: LevelUp[] = [];
  while (gs.driver.bspecPoints >= pointsToNextLevel(gs.driver.level)) {
    gs.driver.bspecPoints -= pointsToNextLevel(gs.driver.level);
    gs.driver.level++;
    ups.push({ level: gs.driver.level, gains: rollStatGains(gs, gs.driver.level) });
  }
  return ups;
}

/** B-Spec points for the player's race performance, with a breakdown */
function racePoints(
  playerRow: RaceResultRow,
  gridSlot: number,
): { points: number; breakdown: string[] } {
  const breakdown: string[] = [];
  let points = BAL.bspecPosPoints[playerRow.position - 1] ?? 0;
  breakdown.push(`P${playerRow.position} finish: +${points}`);
  const overtakePts = playerRow.overtakes * BAL.bspecOvertakePts;
  if (overtakePts > 0) {
    points += overtakePts;
    breakdown.push(`${playerRow.overtakes} overtakes: +${overtakePts}`);
  }
  if (playerRow.fastestLap) {
    points += BAL.bspecFastestLapPts;
    breakdown.push(`Fastest lap: +${BAL.bspecFastestLapPts}`);
  }
  if (gridSlot - playerRow.position >= 3) {
    points += BAL.bspecComebackPts;
    breakdown.push(`Charged from P${gridSlot}: +${BAL.bspecComebackPts}`);
  }
  return { points, breakdown };
}

function recordTotals(gs: GameState, playerRow: RaceResultRow): void {
  gs.totals.races++;
  if (playerRow.position === 1) gs.totals.wins++;
  if (playerRow.position <= 3) gs.totals.podiums++;
  gs.totals.overtakes += playerRow.overtakes;
}

/**
 * Applies a finished race to the career: prize money, championship
 * standings, B-Spec points, level-ups, title resolution.
 */
export function applyRaceResult(
  gs: GameState,
  champ: ChampionshipDef,
  eventId: string,
  result: RaceResult,
  gridSlot: number,
): RaceRewards {
  const progress = championshipProgress(gs, champ.id);
  const playerRow = result.rows.find((r) => r.isPlayer)!;
  const position = playerRow.position;

  // championship standings for everyone (AI keyed by carId suffix)
  for (const row of result.rows) {
    const key = row.isPlayer ? 'player' : row.carId.replace(/^ai-/, '');
    progress.points[key] = (progress.points[key] ?? 0) + (CHAMP_POINTS[row.position - 1] ?? 0);
  }

  // prize money (repeat runs pay, but only improvements re-pay the delta
  // would overcomplicate — repeats simply pay again, grinding is allowed)
  const creditsEarned = champ.prize[position - 1] ?? 0;
  gs.credits += creditsEarned;

  // B-Spec points
  const { points: basePoints, breakdown } = racePoints(playerRow, gridSlot);
  let points = basePoints;

  // record outcome (keep the best)
  const prev = progress.completedEvents[eventId];
  const outcome: EventOutcome = {
    position,
    bestLapS: playerRow.bestLapS,
    overtakes: playerRow.overtakes,
    creditsEarned,
    pointsEarned: points,
  };
  if (!prev || position < prev.position) progress.completedEvents[eventId] = outcome;

  recordTotals(gs, playerRow);

  // title decided once every event has been completed
  let wonTitle = false;
  let titleBonus = 0;
  const allDone = champ.events.every((e) => progress.completedEvents[e.id]);
  const decided = allDone && !progress.finished;
  if (decided) {
    progress.finished = true;
    const best = Math.max(...Object.values(progress.points));
    wonTitle = (progress.points['player'] ?? 0) >= best;
    if (wonTitle) {
      progress.champion = true;
      titleBonus = champ.titleBonus;
      gs.credits += titleBonus;
      points += BAL.bspecTitlePts;
      breakdown.push(`CHAMPION: +${BAL.bspecTitlePts}`);
    }
  }

  const levelUps = awardBspecPoints(gs, points);

  const event = champ.events.find((e) => e.id === eventId);
  pushHistory(gs, {
    at: Date.now(),
    series: champ.name,
    event: event?.name ?? eventId,
    trackId: event?.trackId ?? '',
    position,
    bestLapS: playerRow.bestLapS,
    creditsEarned,
    pointsEarned: points,
  });

  return {
    position,
    creditsEarned,
    pointsEarned: points,
    pointsBreakdown: breakdown,
    levelUps,
    championshipDecided: decided,
    wonTitle,
    titleBonus,
  };
}

/**
 * Applies a finished standalone catalog event (trophies, endurance, rally,
 * super league): credits + B-Spec points + history + best-result record.
 */
export function applyStandaloneResult(
  gs: GameState,
  event: {
    id: string;
    name: string;
    trackId: string;
    prize: number[];
    category: string;
  },
  result: RaceResult,
  gridSlot: number,
): RaceRewards {
  const playerRow = result.rows.find((r) => r.isPlayer)!;
  const position = playerRow.position;
  const creditsEarned = event.prize[position - 1] ?? 0;
  gs.credits += creditsEarned;
  const { points, breakdown } = racePoints(playerRow, gridSlot);
  recordTotals(gs, playerRow);
  const prev = gs.standaloneResults[event.id];
  if (!prev || position < prev.position) {
    gs.standaloneResults[event.id] = { position, bestLapS: playerRow.bestLapS };
  }
  const levelUps = awardBspecPoints(gs, points);
  pushHistory(gs, {
    at: Date.now(),
    series: seriesLabel(event.category),
    event: event.name,
    trackId: event.trackId,
    position,
    bestLapS: playerRow.bestLapS,
    creditsEarned,
    pointsEarned: points,
  });
  return {
    position,
    creditsEarned,
    pointsEarned: points,
    pointsBreakdown: breakdown,
    levelUps,
    championshipDecided: false,
    wonTitle: false,
    titleBonus: 0,
  };
}

function seriesLabel(category: string): string {
  switch (category) {
    case 'trophy':
      return 'Track Trophy';
    case 'trophy-reverse':
      return 'Reverse GP';
    case 'endurance':
      return 'Endurance Series';
    case 'rally':
      return 'Rally Sprint';
    case 'super':
      return 'Super League';
    default:
      return 'Event';
  }
}

/**
 * Applies a finished Invitational Series event (the endless endgame):
 * credits + B-Spec points + history, no championship standings.
 */
export function applyInvitationalResult(
  gs: GameState,
  inv: { name: string; trackId: string; prize: number[] },
  result: RaceResult,
  gridSlot: number,
): RaceRewards {
  const playerRow = result.rows.find((r) => r.isPlayer)!;
  const position = playerRow.position;
  const creditsEarned = inv.prize[position - 1] ?? 0;
  gs.credits += creditsEarned;
  const { points, breakdown } = racePoints(playerRow, gridSlot);
  recordTotals(gs, playerRow);
  if (position === 1) gs.invitationals++;
  const levelUps = awardBspecPoints(gs, points);
  pushHistory(gs, {
    at: Date.now(),
    series: 'Invitational Series',
    event: inv.name,
    trackId: inv.trackId,
    position,
    bestLapS: playerRow.bestLapS,
    creditsEarned,
    pointsEarned: points,
  });
  return {
    position,
    creditsEarned,
    pointsEarned: points,
    pointsBreakdown: breakdown,
    levelUps,
    championshipDecided: false,
    wonTitle: false,
    titleBonus: 0,
  };
}

/** championship standings as a sorted table */
export function standingsOf(
  gs: GameState,
  champ: ChampionshipDef,
  aiNames: Record<string, string>,
): Array<{ key: string; name: string; points: number; isPlayer: boolean }> {
  const progress = championshipProgress(gs, champ.id);
  const keys = new Set<string>(['player', ...champ.aiDriverIds]);
  for (const k of Object.keys(progress.points)) keys.add(k);
  return [...keys]
    .map((key) => ({
      key,
      name: key === 'player' ? gs.driver.name : (aiNames[key] ?? key),
      points: progress.points[key] ?? 0,
      isPlayer: key === 'player',
    }))
    .sort((a, b) => b.points - a.points || (a.isPlayer ? -1 : 1));
}
