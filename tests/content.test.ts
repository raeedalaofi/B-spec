import { describe, expect, it } from 'vitest';
import { AI_BY_ID } from '../src/data/aidrivers';
import { CARS } from '../src/data/cars';
import { CHAMPIONSHIPS } from '../src/data/championships';
import { TRACK_DEFS } from '../src/data/tracks';
import { compileTrack } from '../src/sim/trackCompiler';
import { buildSpeedProfile } from '../src/sim/speedProfile';

describe('content integrity', () => {
  it('every track compiles with corners and at least one overtaking zone', () => {
    for (const def of Object.values(TRACK_DEFS)) {
      const track = compileTrack(def);
      expect(track.lengthM, def.id).toBeGreaterThan(1000);
      expect(track.corners.length, def.id).toBeGreaterThanOrEqual(2);
      expect(track.overtakingZones.length, def.id).toBeGreaterThanOrEqual(1);
      expect(def.pit.entryT).toBeGreaterThan(def.pit.exitT); // pit spans start/finish
    }
  });

  it('every car has consistent physics and laps every track', () => {
    for (const car of Object.values(CARS)) {
      expect(car.priceCr).toBeGreaterThan(0);
      // top speed achievable: v^3 = P / (m * cDrag) should be >= topSpeed
      const vMax = Math.cbrt((car.powerKw * 1000) / (car.massKg * car.dragCoeff));
      expect(vMax, car.id).toBeGreaterThanOrEqual(car.topSpeedMs * 0.97);
      for (const def of Object.values(TRACK_DEFS)) {
        const { idealLapS } = buildSpeedProfile(compileTrack(def), car);
        expect(idealLapS, `${car.id}@${def.id}`).toBeGreaterThan(30);
        expect(idealLapS, `${car.id}@${def.id}`).toBeLessThan(180);
      }
    }
  });

  it('championships reference valid content and form an unlock chain', () => {
    const champIds = new Set(CHAMPIONSHIPS.map((c) => c.id));
    for (const champ of CHAMPIONSHIPS) {
      expect(champ.aiDriverIds.length).toBe(7);
      for (const id of champ.aiDriverIds) expect(AI_BY_ID[id], id).toBeDefined();
      expect(champ.prize.length).toBe(8);
      expect(champ.events.length).toBeGreaterThanOrEqual(3);
      if (champ.unlockAfter) expect(champIds.has(champ.unlockAfter)).toBe(true);
      for (const ev of champ.events) {
        expect(TRACK_DEFS[ev.trackId], ev.id).toBeDefined();
        expect(ev.aiCarIds.length, ev.id).toBe(7);
        for (const carId of ev.aiCarIds) expect(CARS[carId], carId).toBeDefined();
        // AI machinery must match the championship's class gate
        for (const carId of ev.aiCarIds) {
          expect(champ.allowedClasses, `${ev.id}:${carId}`).toContain(CARS[carId].class);
        }
      }
    }
  });

  it('fuel tanks cover at least a third of the longest race', () => {
    for (const champ of CHAMPIONSHIPS) {
      for (const ev of champ.events) {
        const def = TRACK_DEFS[ev.trackId];
        for (const carId of ev.aiCarIds) {
          const car = CARS[carId];
          const lapsOnTank = car.fuelTankL / (def.fuelBase * car.fuelMult);
          expect(lapsOnTank, `${ev.id}:${carId}`).toBeGreaterThan(ev.laps / 3);
        }
      }
    }
  });
});
