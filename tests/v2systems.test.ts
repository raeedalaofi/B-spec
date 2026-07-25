import { describe, expect, it } from 'vitest';
import { CARS } from '../src/data/cars';
import { generateInvitational } from '../src/data/invitationals';
import {
  activeParts,
  nextPartInCategory,
  PART_BY_ID,
  partPrice,
  tunedSpec,
} from '../src/data/parts';
import { TRACK_DEFS } from '../src/data/tracks';
import { ACHIEVEMENTS, evaluateAchievements } from '../src/state/achievements';
import { createNewGame, SCHEMA_VERSION } from '../src/state/gameState';
import { migrate } from '../src/state/migrations';
import { applyInvitationalResult } from '../src/state/progression';
import { buildSpeedProfile } from '../src/sim/speedProfile';
import { compileTrack } from '../src/sim/trackCompiler';
import type { RaceResult, RaceResultRow } from '../src/sim/types';

describe('tuning', () => {
  it('parts improve the effective spec', () => {
    const base = CARS.vulpe;
    const tuned = tunedSpec(base, ['power-1', 'weight-1', 'tires-1']);
    expect(tuned.powerKw).toBeGreaterThan(base.powerKw);
    expect(tuned.massKg).toBeLessThan(base.massKg);
    expect(tuned.grip).toBeGreaterThan(base.grip);
    expect(tuned.tireWearMult).toBeGreaterThan(base.tireWearMult);
  });

  it('only the highest stage per category applies', () => {
    const one = tunedSpec(CARS.vulpe, ['power-2']);
    const both = tunedSpec(CARS.vulpe, ['power-1', 'power-2']);
    expect(both.powerKw).toBe(one.powerKw);
  });

  it('stages must be bought in order', () => {
    expect(nextPartInCategory('power', [])!.id).toBe('power-1');
    expect(nextPartInCategory('power', ['power-1'])!.id).toBe('power-2');
    expect(nextPartInCategory('power', ['power-1', 'power-2', 'power-3'])).toBeNull();
    expect(nextPartInCategory('aero', ['aero-1'])).toBeNull();
  });

  it('a fully tuned car laps meaningfully faster', () => {
    const track = compileTrack(TRACK_DEFS.greenpark);
    const stock = buildSpeedProfile(track, CARS.vulpe).idealLapS;
    const allParts = Object.keys(PART_BY_ID);
    const built = buildSpeedProfile(track, tunedSpec(CARS.vulpe, allParts)).idealLapS;
    expect(built).toBeLessThan(stock - 2); // multiple seconds a lap
    expect(built).toBeGreaterThan(stock * 0.85); // but not absurd
  });

  it('part prices scale with car price', () => {
    const p = PART_BY_ID['power-1'];
    expect(partPrice(CARS.arrow, p)).toBeGreaterThan(partPrice(CARS.kestrel, p));
  });

  it('activeParts picks one per category', () => {
    const parts = activeParts(['power-1', 'power-2', 'tires-1']);
    expect(parts.length).toBe(2);
  });
});

describe('save migrations', () => {
  it('upgrades a v1 save to the current schema', () => {
    const v1 = {
      schemaVersion: 1,
      createdAt: 123,
      credits: 5000,
      driver: {
        name: 'Old Save',
        level: 3,
        bspecPoints: 10,
        totalPoints: 100,
        stats: { pace: 50, consistency: 50, battle: 50, smoothness: 50, stamina: 50, aggression: 50 },
      },
      ownedCarIds: ['vulpe'],
      activeCarId: 'vulpe',
      career: {},
      totals: { races: 4, wins: 1, podiums: 2, overtakes: 9 },
      settings: { defaultSpeed: 2 },
    };
    const gs = migrate(v1 as never, SCHEMA_VERSION);
    expect(gs.schemaVersion).toBe(SCHEMA_VERSION);
    expect(gs.tuning).toEqual({});
    expect(gs.achievements).toEqual({});
    expect(gs.history).toEqual([]);
    expect(gs.invitationals).toBe(0);
    expect(gs.settings.audio).toBe(true);
    expect(gs.settings.defaultSpeed).toBe(2);
    expect(gs.driver.name).toBe('Old Save');
  });
});

function fakeRow(overrides: Partial<RaceResultRow>): RaceResultRow {
  return {
    carId: 'player',
    driverName: 'T',
    carName: 'Test',
    isPlayer: true,
    position: 1,
    gapS: 0,
    lapsDown: 0,
    bestLapS: 70,
    overtakes: 3,
    mistakes: 0,
    pitStops: 0,
    fastestLap: false,
    ...overrides,
  };
}

describe('achievements', () => {
  it('unlocks purchase and race milestones once', () => {
    const gs = createNewGame('T');
    gs.ownedCarIds.push('vulpe');
    let unlocked = evaluateAchievements(gs, { type: 'purchase' });
    expect(unlocked.map((a) => a.id)).toContain('first-steps');
    unlocked = evaluateAchievements(gs, { type: 'purchase' });
    expect(unlocked.length).toBe(0); // no double unlocks
  });

  it('detects a win with pit stop (strategist)', () => {
    const gs = createNewGame('T');
    const result: RaceResult = {
      trackId: 'greenpark',
      laps: 5,
      rows: [fakeRow({ position: 1, pitStops: 1 })],
    };
    const unlocked = evaluateAchievements(gs, { type: 'race', result, gridSlot: 8 });
    expect(unlocked.map((a) => a.id)).toContain('strategist');
    expect(unlocked.map((a) => a.id)).toContain('charger');
  });

  it('all achievement ids are unique', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('invitational series', () => {
  it('generates deterministic, valid events', () => {
    for (let n = 0; n < 12; n++) {
      const a = generateInvitational(n);
      const b = generateInvitational(n);
      expect(a).toEqual(b);
      expect(TRACK_DEFS[a.trackId]).toBeDefined();
      expect(a.aiDriverIds.length).toBe(7);
      expect(a.aiCarIds.length).toBe(7);
      expect(a.laps).toBeGreaterThanOrEqual(10);
      expect(a.prize.length).toBe(8);
    }
  });

  it('prizes scale with the streak', () => {
    expect(generateInvitational(8).prize[0]).toBeGreaterThan(generateInvitational(0).prize[0]);
  });

  it('applyInvitationalResult pays out and records history', () => {
    const gs = createNewGame('T');
    const inv = generateInvitational(0);
    const result: RaceResult = {
      trackId: inv.trackId,
      laps: inv.laps,
      rows: [fakeRow({ position: 1, overtakes: 4 })],
    };
    const before = gs.credits;
    const rewards = applyInvitationalResult(gs, inv, result, 8);
    expect(gs.credits).toBe(before + inv.prize[0]);
    expect(rewards.pointsEarned).toBeGreaterThan(0);
    expect(gs.invitationals).toBe(1);
    expect(gs.history.length).toBe(1);
    expect(gs.history[0].series).toBe('Invitational Series');
  });
});
