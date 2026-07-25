// Career game state: everything that persists between sessions.

import { DEFAULT_STRATEGY, type RaceStrategy } from '../data/strategy';
import type { DriverStats } from '../sim/types';

export const SCHEMA_VERSION = 4;

export interface EventOutcome {
  position: number;
  bestLapS: number | null;
  overtakes: number;
  creditsEarned: number;
  pointsEarned: number;
}

export interface ChampionshipProgress {
  /** eventId → best outcome so far */
  completedEvents: Record<string, EventOutcome>;
  /** entrant key ('player' or AI driver id) → championship points */
  points: Record<string, number>;
  /** set once every event has been run at least once */
  finished: boolean;
  /** player won the title */
  champion: boolean;
}

export interface RaceHistoryEntry {
  at: number;
  series: string;
  event: string;
  trackId: string;
  position: number;
  bestLapS: number | null;
  creditsEarned: number;
  pointsEarned: number;
}

export interface GameState {
  schemaVersion: number;
  createdAt: number;
  credits: number;
  driver: {
    name: string;
    level: number;
    /** points toward the next level */
    bspecPoints: number;
    totalPoints: number;
    stats: DriverStats;
  };
  ownedCarIds: string[];
  activeCarId: string;
  /** carId → installed part ids */
  tuning: Record<string, string[]>;
  /** carId → the strategy last committed to with that car */
  strategies: Record<string, RaceStrategy>;
  career: Record<string, ChampionshipProgress>;
  /** achievement id → unlockedAt timestamp */
  achievements: Record<string, number>;
  /** coaching tip id → shown-at timestamp, so nothing is taught twice */
  coachSeen: Record<string, number>;
  /** most recent races, newest first (capped) */
  history: RaceHistoryEntry[];
  /** completed Invitational Series events (endless endgame) */
  invitationals: number;
  /** trial id (license test / mission) → best medal */
  trialMedals: Record<string, 'gold' | 'silver' | 'bronze'>;
  /** standalone catalog event id → best outcome */
  standaloneResults: Record<string, { position: number; bestLapS: number | null }>;
  totals: { races: number; wins: number; podiums: number; overtakes: number };
  settings: { defaultSpeed: 1 | 2 | 4; audio: boolean; avatar?: number };
}

/**
 * Enough to buy the class-C car the opening championship expects and still
 * have something left for the garage. Starting with exactly the price of a
 * car means the first decision the player makes is which thing they cannot
 * afford, which is a poor opening move.
 */
export const STARTING_CREDITS = 26000;

export function createNewGame(driverName: string): GameState {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: Date.now(),
    credits: STARTING_CREDITS,
    driver: {
      name: driverName || 'A. Driver',
      level: 1,
      bspecPoints: 0,
      totalPoints: 0,
      stats: {
        pace: 42,
        consistency: 38,
        battle: 35,
        smoothness: 40,
        stamina: 45,
        aggression: 45,
      },
    },
    ownedCarIds: [],
    activeCarId: '',
    tuning: {},
    strategies: {},
    career: {},
    achievements: {},
    coachSeen: {},
    history: [],
    invitationals: 0,
    trialMedals: {},
    standaloneResults: {},
    totals: { races: 0, wins: 0, podiums: 0, overtakes: 0 },
    settings: { defaultSpeed: 1, audio: true },
  };
}

export const HISTORY_CAP = 30;

export function pushHistory(gs: GameState, entry: RaceHistoryEntry): void {
  gs.history.unshift(entry);
  if (gs.history.length > HISTORY_CAP) gs.history.length = HISTORY_CAP;
}

/** the remembered strategy for a car, or a sensible default */
export function strategyFor(gs: GameState, carId: string): RaceStrategy {
  return gs.strategies[carId] ?? { ...DEFAULT_STRATEGY };
}

export function rememberStrategy(gs: GameState, carId: string, strategy: RaceStrategy): void {
  gs.strategies[carId] = { ...strategy };
}

export function championshipProgress(gs: GameState, championshipId: string): ChampionshipProgress {
  let p = gs.career[championshipId];
  if (!p) {
    p = { completedEvents: {}, points: {}, finished: false, champion: false };
    gs.career[championshipId] = p;
  }
  return p;
}
