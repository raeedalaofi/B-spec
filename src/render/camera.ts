// Camera, and the shot director that drives it.
//
// A single fixed camera showing the whole circuit turns a race into a map:
// the cars are fifteen pixels across and nothing that happens between them
// reads. The director's job is to answer "where is the race right now" and
// point the camera at it — the player's battle if there is one, the leader's
// if there is not, and the whole track when the field is spread out and there
// is genuinely nothing to look at closely.

import type { CarRaceState, RaceState, Track } from '../sim/types';
import { posAt } from '../sim/trackCompiler';

export interface Camera {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface TrackBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export function trackBounds(track: Track): TrackBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of track.samples) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.y > maxY) maxY = s.y;
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

export function fitTrack(track: Track, width: number, height: number, padding = 60): Camera {
  const b = trackBounds(track);
  const scale = Math.min((width - 2 * padding) / b.width, (height - 2 * padding) / b.height);
  return {
    scale,
    offsetX: width / 2 - (b.minX + b.width / 2) * scale,
    // canvas y grows downward; flip so track "north" is up
    offsetY: height / 2 + (b.minY + b.height / 2) * scale,
  };
}

/** a camera centred on a world point at a given scale */
export function centredOn(
  x: number,
  y: number,
  scale: number,
  width: number,
  height: number,
): Camera {
  return { scale, offsetX: width / 2 - x * scale, offsetY: height / 2 + y * scale };
}

export function toScreen(cam: Camera, x: number, y: number): [number, number] {
  return [x * cam.scale + cam.offsetX, -y * cam.scale + cam.offsetY];
}

// ---------------------------------------------------------------------------
// Shot director

export type ShotKind = 'wide' | 'follow' | 'battle' | 'finish';

export interface Shot {
  kind: ShotKind;
  /** world-space focus */
  x: number;
  y: number;
  /** pixels per metre */
  scale: number;
  /** what the shot is about, for the on-screen caption */
  caption: string;
}

const MIN_SHOT_S = 2.4; // never cut faster than this, or it reads as a strobe

export class ShotDirector {
  private track: Track;
  private cam: Camera;
  private width = 1;
  private height = 1;
  private wideScale = 1;
  private shot: Shot | null = null;
  private heldS = 0;
  private caption = '';

  constructor(track: Track, width: number, height: number) {
    this.track = track;
    this.cam = fitTrack(track, width, height);
    this.resize(width, height);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const wide = fitTrack(this.track, width, height);
    this.wideScale = wide.scale;
    this.cam = wide;
    this.shot = null;
  }

  currentCaption(): string {
    return this.caption;
  }

  currentKind(): ShotKind {
    return this.shot?.kind ?? 'wide';
  }

  /**
   * Advance the camera. Cuts are chosen at most every MIN_SHOT_S; between
   * cuts the camera eases toward the shot so the picture never snaps.
   */
  update(state: RaceState, playerId: string, dt: number, manualWide: boolean): Camera {
    this.heldS += dt;
    const next = manualWide ? this.wideShot() : this.chooseShot(state, playerId);
    if (!this.shot || (next.kind !== this.shot.kind && this.heldS >= MIN_SHOT_S)) {
      this.shot = next;
      this.caption = next.caption;
      this.heldS = 0;
    } else if (this.shot.kind === next.kind) {
      // same shot: keep tracking its subject without resetting the hold
      this.shot = { ...next, kind: this.shot.kind };
      this.caption = next.caption;
    }

    const target = centredOn(
      this.shot.x,
      this.shot.y,
      this.shot.scale,
      this.width,
      this.height,
    );
    // critically damped-ish ease; fast enough to keep up with a car at 80 m/s
    const k = Math.min(1, dt * 3.4);
    this.cam = {
      scale: this.cam.scale + (target.scale - this.cam.scale) * k,
      offsetX: this.cam.offsetX + (target.offsetX - this.cam.offsetX) * k,
      offsetY: this.cam.offsetY + (target.offsetY - this.cam.offsetY) * k,
    };
    return this.cam;
  }

  camera(): Camera {
    return this.cam;
  }

  private wideShot(): Shot {
    const b = trackBounds(this.track);
    return {
      kind: 'wide',
      x: b.minX + b.width / 2,
      y: b.minY + b.height / 2,
      scale: this.wideScale,
      caption: '',
    };
  }

  private shotOn(kind: ShotKind, cars: CarRaceState[], zoom: number, caption: string): Shot {
    // frame the midpoint of everyone in shot
    let sx = 0;
    let sy = 0;
    for (const car of cars) {
      const p = posAt(this.track, car.s);
      sx += p.x;
      sy += p.y;
    }
    return {
      kind,
      x: sx / cars.length,
      y: sy / cars.length,
      scale: this.wideScale * zoom,
      caption,
    };
  }

  private chooseShot(state: RaceState, playerId: string): Shot {
    if (state.phase === 'countdown') return this.wideShot();
    const player = state.cars.find((c) => c.carId === playerId);
    const running = state.cars.filter((c) => !c.finished);

    // the flag: pull out and show the whole thing
    if (state.phase === 'finished' || running.length === 0) {
      return { ...this.wideShot(), kind: 'finish' };
    }

    // 1. the player mid-move, or being attacked — always the best shot
    if (player && !player.finished) {
      const partnerId =
        player.battle?.phase === 'COMMITTED'
          ? player.battle.targetId
          : player.underAttack
            ? attackerOf(state, player)
            : null;
      const partner = partnerId ? state.cars.find((c) => c.carId === partnerId) : null;
      if (partner && !partner.finished) {
        return this.shotOn(
          'battle',
          [player, partner],
          8,
          `${player.driverName} v ${partner.driverName}`,
        );
      }
      // 2. otherwise stay with the player
      if (state.caution) {
        return { ...this.wideShot(), caption: 'Safety car' };
      }
      return this.shotOn('follow', [player], 5.5, '');
    }

    // 3. no player on track: follow the closest fight, else the leader
    const fight = closestFight(state);
    if (fight) {
      return this.shotOn('battle', fight, 8, `${fight[0].driverName} v ${fight[1].driverName}`);
    }
    const leader = running.reduce((a, b) => (a.totalDist > b.totalDist ? a : b));
    return this.shotOn('follow', [leader], 5.5, `Leader — ${leader.driverName}`);
  }
}

function attackerOf(state: RaceState, defender: CarRaceState): string | null {
  for (const car of state.cars) {
    if (car.battle?.targetId === defender.carId && car.battle.phase !== 'CATCHING') {
      return car.carId;
    }
  }
  return null;
}

/** the tightest active battle on track, if there is one */
function closestFight(state: RaceState): [CarRaceState, CarRaceState] | null {
  let best: [CarRaceState, CarRaceState] | null = null;
  let bestGap = Infinity;
  const L = state.track.lengthM;
  for (const car of state.cars) {
    if (car.finished || !car.battle || car.battle.phase === 'CATCHING') continue;
    const target = state.cars.find((c) => c.carId === car.battle!.targetId);
    if (!target || target.finished) continue;
    const gap = (target.s - car.s + L) % L;
    if (gap < bestGap) {
      bestGap = gap;
      best = [car, target];
    }
  }
  return best;
}
