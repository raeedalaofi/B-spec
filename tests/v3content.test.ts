import { describe, expect, it } from 'vitest';
import { AI_BY_ID } from '../src/data/aidrivers';
import { CARS } from '../src/data/cars';
import { CHAMPIONSHIPS } from '../src/data/championships';
import { CATALOG, STANDALONE_BY_ID } from '../src/data/eventCatalog';
import { LICENSE_TRIALS, LICENSES, trialsOf } from '../src/data/licenses';
import { MISSIONS } from '../src/data/missions';
import { getTrackDef, TRACK_COUNT, TRACK_DEFS } from '../src/data/tracks';
import { ppOf } from '../src/state/pp';
import { trialTrackDef } from '../src/state/trials';
import { compileTrack, reverseTrackDef } from '../src/sim/trackCompiler';

describe('v3 track roster', () => {
  it('has 19 circuits', () => {
    expect(TRACK_COUNT).toBe(19);
  });

  it('elevation tracks produce grades the physics can use', () => {
    const kaiserwald = compileTrack(TRACK_DEFS.kaiserwald);
    const maxGrade = Math.max(...kaiserwald.samples.map((s) => Math.abs(s.grade)));
    expect(maxGrade).toBeGreaterThan(0.03);
    expect(maxGrade).toBeLessThan(0.25);
    const flat = compileTrack(TRACK_DEFS.oval);
    expect(Math.max(...flat.samples.map((s) => Math.abs(s.grade)))).toBe(0);
  });

  it('reverse variants resolve and compile', () => {
    const rev = getTrackDef('greenpark-r');
    expect(rev.id).toBe('greenpark-r');
    const track = compileTrack(rev);
    expect(track.overtakingZones.length).toBeGreaterThanOrEqual(1);
    expect(() => reverseTrackDef(TRACK_DEFS.aria)).not.toThrow();
  });
});

describe('event catalog', () => {
  it('every standalone event references valid content', () => {
    for (const event of Object.values(STANDALONE_BY_ID)) {
      expect(() => getTrackDef(event.trackId), event.id).not.toThrow();
      expect(event.aiDriverIds.length, event.id).toBe(7);
      expect(event.aiCarIds.length, event.id).toBe(7);
      for (const d of event.aiDriverIds) expect(AI_BY_ID[d], `${event.id}:${d}`).toBeDefined();
      for (const c of event.aiCarIds) expect(CARS[c], `${event.id}:${c}`).toBeDefined();
      expect(event.prize.length, event.id).toBe(8);
      expect(event.laps, event.id).toBeGreaterThanOrEqual(2);
      // AI machinery must satisfy the class gate the player faces
      for (const c of event.aiCarIds) {
        expect(event.allowedClasses, `${event.id}:${c}`).toContain(CARS[c].class);
      }
    }
  });

  it('PP caps admit the intended stock cars', () => {
    for (const event of CATALOG.trophy) {
      if (!event.ppMax) continue;
      const eligible = Object.values(CARS).filter(
        (c) => event.allowedClasses.includes(c.class) && ppOf(c) <= event.ppMax!,
      );
      expect(eligible.length, event.id).toBeGreaterThan(0);
    }
  });

  it('the game exceeds 200 distinct races and championships', () => {
    const championshipRaces = CHAMPIONSHIPS.reduce((sum, c) => sum + c.events.length, 0);
    const standalone = Object.values(CATALOG).reduce((sum, list) => sum + list.length, 0);
    const races =
      championshipRaces + standalone + LICENSE_TRIALS.length + MISSIONS.length;
    const total = races + CHAMPIONSHIPS.length; // championships as units too
    expect(races).toBeGreaterThan(180);
    expect(total).toBeGreaterThan(200);
  });

  it('generated championships are internally valid', () => {
    for (const champ of CHAMPIONSHIPS) {
      expect(champ.aiDriverIds.length, champ.id).toBe(7);
      for (const ev of champ.events) {
        expect(TRACK_DEFS[ev.trackId], ev.id).toBeDefined();
        expect(ev.aiCarIds.length, ev.id).toBe(7);
      }
      if (champ.requiredCarId) {
        expect(CARS[champ.requiredCarId], champ.id).toBeDefined();
        for (const ev of champ.events) {
          expect(new Set(ev.aiCarIds).size, ev.id).toBe(1); // true one-make
        }
      }
    }
  });
});

describe('licenses', () => {
  it('every license has 4 trials with valid references', () => {
    for (const lic of LICENSES) {
      const trials = trialsOf(lic.id);
      expect(trials.length, lic.id).toBe(4);
      for (const t of trials) {
        expect(CARS[t.carId], t.id).toBeDefined();
        expect(() => trialTrackDef(t), t.id).not.toThrow();
        expect(t.ai.length, t.id).toBeLessThanOrEqual(7);
      }
    }
  });

  it('trial and mission ids are globally unique', () => {
    const ids = [...LICENSE_TRIALS, ...MISSIONS].map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('license prerequisites form a strict chain B→A→IC→IA→S', () => {
    expect(LICENSES.map((l) => l.requires)).toEqual([null, 'b', 'a', 'ic', 'ia']);
  });
});
