// The intended player path through the career, expressed as data.
//
// Difficulty is only meaningful relative to an assumed player: which car they
// are realistically in, how developed their driver is, and how well they play.
// This file pins those assumptions down so "is this event too hard?" becomes a
// measurable question instead of an argument. The balancing harness and the CI
// guard tests both read it.

import { LICENSE_TRIALS, LICENSES, type LicenseId } from './licenses';
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
  /**
   * Stats by the final round. A player does not arrive at a championship and
   * stay still — they level up across it — so measuring every round against
   * the entry-level driver makes the later rounds look far harder than they
   * actually play.
   */
  endStats: DriverStats;
  /**
   * Parts the reference player would have bought by now. A stock car is not
   * what anyone actually races: prize money goes into the garage, and
   * measuring difficulty against an untuned car overstates it badly by the
   * upper categories.
   */
  parts: string[];
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
    endStats: s(52, 46, 43, 46, 50, 50),
    // fresh out of the dealership with nothing left over
    parts: [],
    // the opener must be winnable — this is the player's first impression
    band: { min: 55, max: 80 },
    finaleBand: { min: 35, max: 60 },
  },
  {
    championshipId: 'clubman',
    carId: 'kite',
    stats: s(58, 52, 46, 50, 50, 52),
    endStats: s(68, 61, 55, 57, 55, 59),
    parts: ['power-1', 'tires-1', 'weight-1'],
    band: { min: 35, max: 65 },
    finaleBand: { min: 25, max: 50 },
  },
  {
    championshipId: 'national',
    carId: 'phantom',
    perEvent: { 'nc-3': 'arrow', 'nc-4': 'arrow', 'nc-5': 'arrow' },
    stats: s(71, 65, 58, 58, 55, 60),
    endStats: s(81, 74, 68, 65, 61, 68),
    parts: ['power-2', 'tires-2', 'weight-2', 'aero-1', 'gearbox-1'],
    // The top flight should not be dominated. Winning one National round in
    // three is a good season here, and the title is decided on consistency
    // rather than on turning up.
    band: { min: 20, max: 50 },
    // the Grand Final is the hardest race on the core ladder
    finaleBand: { min: 12, max: 32 },
  },
];

/**
 * Credits a player banks on the way to a licence, counted at silver. The
 * upper championships are licence-gated, so this income is not optional
 * side-content — it is part of the intended path, and leaving it out of the
 * economy makes the ladder look unaffordable when it is not.
 */
export function licenceIncomeUpTo(licenseId: LicenseId): number {
  const chain: LicenseId[] = [];
  let cursor: LicenseId | null = licenseId;
  while (cursor) {
    chain.push(cursor);
    cursor = LICENSES.find((l) => l.id === cursor)?.requires ?? null;
  }
  return LICENSE_TRIALS.filter((t) => t.licenseId && chain.includes(t.licenseId)).reduce(
    (sum, t) => sum + t.rewardCr[1],
    0,
  );
}

export const CAREER_TIER_BY_ID: Record<string, CareerTier> = Object.fromEntries(
  CAREER_PATH.map((t) => [t.championshipId, t]),
);

/** the driver a player would plausibly be by round `idx` of this tier */
export function statsForEvent(tier: CareerTier, idx: number, count: number): DriverStats {
  const t = count > 1 ? idx / (count - 1) : 0;
  const lerp = (a: number, b: number): number => Math.round(a + (b - a) * t);
  return {
    pace: lerp(tier.stats.pace, tier.endStats.pace),
    consistency: lerp(tier.stats.consistency, tier.endStats.consistency),
    battle: lerp(tier.stats.battle, tier.endStats.battle),
    smoothness: lerp(tier.stats.smoothness, tier.endStats.smoothness),
    stamina: lerp(tier.stats.stamina, tier.endStats.stamina),
    aggression: lerp(tier.stats.aggression, tier.endStats.aggression),
  };
}

/** the band an event should land in, accounting for it being a finale */
export function bandFor(tier: CareerTier, eventIndex: number, eventCount: number): WinBand {
  const isFinale = eventIndex === eventCount - 1;
  return isFinale && tier.finaleBand ? tier.finaleBand : tier.band;
}
