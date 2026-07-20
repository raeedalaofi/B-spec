// Career game state: everything that persists between sessions.

import type { DriverStats } from '../sim/types';

export const SCHEMA_VERSION = 1;

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
  career: Record<string, ChampionshipProgress>;
  totals: { races: number; wins: number; podiums: number; overtakes: number };
  settings: { defaultSpeed: 1 | 2 | 4 };
}

export const STARTING_CREDITS = 15000;

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
      stats: { pace: 42, consistency: 38, battle: 35, smoothness: 40, stamina: 45 },
    },
    ownedCarIds: [],
    activeCarId: '',
    career: {},
    totals: { races: 0, wins: 0, podiums: 0, overtakes: 0 },
    settings: { defaultSpeed: 1 },
  };
}

export function championshipProgress(gs: GameState, championshipId: string): ChampionshipProgress {
  let p = gs.career[championshipId];
  if (!p) {
    p = { completedEvents: {}, points: {}, finished: false, champion: false };
    gs.career[championshipId] = p;
  }
  return p;
}
