// The racing model: traffic, dirty air, slipstream, side-by-side moves and
// the no-overlap invariant.
//
// The design rule here is that nothing about a pass is decided by a die roll.
// A follower loses corner grip in the wake of the car ahead and gains speed
// in its slipstream on the straights; when a driver decides the move is on it
// pulls out of line, and from that point the outcome is settled by the ground
// the two cars actually take off each other. RNG only ever decides *whether a
// driver tries* — never whether trying works.
//
// This matters because the obvious alternative (clamp the follower to the
// leader's speed, roll a die per overtaking zone) produces a field welded
// nose-to-tail: the clamp propagates backwards through the queue until every
// car runs at the pace of the slowest one, and no amount of tuning the die
// gets the racing back.

import { BAL } from '../data/balance';
import { positionOf } from './engine';
import { orderSpec, paceIndex } from './pace';
import { rngNext } from './rng';
import type {
  CarRaceState,
  OvertakeZone,
  PassSide,
  RaceEvent,
  RaceState,
} from './types';

interface Pair {
  follower: CarRaceState;
  leader: CarRaceState;
  /** physical gap along the road, meters (nose to tail) */
  gapM: number;
  /** approximate time gap, seconds */
  gapS: number;
}

function isRacing(car: CarRaceState): boolean {
  return !car.finished && car.pit === null;
}

/** cars are on the same line when their lateral positions overlap */
function sameLine(a: CarRaceState, b: CarRaceState): boolean {
  return Math.abs(a.lateral - b.lateral) < BAL.lateralOverlap;
}

/** gap from one specific car to another, as a Pair */
function makePair(state: RaceState, follower: CarRaceState, leader: CarRaceState): Pair {
  const L = state.track.lengthM;
  const gapM = (leader.s - follower.s + L) % L;
  return { follower, leader, gapM, gapS: gapM / Math.max(follower.speed, 10) };
}

/** physical pairs: each running car and the nearest running car ahead */
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
    if (gapM > L / 2) continue; // half a lap or more apart is not a battle
    pairs.push({ follower, leader, gapM, gapS: gapM / Math.max(follower.speed, 10) });
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

function sampleAt(state: RaceState, s: number) {
  const L = state.track.lengthM;
  const i =
    Math.floor((((s % L) + L) % L) / state.track.sampleStepM) % state.track.samples.length;
  return state.track.samples[i];
}

function onStraight(state: RaceState, s: number): boolean {
  return Math.abs(sampleAt(state, s).curvature) < 1 / BAL.straightRadiusM;
}

/**
 * How badly a driver wants to have a go, per second. Aggression sets the
 * appetite, pace advantage sets the opportunity, and the corner's difficulty
 * sets the price. Note this decides only whether the car pulls out of line.
 */
function commitRateHz(
  state: RaceState,
  att: CarRaceState,
  def: CarRaceState,
  zone: OvertakeZone | null,
): number {
  const advantage = paceIndex(state, att) / Math.max(paceIndex(state, def), 1) - 1;
  if (advantage < BAL.commitMinAdvantage) return 0;

  const aggression = att.stats.aggression / 100;
  let rate =
    BAL.commitBaseRateHz *
    (0.35 + BAL.commitAggressionScale * aggression) *
    // a genuine pace edge makes a move look far more attractive
    (1 + Math.max(0, advantage) * 14);

  if (zone) {
    rate *= Math.max(0.15, 1 - BAL.commitZoneDifficulty * zone.difficulty);
  } else {
    // moves away from a braking zone are rare but not impossible
    rate *= BAL.commitOffZoneScale;
  }
  if (att.overtakeMode) rate *= BAL.overtakeModeCommitScale;
  // the standing order is the player's thumb on this scale
  rate *= orderSpec(att).commitScale;
  // a driver on dead tires or low on morale is not going to try anything
  rate *= 0.4 + 0.6 * att.morale;
  if (att.tireWear > 0.85) rate *= 0.5;
  return rate;
}

/** the defender's response, driven by their racecraft and appetite for a fight */
function chooseDefence(def: CarRaceState, att: CarRaceState): 'cover' | 'concede' {
  const scale = orderSpec(def).defendScale;
  if (scale <= 0) return 'concede'; // ordered to wave them through
  const willFight = (def.stats.battle * 0.6 + def.stats.aggression * 0.4) * scale;
  const threat = att.stats.battle * 0.5 + att.stats.aggression * 0.5;
  // a driver who knows they are beaten gives the place up rather than losing
  // more time fighting for it
  if (def.tireWear > 0.9 || def.damage > 0.4) return 'concede';
  return willFight >= threat - 12 ? 'cover' : 'concede';
}

/**
 * Adjusts each running car's target speed for traffic and advances every
 * battle. `vTargets` is indexed like `state.cars` and is mutated in place.
 */
export function updateBattles(
  state: RaceState,
  vTargets: Float64Array,
  events: RaceEvent[],
): void {
  const dt = BAL.tickS;
  const L = state.track.lengthM;
  const idxOf = new Map<string, number>();
  state.cars.forEach((c, i) => idxOf.set(c.carId, i));

  for (const car of state.cars) {
    car.underAttack = false;
    car.defence = 'none';
    car.dirtyAir = 1;
    // by default every car drifts back toward the racing line
    car.lateralTarget = 0;
  }

  const pairs = buildPairs(state);
  const pairByFollower = new Map<string, Pair>();
  for (const p of pairs) pairByFollower.set(p.follower.carId, p);

  // Under caution nobody races: the field circulates and bunches up.
  if (state.caution) {
    applyCaution(state, vTargets, pairByFollower);
    settleLateral(state, dt);
    return;
  }

  // iterate in entry order so RNG draws stay deterministic
  for (const car of state.cars) {
    if (!isRacing(car)) {
      car.battle = null;
      continue;
    }
    if (car.battle && car.battle.commitCooldown > 0) car.battle.commitCooldown -= dt;

    // Once a driver has committed, the move is resolved against *that* car
    // until it ends. Re-deriving the target from track order every tick looks
    // reasonable but is fatal: two cars running side by side swap places in
    // that order constantly, which silently destroys the move mid-overtake.
    const committedTarget =
      car.battle?.phase === 'COMMITTED'
        ? (state.cars.find((c) => c.carId === car.battle!.targetId) ?? null)
        : null;
    const pair = committedTarget
      ? makePair(state, car, committedTarget)
      : (pairByFollower.get(car.carId) ?? null);
    if (!pair || !isRacing(pair.leader)) {
      if (car.battle) car.battle.phase = 'CATCHING';
      car.battle = null;
      continue;
    }
    const { leader, gapS } = pair;
    const i = idxOf.get(car.carId)!;
    const leaderIdx = idxOf.get(leader.carId)!;
    const raw = vTargets[i];

    // A spun or crawling car is an obstacle, not a rival: drive around it.
    const leaderEff = Math.max(leader.speed, vTargets[leaderIdx]);
    if (!committedTarget && leaderEff < BAL.slowLeaderFrac * raw) {
      if (car.battle?.targetId === leader.carId) car.battle = null;
      // ease out to whichever side has more room and press on
      car.lateralTarget = leader.lateral >= 0 ? -BAL.lateralPassLine : BAL.lateralPassLine;
      continue;
    }

    if (!committedTarget && gapS > BAL.battleCatchingGapS) {
      car.battle = null;
      continue;
    }

    // (re)initialise when the car ahead changes
    if (!car.battle || car.battle.targetId !== leader.carId) {
      const cooldown = car.battle?.commitCooldown ?? 0;
      car.battle = {
        phase: 'CATCHING',
        targetId: leader.carId,
        committedS: 0,
        commitCooldown: cooldown,
        side: 1,
        startGapM: 0,
        slipstreamS: 0,
        zoneName: '',
        bestOverlap: 0,
      };
    }
    const battle = car.battle;
    const straight = onStraight(state, car.s);

    // --- aerodynamics ------------------------------------------------------
    // On the straights the follower is towed along; in the corners it is
    // starved of grip. Together these produce the real shape of following:
    // close up on the straight, struggle to stay attached through the turns.
    if (straight && gapS > BAL.slipstreamMinGapS && gapS < BAL.slipstreamMaxGapS) {
      const strength = 1 - (gapS - BAL.slipstreamMinGapS) / BAL.slipstreamMaxGapS;
      vTargets[i] *= 1 + (BAL.slipstreamBoost - 1) * Math.max(0, strength);
      battle.slipstreamS += dt;
    } else {
      battle.slipstreamS = 0;
    }
    if (!straight && gapS < BAL.dirtyAirGapS && sameLine(car, leader)) {
      const closeness = 1 - gapS / BAL.dirtyAirGapS;
      car.dirtyAir = 1 - BAL.dirtyAirMaxLoss * closeness;
    }

    // --- an active move ----------------------------------------------------
    if (battle.phase === 'COMMITTED') {
      leader.underAttack = true;
      battle.committedS += dt;
      car.raceStats.sideBySideS += dt;
      leader.raceStats.sideBySideS += dt;
      car.lateralTarget = BAL.lateralPassLine * battle.side;

      const defence = chooseDefence(leader, car);
      leader.defence = defence;
      if (defence === 'cover') {
        // cover the line the attacker went for; costs the defender exit speed
        leader.lateralTarget = BAL.lateralPassLine * battle.side * 0.72;
        vTargets[leaderIdx] *= BAL.committedDefenderLoss;
      } else {
        // conceding is a real decision with a real cost: the defender lifts
        // and takes the wide line rather than risk losing more than a place
        leader.lateralTarget = -BAL.lateralPassLine * battle.side * 0.5;
        vTargets[leaderIdx] *= BAL.committedConcedeLoss;
      }

      // The attacker leans on the momentum it carried into the move; both
      // cars pay the off-line grip cost through pace.ts.
      vTargets[i] = Math.max(vTargets[i], leader.speed * BAL.committedAttackerBoost);

      // overlap: how far the attacker's nose is up the defender's side
      const aheadM = (car.s - leader.s + L) % L;
      const behindM = (leader.s - car.s + L) % L;
      const overlap =
        aheadM < L / 2 ? 1 + aheadM / BAL.carLengthM : 1 - behindM / BAL.carLengthM;
      if (overlap > battle.bestOverlap) battle.bestOverlap = overlap;

      rollContact(state, car, leader, events);
      if (!car.battle) continue; // contact ended the move

      if (aheadM >= BAL.passingClearM && aheadM < L / 2) {
        completePass(state, car, leader, events);
        continue;
      }
      // Judged against where the move started, not an absolute distance —
      // and only while the attacker is genuinely still behind. `behindM`
      // wraps to nearly a full lap the instant the nose gets in front.
      const trulyBehind = behindM < L / 2;
      if (
        (trulyBehind && behindM > battle.startGapM + BAL.passAbandonM) ||
        battle.committedS > BAL.commitMaxS
      ) {
        abandonMove(car, leader, events);
        continue;
      }
      continue;
    }

    // --- catching / following ---------------------------------------------
    if (gapS <= BAL.battleFollowGapS) {
      if (battle.phase === 'CATCHING') {
        battle.phase = 'FOLLOWING';
        events.push({ type: 'BATTLE_STARTED', carId: car.carId, aheadId: leader.carId });
      }
    } else if (battle.phase === 'FOLLOWING') {
      battle.phase = 'CATCHING';
    }

    if (battle.phase !== 'FOLLOWING') continue;
    leader.underAttack = true;

    // Same-line proximity limit. Crucially this only applies while the
    // follower is actually behind the leader on the same line — pull out and
    // it lifts, which is what stops the clamp welding the field together.
    if (sameLine(car, leader) && gapS <= BAL.minGapS) {
      vTargets[i] = Math.min(vTargets[i], leader.speed);
      // sitting in the mirrors, looking for a way past
      car.lateralTarget = 0.28 * preferredSide(state, car, leader);
    }

    if (battle.commitCooldown > 0) continue;
    // a driver only pulls out from striking distance — lunging from a car
    // length back is how you end up with a race full of failed lunges
    if (gapS > BAL.commitMaxGapS) continue;
    const z = zoneAt(state, car.s);
    const rate = commitRateHz(state, car, leader, z?.zone ?? null);
    if (rate <= 0) continue;
    // rate → per-tick probability; the only RNG in the whole pass model
    if (rngNext(state) >= 1 - Math.exp(-rate * dt)) continue;

    battle.phase = 'COMMITTED';
    battle.committedS = 0;
    battle.bestOverlap = 0;
    battle.startGapM = pair.gapM;
    battle.side = preferredSide(state, car, leader);
    battle.zoneName = z?.zone.name ?? '';
    car.raceStats.movesAttempted++;
    events.push({
      type: 'SIDE_BY_SIDE',
      carId: car.carId,
      defenderId: leader.carId,
      zoneName: battle.zoneName,
      forPosition: positionOf(state, leader.carId),
    });
  }

  settleLateral(state, dt);
}

/** the inside of the coming corner if there is room, otherwise the other side */
function preferredSide(
  state: RaceState,
  att: CarRaceState,
  def: CarRaceState,
): PassSide {
  const k = sampleAt(state, att.s).curvature;
  // curvature sign gives the corner direction; the inside is the short way round
  const inside: PassSide = k >= 0 ? 1 : -1;
  // if the defender is already sitting on the inside, go the long way
  return def.lateral * inside > 0.4 ? ((-inside) as PassSide) : inside;
}

/** move every car toward its lateral target at a bounded rate */
function settleLateral(state: RaceState, dt: number): void {
  const step = BAL.lateralRate * dt;
  for (const car of state.cars) {
    if (car.finished) continue;
    if (car.pit) {
      car.lateral = -1.4; // parked out in the pit lane
      continue;
    }
    const d = car.lateralTarget - car.lateral;
    car.lateral += Math.abs(d) <= step ? d : Math.sign(d) * step;
    car.lateral = Math.max(-1, Math.min(1, car.lateral));
  }
}

/** wheel-to-wheel racing occasionally ends in contact */
function rollContact(
  state: RaceState,
  att: CarRaceState,
  def: CarRaceState,
  events: RaceEvent[],
): void {
  if (att.mistake || def.mistake) return;
  const clumsiness =
    (1 - att.stats.smoothness / 100) * 0.6 + (1 - def.stats.smoothness / 100) * 0.4;
  const rate =
    BAL.contactBaseRateHz *
    (0.4 + BAL.contactSmoothnessScale * clumsiness) *
    (0.5 + (att.stats.aggression / 100) * 1.2);
  if (rngNext(state) >= 1 - Math.exp(-rate * BAL.tickS)) return;

  const heavy = rngNext(state) < BAL.contactHeavyP;
  const severity = heavy ? 'heavy' : 'light';
  const dmg = heavy ? BAL.contactHeavyDamage : BAL.contactLightDamage;
  const factor = heavy ? BAL.contactHeavyFactor : BAL.contactLightFactor;
  const durS = heavy ? BAL.contactHeavyDurS : BAL.contactLightDurS;
  for (const car of [att, def]) {
    car.damage = Math.min(1, car.damage + dmg);
    car.mistake = { factor, timer: durS, severity: heavy ? 'major' : 'minor' };
    car.morale = Math.max(BAL.moraleMin, car.morale - (heavy ? 0.05 : 0.02));
  }
  events.push({ type: 'CONTACT', carId: att.carId, otherId: def.carId, severity });
  // the attacker's move is over either way
  att.battle = null;
  att.raceStats.mistakes++;
}

function completePass(
  state: RaceState,
  attacker: CarRaceState,
  defender: CarRaceState,
  events: RaceEvent[],
): void {
  const zoneName = attacker.battle?.zoneName ?? '';
  attacker.battle = null;
  attacker.lateralTarget = 0;
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
  // the passed car may fight back, but not instantly
  defender.battle = {
    phase: 'FOLLOWING',
    targetId: attacker.carId,
    committedS: 0,
    commitCooldown: BAL.counterCooldownS,
    side: 1,
    startGapM: 0,
    slipstreamS: 0,
    zoneName: '',
    bestOverlap: 0,
  };
}

function abandonMove(
  attacker: CarRaceState,
  defender: CarRaceState,
  events: RaceEvent[],
): void {
  const battle = attacker.battle!;
  events.push({
    type: 'OVERTAKE_ATTEMPT_FAILED',
    carId: attacker.carId,
    defenderId: defender.carId,
    zoneName: battle.zoneName,
  });
  battle.phase = 'FOLLOWING';
  battle.commitCooldown = BAL.commitCooldownS;
  battle.committedS = 0;
  attacker.lateralTarget = 0;
}

/** neutralised running: hold station, close up on the car ahead */
function applyCaution(
  state: RaceState,
  vTargets: Float64Array,
  pairByFollower: Map<string, Pair>,
): void {
  state.cars.forEach((car, i) => {
    if (!isRacing(car)) return;
    car.battle = null;
    vTargets[i] *= BAL.cautionSpeedFrac;
    const pair = pairByFollower.get(car.carId);
    if (!pair) return;
    // ease toward the target spacing rather than snapping to it
    const err = pair.gapS - BAL.cautionSpacingS;
    vTargets[i] *= 1 + Math.max(-0.25, Math.min(0.3, err * BAL.cautionBunchRate));
    if (pair.gapS < BAL.minGapS) vTargets[i] = Math.min(vTargets[i], pair.leader.speed);
  });
}

/** closest car ahead of `car` that shares its line, within half a lap */
function nearestAheadOnLine(
  racing: CarRaceState[],
  car: CarRaceState,
  L: number,
): CarRaceState | null {
  let best: CarRaceState | null = null;
  let bestGap = Infinity;
  for (const other of racing) {
    if (other === car || !sameLine(car, other)) continue;
    const gapM = (other.s - car.s + L) % L;
    if (gapM <= 0 || gapM > L / 2) continue;
    if (gapM < bestGap) {
      bestGap = gapM;
      best = other;
    }
  }
  return best;
}

/**
 * Hard invariant, applied after movement: two cars may not occupy the same
 * piece of road *on the same line*. Cars that are genuinely side by side are
 * exempt, which is what makes wheel-to-wheel racing possible at all.
 */
export function enforceGaps(state: RaceState): void {
  const racing = state.cars.filter(isRacing);
  if (racing.length < 2) return;
  const L = state.track.lengthM;
  // two passes so corrections propagate through dense queues
  for (let pass = 0; pass < 2; pass++) {
    for (const follower of racing) {
      // The nearest car ahead *on this line* — which is not always the next
      // car in track order once cars can run abreast. Checking only track
      // order lets a same-line pair overlap whenever a third car happens to
      // sit between them on a different line.
      const leader = nearestAheadOnLine(racing, follower, L);
      if (!leader) continue;
      // a pair mid-move is side by side by definition — separating them here
      // would undo the overtake before it can resolve
      if (follower.battle?.phase === 'COMMITTED' && follower.battle.targetId === leader.carId) {
        continue;
      }
      if (leader.battle?.phase === 'COMMITTED' && leader.battle.targetId === follower.carId) {
        continue;
      }
      const gapM = (leader.s - follower.s + L) % L;
      if (Math.max(leader.speed, 1) < BAL.slowLeaderFrac * Math.max(follower.speed, 1)) continue;
      if (gapM < BAL.minGapM) {
        const shift = BAL.minGapM - gapM;
        // Neither car may be moved across the start/finish line here — lap
        // counting must only ever happen in advance(). Push the follower
        // back if there is room, otherwise nudge the leader forward, which
        // keeps the invariant intact right at the line instead of letting
        // the pair overlap for a tick.
        if (follower.s >= shift) {
          follower.s -= shift;
          follower.totalDist -= shift;
        } else if (leader.s + shift < L) {
          leader.s += shift;
          leader.totalDist += shift;
        }
        follower.speed = Math.min(follower.speed, leader.speed);
      }
    }
  }
}
