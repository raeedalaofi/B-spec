// CI guard tests for race quality and career difficulty.
//
// These are the tests that stop the racing model from silently rotting. They
// assert the properties that make a race feel like a race — that the field
// does not freeze into a queue, that overtake attempts resolve, that playing
// well beats playing badly — rather than asserting specific numbers, which
// would just break on every balance tweak.

import { describe, expect, it } from 'vitest';
import { measureRace, QUALITY_TARGETS, type RaceMetrics } from '../src/sim/metrics';
import { bandFor, CAREER_PATH } from '../src/data/careerPath';
import { CHAMPIONSHIP_BY_ID } from '../src/data/championships';
import { CARS } from '../src/data/cars';
import { PARTS, partPrice } from '../src/data/parts';
import { STARTING_CREDITS } from '../src/state/gameState';
import {
  championshipRace,
  competentPolicy,
  evenRace,
  passivePolicy,
} from '../scripts/fields';

const LAPS: Record<string, number> = { greenpark: 6, oval: 10, aria: 8, kaiserwald: 3 };
const SEEDS = [1, 2, 3, 4, 5];

const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

function sweep(trackId: string): RaceMetrics[] {
  return SEEDS.map((s) => measureRace(evenRace(trackId, LAPS[trackId], s * 7919)));
}

describe('race quality', () => {
  for (const trackId of Object.keys(LAPS)) {
    describe(trackId, () => {
      const runs = sweep(trackId);

      it('does not freeze the field into a nose-to-tail queue', () => {
        // The single most important property: if cars spend their race glued
        // at the minimum gap, nobody can race and the sim is a parade.
        expect(avg(runs.map((r) => r.trainPct))).toBeLessThan(QUALITY_TARGETS.maxTrainPct);
      });

      it('resolves overtake attempts instead of spamming failures', () => {
        const conversion = avg(runs.map((r) => r.conversionPct));
        expect(conversion).toBeGreaterThanOrEqual(QUALITY_TARGETS.minConversionPct);
        // an unrealistically high rate means passing is free, which is just
        // as bad — position would carry no value
        expect(conversion).toBeLessThanOrEqual(QUALITY_TARGETS.maxConversionPct);
      });

      it('keeps identical cars within a plausible lap-time spread', () => {
        expect(avg(runs.map((r) => r.bestLapSpreadS))).toBeLessThan(
          QUALITY_TARGETS.maxBestLapSpreadS,
        );
      });

      it('never forms a permanent freight train', () => {
        expect(avg(runs.map((r) => r.longestTrain))).toBeLessThanOrEqual(
          QUALITY_TARGETS.maxLongestTrain,
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
      const winRates = champ.events.map((event) => {
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
            tier.stats,
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
  it('rewards playing well over leaving it on defaults', () => {
    // If a passive player scores the same as an engaged one, the strategy
    // layer is decoration. This is the test that keeps the game a game.
    const tier = CAREER_PATH[1];
    const champ = CHAMPIONSHIP_BY_ID[tier.championshipId];
    const event = champ.events[0];
    const run = (policy: () => Parameters<typeof measureRace>[1]): number => {
      let sum = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const state = championshipRace(
          event.trackId,
          event.laps,
          seed * 60013,
          champ.aiDriverIds,
          event.aiCarIds,
          tier.carId,
          tier.stats,
        );
        sum += measureRace(state, policy()).result.rows.find((r) => r.isPlayer)!.position;
      }
      return sum / 10;
    };
    const passive = run(passivePolicy as never);
    const competent = run(competentPolicy as never);
    expect(passive - competent).toBeGreaterThan(0.5);
  });
});

describe('career economy', () => {
  it('self-funds the core ladder without grinding', () => {
    let credits = STARTING_CREDITS;
    for (const tier of CAREER_PATH) {
      const champ = CHAMPIONSHIP_BY_ID[tier.championshipId];
      const car = CARS[tier.carId];
      expect(credits, `cannot afford ${car.name} on arrival`).toBeGreaterThanOrEqual(car.priceCr);
      credits -= car.priceCr;
      credits -= PARTS.filter((p) => p.stage === 1).reduce((s, p) => s + partPrice(car, p), 0);
      expect(credits, `${champ.name}: tuning bankrupts the player`).toBeGreaterThanOrEqual(0);
      credits += champ.prize[1] * champ.events.length + champ.titleBonus * 0.5;
    }
  });
});
