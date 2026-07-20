// Traffic model: catching, following (no-ghosting clamp), slipstream,
// overtake attempts, pass resolution and the hard minimum-gap invariant.
//
// Cars race on a 1D arc; battles are resolved between each running car and
// the car physically ahead of it on track. RNG rolls always iterate cars in
// entry order so outcomes are deterministic.

import { BAL } from '../data/balance';
import { positionOf } from './engine';
import { paceIndex } from './pace';
import { rngNext } from './rng';
import type { CarRaceState, OvertakeZone, RaceEvent, RaceState } from './types';

interface Pair {
  follower: CarRaceState;
  leader: CarRaceState;
  /** physical gap on track, meters */
  gapM: number;
  /** approximate time gap, seconds */
  gapS: number;
}

function isRacing(car: CarRaceState): boolean {
  return !car.finished && car.pit === null;
}

/** physical pairs (each running car and the nearest running car ahead) */
function buildPairs(state: RaceState): Pair[] {
  const racing = state.cars.filter(isRacing);
  if (racing.length < 2) return [];
  const L = state.track.lengthM;
  const byS = [...racing].sort((a, b) => a.s - b.s);
  const pairs: Pair[] = [];
  for (let i = 0; i < byS.length; i++) {
    const follower = byS[i];
    const leader = byS[(i + 1) % byS.length];
    if (leader === follower) continue;
    const gapM = (leader.s - follower.s + L) % L;
    // half a lap or more apart is not a battle
    if (gapM > L / 2) continue;
    pairs.push({
      follower,
      leader,
      gapM,
      gapS: gapM / Math.max(follower.speed, 10),
    });
  }
  return pairs;
}

function zoneAt(state: RaceState, s: number): { zone: OvertakeZone; idx: number } | null {
  const zones = state.track.overtakingZones;
  const L = state.track.lengthM;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const span = (z.endS - z.startS + L) % L;
    const into = (s - z.startS + L) % L;
    if (into <= span) return { zone: z, idx: i };
  }
  return null;
}

function onStraight(state: RaceState, s: number): boolean {
  const i =
    Math.floor(((s % state.track.lengthM) + state.track.lengthM) % state.track.lengthM / state.track.sampleStepM) %
    state.track.samples.length;
  return Math.abs(state.track.samples[i].curvature) < 1 / BAL.straightRadiusM;
}

function passProbability(
  state: RaceState,
  att: CarRaceState,
  def: CarRaceState,
  zone: OvertakeZone,
): number {
  const paceDelta = paceIndex(state, att) / Math.max(paceIndex(state, def), 1) - 1;
  const battleDiff = (att.stats.battle - def.stats.battle) / 100;
  const slipHeld = (att.battle?.slipstreamTicks ?? 0) > 10;
  const blocking = def.paceCmd >= 4;
  let p =
    BAL.passBase +
    BAL.passPaceDelta * paceDelta +
    BAL.passBattleDiff * battleDiff +
    (att.overtakeMode ? BAL.passOvertakeMode : 0) +
    (slipHeld ? BAL.passSlipstream : 0) -
    BAL.passZoneDifficulty * zone.difficulty -
    (blocking ? BAL.passBlocking : 0);
  return Math.max(BAL.passMin, Math.min(BAL.passMax, p));
}

/**
 * Adjusts each running car's target speed for traffic and resolves battles.
 * `vTargets` is indexed like `state.cars` and is mutated in place.
 */
export function updateBattles(
  state: RaceState,
  vTargets: Float64Array,
  events: RaceEvent[],
): void {
  const dt = BAL.tickS;
  const idxOf = new Map<string, number>();
  state.cars.forEach((c, i) => idxOf.set(c.carId, i));

  for (const car of state.cars) car.underAttack = false;

  const pairs = buildPairs(state);
  const pairByFollower = new Map<string, Pair>();
  for (const p of pairs) pairByFollower.set(p.follower.carId, p);

  // iterate in entry order for RNG determinism
  for (const car of state.cars) {
    if (!isRacing(car)) {
      car.battle = null;
      continue;
    }
    const pair = pairByFollower.get(car.carId);
    if (!pair) {
      car.battle = null;
      continue;
    }
    const { leader, gapS } = pair;
    const i = idxOf.get(car.carId)!;
    const leaderIdx = idxOf.get(leader.carId)!;
    const raw = vTargets[i];
    const leaderRaw = vTargets[leaderIdx];

    // spun/crawling leader: drive around freely, no train, no state machine
    const leaderEff = Math.max(leader.speed, leaderRaw);
    if (leaderEff < BAL.slowLeaderFrac * raw) {
      if (car.battle?.targetId === leader.carId) car.battle = null;
      continue;
    }

    // out of range → no battle
    if (gapS > BAL.battleCatchingGapS) {
      car.battle = null;
      continue;
    }

    // (re)initialize battle state when the target changes
    if (!car.battle || car.battle.targetId !== leader.carId) {
      car.battle = {
        phase: 'CATCHING',
        targetId: leader.carId,
        passingTimer: 0,
        attemptCooldown: 0,
        lastZoneTried: -1,
        slipstreamTicks: 0,
        penaltyTimer: 0,
        zoneName: '',
      };
    }
    const battle = car.battle;

    // slipstream on straights
    if (
      onStraight(state, car.s) &&
      gapS > BAL.slipstreamMinGapS &&
      gapS < BAL.slipstreamMaxGapS
    ) {
      vTargets[i] *= BAL.slipstreamBoost;
      battle.slipstreamTicks++;
    } else {
      battle.slipstreamTicks = 0;
    }

    if (battle.penaltyTimer > 0) {
      battle.penaltyTimer -= dt;
      vTargets[i] *= BAL.passFailFactor;
    }

    if (battle.phase === 'PASSING') {
      leader.underAttack = true;
      battle.passingTimer -= dt;
      // scripted decisive move: attacker outruns the defender until clear
      vTargets[i] = Math.max(raw, leader.speed * BAL.passingAttackerBoost);
      vTargets[leaderIdx] = Math.min(
        vTargets[leaderIdx],
        leader.speed <= 1 ? vTargets[leaderIdx] : vTargets[leaderIdx] * BAL.passingDefenderLoss,
      );
      const aheadM = (car.s - leader.s + state.track.lengthM) % state.track.lengthM;
      const clear = aheadM >= BAL.passingClearM && aheadM < state.track.lengthM / 2;
      if (clear) {
        completePass(state, car, leader, events);
      } else if (battle.passingTimer <= 0) {
        // force the pass to stick: place the attacker just ahead — unless
        // the teleport would cross the start/finish line (lap counting
        // must only ever happen in advance()); then extend the move.
        const shift =
          (leader.s + BAL.passingClearM - car.s + state.track.lengthM) %
          state.track.lengthM;
        if (car.s + shift < state.track.lengthM) {
          car.s += shift;
          car.totalDist += shift;
          completePass(state, car, leader, events);
        } else {
          battle.passingTimer = 0.5;
        }
      }
      continue;
    }

    // FOLLOWING / CATCHING transitions
    if (gapS <= BAL.battleFollowGapS) {
      if (battle.phase === 'CATCHING') {
        battle.phase = 'FOLLOWING';
        events.push({ type: 'BATTLE_STARTED', carId: car.carId, aheadId: leader.carId });
      }
    } else if (battle.phase === 'FOLLOWING') {
      battle.phase = 'CATCHING';
    }

    if (battle.phase === 'FOLLOWING') {
      leader.underAttack = true;
      // the no-ghosting clamp: at the floor, match the leader's speed
      if (gapS <= BAL.minGapS) {
        vTargets[i] = Math.min(vTargets[i], leader.speed);
      }

      // overtake attempt: one roll per overtaking zone pass
      const z = zoneAt(state, car.s);
      if (z && battle.lastZoneTried !== z.idx) {
        battle.lastZoneTried = z.idx;
        if (battle.attemptCooldown > 0) {
          battle.attemptCooldown--;
        } else {
          const p = passProbability(state, car, leader, z.zone);
          if (rngNext(state) < p) {
            battle.phase = 'PASSING';
            battle.passingTimer = BAL.passingForceResolveS;
            battle.zoneName = z.zone.name;
            car.lane = 1;
          } else {
            battle.penaltyTimer = BAL.passFailDurS;
            battle.attemptCooldown = 1;
            events.push({
              type: 'OVERTAKE_ATTEMPT_FAILED',
              carId: car.carId,
              defenderId: leader.carId,
              zoneName: z.zone.name,
            });
          }
        }
      } else if (!z) {
        // fallback pass: big genuine pace advantage resolves anywhere
        const paceDelta =
          paceIndex(state, car) / Math.max(paceIndex(state, leader), 1) - 1;
        if (
          paceDelta > BAL.fallbackPassAdvantage &&
          gapS <= BAL.minGapS + 0.05 &&
          state.tickCount % 10 === 0
        ) {
          const p = Math.min(0.3, BAL.fallbackPassP * (paceDelta / BAL.fallbackPassAdvantage));
          if (rngNext(state) < p) {
            battle.phase = 'PASSING';
            battle.passingTimer = BAL.passingForceResolveS;
            battle.zoneName = '';
            car.lane = 1;
          }
        }
      }
    }
  }
}

function completePass(
  state: RaceState,
  attacker: CarRaceState,
  defender: CarRaceState,
  events: RaceEvent[],
): void {
  attacker.lane = 0;
  const zoneName = attacker.battle?.zoneName ?? '';
  attacker.battle = null;
  attacker.raceStats.overtakes++;
  defender.raceStats.timesPassed++;
  attacker.morale = Math.min(BAL.moraleMax, attacker.morale + BAL.moraleOvertake);
  defender.morale = Math.max(BAL.moraleMin, defender.morale + BAL.moralePassed);
  events.push({
    type: 'OVERTAKE',
    carId: attacker.carId,
    passedId: defender.carId,
    forPosition: positionOf(state, attacker.carId),
    zoneName,
  });
  // the passed car drops into FOLLOWING with a cooldown before retaliating
  defender.battle = {
    phase: 'FOLLOWING',
    targetId: attacker.carId,
    passingTimer: 0,
    attemptCooldown: 1,
    lastZoneTried: -1,
    slipstreamTicks: 0,
    penaltyTimer: 0,
    zoneName: '',
  };
}

/**
 * Hard invariant, applied after movement: no two running cars may occupy
 * the same piece of road. PASSING pairs and spun/crawling leaders are
 * exempt (those are driven around).
 */
export function enforceGaps(state: RaceState): void {
  const racing = state.cars.filter(isRacing);
  if (racing.length < 2) return;
  const L = state.track.lengthM;
  const byS = [...racing].sort((a, b) => a.s - b.s);
  // two passes so corrections propagate through dense queues
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < byS.length; i++) {
      const follower = byS[i];
      const leader = byS[(i + 1) % byS.length];
      if (leader === follower) continue;
      if (follower.battle?.phase === 'PASSING') continue;
      const gapM = (leader.s - follower.s + L) % L;
      if (gapM > L / 2) continue;
      if (Math.max(leader.speed, 1) < BAL.slowLeaderFrac * Math.max(follower.speed, 1)) continue;
      if (gapM < BAL.minGapM) {
        const shift = BAL.minGapM - gapM;
        // never wrap backwards across the start/finish line — lap counting
        // must only ever happen in advance(); the clamp catches up next tick
        if (follower.s >= shift) {
          follower.s -= shift;
          follower.totalDist -= shift;
        }
        follower.speed = Math.min(follower.speed, leader.speed);
      }
    }
  }
}
