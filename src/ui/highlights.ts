// Post-race highlight reel, built from the simulation's own event log.
//
// The sim already emits a complete typed record of everything that happened
// in a race, which means the reel is a filter rather than a second system:
// there is no separate bookkeeping to drift out of sync with the race that
// was actually run. What it adds is a story — races are long, and without
// this the player is handed a results table and asked to remember the rest.

import type { RaceEvent, RaceState } from '../sim/types';

export interface Highlight {
  /** race clock, seconds */
  atS: number;
  lap: number;
  text: string;
  /** how much this deserves to be in the reel */
  weight: number;
  tone: 'good' | 'bad' | 'neutral';
}

function driverName(state: RaceState, carId: string): string {
  return state.cars.find((c) => c.carId === carId)?.driverName ?? carId;
}

function leaderLap(state: RaceState): number {
  return Math.max(1, ...state.cars.map((c) => c.lap));
}

/**
 * Decides whether an event is worth remembering, and how much. Weighting is
 * deliberately player-centric: a fight for the lead matters, and anything
 * involving the player's car matters more.
 */
export function highlightFor(
  state: RaceState,
  e: RaceEvent,
  playerId: string,
): Highlight | null {
  const atS = state.raceTime;
  const lap = leaderLap(state);
  const involves = (id: string): boolean => id === playerId;

  switch (e.type) {
    case 'OVERTAKE': {
      // passes for the lead and passes involving the player are the reel
      const forLead = e.forPosition === 1;
      const mine = involves(e.carId);
      const onMe = involves(e.passedId);
      if (!forLead && !mine && !onMe && e.forPosition > 4) return null;
      return {
        atS,
        lap,
        text: `${driverName(state, e.carId)} takes P${e.forPosition} from ${driverName(state, e.passedId)}${e.zoneName ? ` at ${e.zoneName}` : ''}`,
        weight: (forLead ? 6 : 2) + (mine ? 4 : 0) + (onMe ? 3 : 0),
        tone: mine ? 'good' : onMe ? 'bad' : 'neutral',
      };
    }
    case 'CONTACT':
      return {
        atS,
        lap,
        text: `${driverName(state, e.carId)} and ${driverName(state, e.otherId)} make contact`,
        weight: (e.severity === 'heavy' ? 6 : 3) + (involves(e.carId) || involves(e.otherId) ? 3 : 0),
        tone: involves(e.carId) || involves(e.otherId) ? 'bad' : 'neutral',
      };
    case 'MISTAKE':
      if (e.severity === 'minor') return null;
      return {
        atS,
        lap,
        text:
          e.severity === 'spin'
            ? `${driverName(state, e.carId)} spins at ${e.cornerName}`
            : `${driverName(state, e.carId)} has a moment at ${e.cornerName}`,
        weight: (e.severity === 'spin' ? 5 : 2) + (involves(e.carId) ? 3 : 0),
        tone: involves(e.carId) ? 'bad' : 'neutral',
      };
    case 'RETIREMENT':
      return {
        atS,
        lap,
        text: `${driverName(state, e.carId)} retires`,
        weight: 6 + (involves(e.carId) ? 4 : 0),
        tone: involves(e.carId) ? 'bad' : 'neutral',
      };
    case 'CAUTION_START':
      return { atS, lap, text: `Safety car — ${e.cause}`, weight: 7, tone: 'neutral' };
    case 'PIT_OUT':
      if (!involves(e.carId)) return null;
      return {
        atS,
        lap,
        text: `You stop for ${e.stopTimeS.toFixed(1)}s`,
        weight: 3,
        tone: 'neutral',
      };
    case 'LAP_COMPLETE':
      if (!e.isRaceFastest || e.lap <= 1) return null;
      return {
        atS,
        lap,
        text: `Fastest lap — ${driverName(state, e.carId)}`,
        weight: involves(e.carId) ? 5 : 2,
        tone: involves(e.carId) ? 'good' : 'neutral',
      };
    case 'FINISH':
      if (e.position !== 1 && !involves(e.carId)) return null;
      return {
        atS,
        lap,
        text:
          e.position === 1
            ? `${driverName(state, e.carId)} wins`
            : `You finish P${e.position}`,
        weight: 9,
        tone: involves(e.carId) && e.position <= 3 ? 'good' : 'neutral',
      };
    default:
      return null;
  }
}

/**
 * The reel itself: the most significant moments, back in race order. Sorted
 * by weight to pick them and by time to show them, so the reel reads as a
 * story rather than a ranking.
 */
export function buildReel(all: Highlight[], max = 7): Highlight[] {
  return [...all]
    .sort((a, b) => b.weight - a.weight || a.atS - b.atS)
    .slice(0, max)
    .sort((a, b) => a.atS - b.atS);
}
