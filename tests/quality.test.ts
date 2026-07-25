// CI guard tests for race quality and career difficulty.
//
// These are the tests that stop the racing model from silently rotting. They
// assert the properties that make a race feel like a race — that the field
// does not freeze into a queue, that overtake attempts resolve, that playing
// well beats playing badly — rather than asserting specific numbers, which
// would just break on every balance tweak.

import { describe, expect, it } from 'vitest';
import { measureRace, QUALITY_TARGETS, type RaceMetrics } from '../src/sim/metrics';
import {
  bandFor,
  CAREER_PATH,
  licenceIncomeUpTo,
  statsForEvent,
} from '../src/data/careerPath';
import { CHAMPIONSHIP_BY_ID } from '../src/data/championships';
import { CARS } from '../src/data/cars';
import { buildCost } from '../src/data/parts';
import { STARTING_CREDITS } from '../src/state/gameState';
import {
  championshipRace,
  competentPolicy,
  evenRace,
  POLICIES,
} from '../scripts/fields';

const LAPS: Record<string, number> = { greenpark: 6, oval: 10, aria: 8, kaiserwald: 5 };
const SEEDS = [1, 2, 3, 4, 5];

const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

function sweep(trackId: string): RaceMetrics[] {
  return SEEDS.map((s) => measureRace(evenRace(trackId, LAPS[trackId], s * 7919)));
}

describe('race quality', () => {
  for (const trackId of Object.keys(LAPS)) {
    describe(trackId, () => {
      const runs = sweep(trackId);

      it('does not leave cars stuck behind the same gearbox indefinitely', () => {
        // The single most important property. Cars being close is the goal;
        // cars being close with no move available for minutes on end is the
        // parade this model exists to prevent.
        expect(avg(runs.map((r) => r.stuckPct))).toBeLessThan(QUALITY_TARGETS.maxStuckPct);
        expect(avg(runs.map((r) => r.maxStuckS))).toBeLessThan(QUALITY_TARGETS.maxStuckS);
      });

      it('resolves overtake attempts instead of spamming failures', () => {
        const conversion = avg(runs.map((r) => r.conversionPct));
        expect(conversion).toBeGreaterThanOrEqual(QUALITY_TARGETS.minConversionPct);
        // an unrealistically high rate means passing is free, which is just
        // as bad — position would carry no value
        expect(conversion).toBeLessThanOrEqual(QUALITY_TARGETS.maxConversionPct);
      });

      it('keeps identical cars within a plausible lap-time spread', () => {
        expect(avg(runs.map((r) => r.bestLapSpreadPct))).toBeLessThan(
          QUALITY_TARGETS.maxBestLapSpreadPct,
        );
      });

      it('does not weld the whole field into one queue', () => {
        expect(avg(runs.map((r) => r.bigTrainPct))).toBeLessThan(
          QUALITY_TARGETS.maxBigTrainPct,
        );
      });

      it('still has movement in the final third', () => {
        expect(avg(runs.map((r) => r.lateOvertakes))).toBeGreaterThanOrEqual(
          QUALITY_TARGETS.minLateOvertakes,
        );
      });

      it('produces overtakes at all', () => {
        expect(avg(runs.map((r) => r.passes))).toBeGreaterThan(2);
      });
    });
  }
});

describe('career difficulty curve', () => {
  const N = 12; // enough signal to catch a broken event, fast enough for CI

  for (const tier of CAREER_PATH) {
    const champ = CHAMPIONSHIP_BY_ID[tier.championshipId];

    describe(champ.name, () => {
      const winRates = champ.events.map((event, idx) => {
        const carId = tier.perEvent?.[event.id] ?? tier.carId;
        let wins = 0;
        for (let seed = 1; seed <= N; seed++) {
          const state = championshipRace(
            event.trackId,
            event.laps,
            seed * 60013 + event.id.length,
            champ.aiDriverIds,
            event.aiCarIds,
            carId,
            statsForEvent(tier, idx, champ.events.length),
            tier.parts,
            event.aiParts ?? champ.aiParts ?? [],
          );
          const m = measureRace(state, competentPolicy());
          if (m.result.rows.find((r) => r.isPlayer)!.position === 1) wins++;
        }
        return (100 * wins) / N;
      });

      champ.events.forEach((event, idx) => {
        it(`${event.id} sits inside its target win band`, () => {
          const target = bandFor(tier, idx, champ.events.length);
          // generous CI tolerance: N is small, so allow sampling slop rather
          // than making the suite flaky
          expect(winRates[idx]).toBeGreaterThanOrEqual(Math.max(0, target.min - 20));
          expect(winRates[idx]).toBeLessThanOrEqual(Math.min(100, target.max + 20));
        });
      });

      it('does not make the finale the easiest race of the championship', () => {
        const finale = winRates[winRates.length - 1];
        const earliest = winRates[0];
        expect(finale).toBeLessThanOrEqual(earliest + 15);
      });
    });
  }
});

describe('player agency', () => {
  // If every way of playing scores the same, the strategy layer is
  // decoration. These two tests are what keep it honest: deciding well has
  // to pay, and there must be no single approach that is always right.
  const N = 8;

  const scoresFor = (eventIndex: number, tierIndex: number): number[] => {
    const tier = CAREER_PATH[tierIndex];
    const champ = CHAMPIONSHIP_BY_ID[tier.championshipId];
    const event = champ.events[eventIndex];
    const idx = eventIndex;
    const carId = tier.perEvent?.[event.id] ?? tier.carId;
    return POLICIES.map((policy) => {
      let sum = 0;
      for (let seed = 1; seed <= N; seed++) {
        const state = championshipRace(
          event.trackId,
          event.laps,
          seed * 60013 + event.id.length,
          champ.aiDriverIds,
          event.aiCarIds,
          carId,
          statsForEvent(tier, idx, champ.events.length),
          tier.parts,
          event.aiParts ?? champ.aiParts ?? [],
        );
        sum += measureRace(state, policy.make()).result.rows.find((r) => r.isPlayer)!.position;
      }
      return sum / N;
    });
  };

  it('rewards picking the right approach over leaving the car alone', () => {
    // the championship finale is the race where strategy should matter most
    const tier = CAREER_PATH[2];
    const champ = CHAMPIONSHIP_BY_ID[tier.championshipId];
    const scores = scoresFor(champ.events.length - 1, 2);
    const passive = scores[0];
    const best = Math.min(...scores);
    expect(passive - best).toBeGreaterThan(0.75);
  });

  it('has no single approach that wins every kind of race', () => {
    // a short sprint and a long race should reward different plans
    const sprintScores = scoresFor(0, 0);
    const sprintBest = POLICIES[sprintScores.indexOf(Math.min(...sprintScores))].name;
    const longScores = scoresFor(CHAMPIONSHIP_BY_ID[CAREER_PATH[2].championshipId].events.length - 1, 2);
    const longBest = POLICIES[longScores.indexOf(Math.min(...longScores))].name;
    expect(sprintBest).not.toBe(longBest);
  });
});

describe('career economy', () => {
  it('self-funds the core ladder without grinding', () => {
    // Arriving at a championship should mean arriving able to race it —
    // car and the build the difficulty sweep assumes — out of what the
    // previous tier and its licence trials actually paid.
    let credits = STARTING_CREDITS;
    let licencesHeld: string[] = [];
    for (const tier of CAREER_PATH) {
      const champ = CHAMPIONSHIP_BY_ID[tier.championshipId];
      const car = CARS[tier.carId];
      if (champ.licenseReq && !licencesHeld.includes(champ.licenseReq)) {
        const held = licencesHeld.length
          ? licenceIncomeUpTo(licencesHeld[licencesHeld.length - 1] as never)
          : 0;
        credits += licenceIncomeUpTo(champ.licenseReq) - held;
        licencesHeld = [...licencesHeld, champ.licenseReq];
      }
      const needed = car.priceCr + buildCost(car, tier.parts);
      expect(credits, `cannot afford ${car.name} and its build on arrival`).toBeGreaterThanOrEqual(
        needed,
      );
      credits -= needed;
      credits += champ.prize[1] * champ.events.length + champ.titleBonus * 0.5;
    }
  });
});
