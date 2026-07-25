// The intended player path through the career, expressed as data.
//
// Difficulty is only meaningful relative to an assumed player: which car they
// are realistically in, how developed their driver is, and how well they play.
// This file pins those assumptions down so "is this event too hard?" becomes a
// measurable question instead of an argument. The balancing harness and the CI
// guard tests both read it.

import type { DriverStats } from '../sim/types';

export interface WinBand {
  /** inclusive win-rate percentage bounds for the reference player */
  min: number;
  max: number;
}

export interface CareerTier {
  championshipId: string;
  /** the car the player is expected to be in at this point */
  carId: string;
  /** per-event car overrides (the player upgrades mid-championship) */
  perEvent?: Record<string, string>;
  /** driver stats a player arriving here would plausibly have */
  stats: DriverStats;
  /** target win-rate band for the reference "competent" policy */
  band: WinBand;
  /** the final round should be the hardest, not the easiest */
  finaleBand?: WinBand;
}

const s = (
  pace: number,
  consistency: number,
  battle: number,
  smoothness: number,
  stamina: number,
  aggression: number,
): DriverStats => ({ pace, consistency, battle, smoothness, stamina, aggression });

export const CAREER_PATH: CareerTier[] = [
  {
    championshipId: 'sunday-cup',
    carId: 'vulpe',
    stats: s(42, 38, 35, 40, 45, 45),
    // the opener must be winnable — this is the player's first impression
    band: { min: 55, max: 80 },
    finaleBand: { min: 35, max: 60 },
  },
  {
    championshipId: 'clubman',
    carId: 'kite',
    stats: s(58, 52, 46, 50, 50, 52),
    band: { min: 35, max: 65 },
    finaleBand: { min: 25, max: 50 },
  },
  {
    championshipId: 'national',
    carId: 'phantom',
    perEvent: { 'nc-3': 'arrow', 'nc-4': 'arrow', 'nc-5': 'arrow' },
    stats: s(71, 65, 58, 58, 55, 60),
    band: { min: 25, max: 55 },
    // the Grand Final is the hardest race on the core ladder
    finaleBand: { min: 15, max: 35 },
  },
];

export const CAREER_TIER_BY_ID: Record<string, CareerTier> = Object.fromEntries(
  CAREER_PATH.map((t) => [t.championshipId, t]),
);

/** the band an event should land in, accounting for it being a finale */
export function bandFor(tier: CareerTier, eventIndex: number, eventCount: number): WinBand {
  const isFinale = eventIndex === eventCount - 1;
  return isFinale && tier.finaleBand ? tier.finaleBand : tier.band;
}
