// Canvas race view.
//
// Everything is drawn in screen space through the camera each frame rather
// than cached to an offscreen ribbon, because the camera now moves: the shot
// director pushes it around the circuit and a cached image at a fixed camera
// would be wrong the moment it did. A few thousand canvas operations a frame
// is a price worth paying for a picture that can actually follow the race.

import { biomeOf } from '../data/tracks';
import { hashSeed, rngNext } from '../sim/rng';
import { posAt } from '../sim/trackCompiler';
import type { CarRaceState, RaceState, Track } from '../sim/types';
import { getImage, preload, ready } from '../ui/assets';
import { ShotDirector, toScreen, type Camera } from './camera';

export interface CarSnapshot {
  totalDist: number;
}

/** per-car totalDist captured at the previous and current tick */
export interface InterpState {
  prev: Map<string, number>;
  cur: Map<string, number>;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  rot: number;
  vrot: number;
  img: string;
}

interface Prop {
  x: number;
  y: number;
  img: string;
  h: number;
}

/** a mark left on the road: skid, or dust kicked off-line */
interface Scar {
  x: number;
  y: number;
  heading: number;
  life: number;
  kind: 'skid' | 'dust';
}

const MAX_SCARS = 90;

export class RaceRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private track: Track;
  private director: ShotDirector;
  private cam: Camera;
  private dpr = 1;
  private particles: Particle[] = [];
  private scars: Scar[] = [];
  private props: Prop[] = [];
  private propsBuilt = false;
  private biome: string;
  private wideMode = false;
  /** elevation range, for shading */
  private elevMin = 0;
  private elevSpan = 1;
  /** last frame's speed per car, purely so brake lights can be drawn — kept
   *  here rather than on CarRaceState so the sim stays free of render state */
  private lastSpeed = new Map<string, number>();

  constructor(canvas: HTMLCanvasElement, track: Track) {
    this.canvas = canvas;
    this.track = track;
    this.biome = biomeOf(track.def.id);
    preload([
      `tracks/tiles/${this.biome}-ground.png`,
      `tracks/tiles/${this.biome}-asphalt.png`,
      ...this.propRels(),
      'fx/dust-1.png',
      'fx/dust-2.png',
      'fx/smoke-1.png',
      'fx/smoke-2.png',
      'fx/spark-1.png',
      'fx/confetti-1.png',
      'fx/confetti-2.png',
      'fx/skid.png',
    ]);
    this.ctx = canvas.getContext('2d')!;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of track.samples) {
      if (s.elev < lo) lo = s.elev;
      if (s.elev > hi) hi = s.elev;
    }
    this.elevMin = lo;
    this.elevSpan = Math.max(1, hi - lo);
    this.director = new ShotDirector(track, 1, 1);
    this.cam = this.director.camera();
    this.resize();
  }

  private propRels(): string[] {
    return [
      ...[1, 2, 3, 4, 5, 6].map((n) => `tracks/props/${this.biome}-${n}.png`),
      'tracks/props/shared-4.png', // tire wall
      'tracks/props/shared-8.png', // paddock tent
    ];
  }

  /** toggle between the directed camera and the whole-circuit view */
  setWideMode(on: boolean): void {
    this.wideMode = on;
  }

  caption(): string {
    return this.wideMode ? '' : this.director.currentCaption();
  }

  /** spawn a particle burst at a car's position (world space) */
  burst(car: { s: number }, kind: 'dust' | 'smoke' | 'spark' | 'confetti'): void {
    const pos = posAt(this.track, car.s);
    const imgs: Record<string, string[]> = {
      dust: ['fx/dust-1.png', 'fx/dust-2.png'],
      smoke: ['fx/smoke-1.png', 'fx/smoke-2.png'],
      spark: ['fx/spark-1.png'],
      confetti: ['fx/confetti-1.png', 'fx/confetti-2.png'],
    };
    const n = kind === 'confetti' ? 14 : kind === 'spark' ? 5 : 7;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = kind === 'confetti' ? 22 : 12;
      this.particles.push({
        x: pos.x,
        y: pos.y,
        vx: Math.cos(a) * sp * (0.4 + Math.random()),
        vy: Math.sin(a) * sp * (0.4 + Math.random()),
        life: 0,
        maxLife: kind === 'confetti' ? 1.6 : 0.9,
        size: (kind === 'confetti' ? 10 : 14) * (0.7 + Math.random() * 0.7),
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 6,
        img: imgs[kind][i % imgs[kind].length],
      });
    }
    if (this.particles.length > 260) this.particles.splice(0, this.particles.length - 260);
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.director.resize(this.canvas.width, this.canvas.height);
    this.cam = this.director.camera();
    this.propsBuilt = false;
  }

  // -- world geometry -------------------------------------------------------

  /** world position offset laterally from the racing line */
  private offsetPoint(s: number, lateralM: number): { x: number; y: number; heading: number } {
    const p = posAt(this.track, s);
    const nx = -Math.sin(p.heading);
    const ny = Math.cos(p.heading);
    return { x: p.x + nx * lateralM, y: p.y + ny * lateralM, heading: p.heading };
  }

  /** deterministic scenery scatter: seeded per track, never on the road */
  private buildProps(): void {
    this.props = [];
    const rels = this.propRels().filter((r) => ready(getImage(r)));
    if (!rels.length) return;
    const rng = { rngState: hashSeed(`props-${this.track.def.id}`) };
    const samples = this.track.samples;
    const halfRoad = this.track.def.widthM / 2;
    const COUNT = Math.min(90, Math.round(this.track.lengthM / 42));
    for (let k = 0; k < COUNT * 3 && this.props.length < COUNT; k++) {
      const i = Math.floor(rngNext(rng) * samples.length);
      const s = samples[i];
      const side = rngNext(rng) < 0.5 ? -1 : 1;
      const dist = halfRoad + 16 + rngNext(rng) * 90;
      const nx = -Math.sin(s.heading) * side;
      const ny = Math.cos(s.heading) * side;
      const wx = s.x + nx * dist;
      const wy = s.y + ny * dist;
      let ok = true;
      for (let j = 0; j < samples.length; j += 6) {
        if (Math.hypot(samples[j].x - wx, samples[j].y - wy) < halfRoad + 11) {
          ok = false;
          break;
        }
      }
      if (ok) {
        for (const p of this.props) {
          if (Math.hypot(p.x - wx, p.y - wy) < 26) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) continue;
      this.props.push({
        x: wx,
        y: wy,
        img: rels[Math.floor(rngNext(rng) * rels.length)],
        h: 8 + rngNext(rng) * 7,
      });
    }
    this.propsBuilt = true;
  }

  // -- drawing --------------------------------------------------------------

  private strokeCentreline(width: number, style: string | CanvasPattern): void {
    const ctx = this.ctx;
    const samples = this.track.samples;
    ctx.beginPath();
    const [x0, y0] = toScreen(this.cam, samples[0].x, samples[0].y);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < samples.length; i++) {
      const [x, y] = toScreen(this.cam, samples[i].x, samples[i].y);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  private drawGround(): void {
    const ctx = this.ctx;
    const ground = getImage(`tracks/tiles/${this.biome}-ground.png`);
    if (ready(ground)) {
      const pat = ctx.createPattern(ground, 'repeat')!;
      // scale with the camera so the ground reads as terrain rather than
      // wallpaper when the shot pushes in
      const k = (this.cam.scale * 3.2) / ground.naturalWidth;
      pat.setTransform(
        new DOMMatrix().translate(this.cam.offsetX % 512, this.cam.offsetY % 512).scale(k, k),
      );
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = 'rgba(8, 14, 26, 0.42)';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      ctx.fillStyle = '#0f1a12';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * Elevation shading. The track compiler has computed a height for every
   * sample since day one and nothing has ever drawn it, so a mountain circuit
   * looked exactly as flat as an oval. Lightening the climbs and darkening
   * the descents costs one extra pass and gives the whole circuit a shape.
   */
  private drawElevation(widthPx: number): void {
    const ctx = this.ctx;
    const samples = this.track.samples;
    if (this.elevSpan < 4) return; // genuinely flat: nothing to say
    const step = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    ctx.lineWidth = widthPx;
    for (let i = 0; i < samples.length; i += step) {
      const a = samples[i];
      const b = samples[(i + step) % samples.length];
      const t = (a.elev - this.elevMin) / this.elevSpan;
      const [x1, y1] = toScreen(this.cam, a.x, a.y);
      const [x2, y2] = toScreen(this.cam, b.x, b.y);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      // high ground catches the light, low ground sits in shadow
      ctx.strokeStyle =
        t > 0.5
          ? `rgba(255,246,220,${(t - 0.5) * 0.34})`
          : `rgba(0,6,18,${(0.5 - t) * 0.42})`;
      ctx.stroke();
    }
  }

  /** red-and-white kerbing on the inside of every corner */
  private drawKerbs(widthPx: number): void {
    const ctx = this.ctx;
    const half = this.track.def.widthM / 2;
    const L = this.track.lengthM;
    ctx.lineCap = 'butt';
    ctx.lineWidth = Math.max(1.5, widthPx * 0.13);
    for (const corner of this.track.corners) {
      const span = (corner.exitS - corner.entryS + L) % L;
      if (span < 8) continue;
      // curvature sign at the apex tells us which side is the inside
      const apexIdx =
        Math.floor(corner.apexS / this.track.sampleStepM) % this.track.samples.length;
      const side = this.track.samples[apexIdx].curvature >= 0 ? 1 : -1;
      const steps = Math.max(3, Math.round(span / 6));
      for (let i = 0; i < steps; i++) {
        const s = corner.entryS + (span * i) / steps;
        const a = this.offsetPoint(s, side * half * 0.92);
        const b = this.offsetPoint(corner.entryS + (span * (i + 1)) / steps, side * half * 0.92);
        const [x1, y1] = toScreen(this.cam, a.x, a.y);
        const [x2, y2] = toScreen(this.cam, b.x, b.y);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(216,74,58,0.85)' : 'rgba(232,230,223,0.85)';
        ctx.stroke();
      }
    }
  }

  private drawStartLine(widthPx: number): void {
    const ctx = this.ctx;
    const sf = posAt(this.track, 0);
    const [sx, sy] = toScreen(this.cam, sf.x, sf.y);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-sf.heading + Math.PI / 2);
    const lw = widthPx * 0.94;
    const th = Math.max(3, widthPx * 0.1);
    ctx.fillStyle = '#e8e6df';
    ctx.fillRect(-lw / 2, -th / 2, lw, th);
    ctx.fillStyle = '#111';
    const sq = th / 2;
    for (let i = 0; i * sq < lw; i += 2) {
      ctx.fillRect(-lw / 2 + i * sq, -th / 2, sq, sq);
      ctx.fillRect(-lw / 2 + (i + 1) * sq, 0, sq, sq);
    }
    ctx.restore();

    // grid boxes behind the line, staggered as a real standing start is
    if (this.cam.scale > 0.06) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1 * this.dpr;
      const half = this.track.def.widthM / 2;
      for (let i = 0; i < 8; i++) {
        const s = (this.track.lengthM - 8 * (i + 1)) % this.track.lengthM;
        const lateral = (i % 2 === 0 ? 0.4 : -0.4) * half * 0.62;
        const p = this.offsetPoint(s, lateral);
        const [gx, gy] = toScreen(this.cam, p.x, p.y);
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(-p.heading);
        const bw = 5 * this.cam.scale;
        const bh = 2.6 * this.cam.scale;
        ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
        ctx.restore();
      }
    }
  }

  /** the pit lane, drawn as a real strip of road beside the circuit */
  private drawPitLane(widthPx: number): void {
    const ctx = this.ctx;
    const L = this.track.lengthM;
    const entryS = this.track.def.pit.entryT * L;
    const exitS = this.track.def.pit.exitT * L;
    const span = (exitS - entryS + L) % L;
    const offset = -(this.track.def.widthM / 2 + 4);
    const steps = Math.max(6, Math.round(span / 12));
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const p = this.offsetPoint(entryS + (span * i) / steps, offset);
      const [x, y] = toScreen(this.cam, p.x, p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(38,44,54,0.95)';
    ctx.lineWidth = widthPx * 0.42;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240,200,80,0.5)';
    ctx.lineWidth = Math.max(1, this.dpr);
    ctx.stroke();

    const label = this.offsetPoint(entryS, offset);
    const [lx, ly] = toScreen(this.cam, label.x, label.y);
    ctx.fillStyle = 'rgba(240,200,80,0.9)';
    ctx.font = `${10 * this.dpr}px sans-serif`;
    ctx.fillText('PIT', lx + 6 * this.dpr, ly - 5 * this.dpr);
  }

  private drawProps(): void {
    const ctx = this.ctx;
    for (const prop of this.props) {
      const img = getImage(prop.img);
      if (!ready(img)) continue;
      const [x, y] = toScreen(this.cam, prop.x, prop.y);
      if (x < -80 || y < -80 || x > this.canvas.width + 80 || y > this.canvas.height + 80) {
        continue;
      }
      const h = prop.h * this.cam.scale * 1.6;
      if (h < 3) continue;
      const w = h * (img.naturalWidth / img.naturalHeight);
      ctx.save();
      ctx.globalAlpha = 0.94;
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 4 * this.dpr;
      ctx.shadowOffsetY = 2 * this.dpr;
      ctx.drawImage(img, x - w / 2, y - h, w, h);
      ctx.restore();
    }
  }

  private drawScars(dt: number): void {
    const ctx = this.ctx;
    for (let i = this.scars.length - 1; i >= 0; i--) {
      const sc = this.scars[i];
      sc.life -= dt * 0.08;
      if (sc.life <= 0) {
        this.scars.splice(i, 1);
        continue;
      }
      const [x, y] = toScreen(this.cam, sc.x, sc.y);
      const size = (sc.kind === 'skid' ? 5 : 3.4) * this.cam.scale;
      if (size < 1) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-sc.heading);
      ctx.globalAlpha = sc.life * (sc.kind === 'skid' ? 0.5 : 0.28);
      ctx.fillStyle = sc.kind === 'skid' ? '#101318' : '#c8b184';
      ctx.fillRect(-size, -size * 0.22, size * 2, size * 0.44);
      ctx.restore();
    }
  }

  private drawParticles(dt: number): void {
    const ctx = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      const img = getImage(p.img);
      if (!ready(img)) continue;
      const t = p.life / p.maxLife;
      const [x, y] = toScreen(this.cam, p.x, p.y);
      const s = p.size * this.dpr * (0.6 + t * 0.9) * Math.max(0.5, this.cam.scale * 6);
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.translate(x, y);
      ctx.rotate(p.rot);
      ctx.drawImage(img, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }

  private drawCar(
    state: RaceState,
    car: CarRaceState,
    interp: InterpState,
    alpha: number,
  ): void {
    const ctx = this.ctx;
    const L = this.track.lengthM;
    const prev = interp.prev.get(car.carId) ?? car.totalDist;
    const cur = interp.cur.get(car.carId) ?? car.totalDist;
    const lerped = prev + (cur - prev) * alpha;
    const sDraw = (((car.s - (cur - lerped)) % L) + L) % L;

    const halfRoad = this.track.def.widthM / 2;
    let lateralM = car.lateral * halfRoad * 0.62;
    if (car.pit?.phase === 'in-lane') lateralM = -(halfRoad + 4);
    const pos = this.offsetPoint(sDraw, lateralM);
    const [x, y] = toScreen(this.cam, pos.x, pos.y);
    if (x < -120 || y < -120 || x > this.canvas.width + 120 || y > this.canvas.height + 120) {
      return;
    }

    // car size scales with the camera but never disappears entirely
    const px = Math.max(
      (car.isPlayer ? 15 : 13) * this.dpr,
      4.6 * this.cam.scale * (car.isPlayer ? 1.05 : 1),
    );

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-pos.heading);
    if (car.mistake?.severity === 'spin') {
      ctx.rotate((state.tickCount % 20) * 0.31);
    }

    const damaged = car.tireWear > 0.65 || car.damage > 0.3
      ? getImage(`cars/${car.spec.id}-damaged.png`)
      : null;
    const sprite = ready(damaged) ? damaged : getImage(`cars/${car.spec.id}-topdown.png`);
    if (ready(sprite)) {
      ctx.rotate(Math.PI / 2); // generated sprites are nose-up
      const h = px;
      const w = h * (sprite.naturalWidth / sprite.naturalHeight);
      if (car.isPlayer) {
        ctx.shadowColor = '#ffd75e';
        ctx.shadowBlur = 8 * this.dpr;
      } else {
        ctx.shadowColor = car.spec.color;
        ctx.shadowBlur = 4 * this.dpr;
      }
      ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
      ctx.shadowBlur = 0;
      // brake lights: on when the car is genuinely slowing
      if (car.speed < (this.lastSpeed.get(car.carId) ?? car.speed) - 0.35) {
        ctx.fillStyle = 'rgba(255,60,40,0.92)';
        ctx.fillRect(-w * 0.34, h * 0.36, w * 0.68, h * 0.1);
      }
    } else {
      const size = px * 0.5;
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.7, size * 0.62);
      ctx.lineTo(-size * 0.35, 0);
      ctx.lineTo(-size * 0.7, -size * 0.62);
      ctx.closePath();
      ctx.fillStyle = car.spec.color;
      ctx.fill();
      ctx.lineWidth = 1.5 * this.dpr;
      ctx.strokeStyle = car.isPlayer ? '#ffd75e' : 'rgba(255,255,255,0.55)';
      ctx.stroke();
    }
    ctx.restore();

    // name tags, but only when the shot is close enough for them to mean
    // something — at wide zoom they are a wall of text over the circuit
    if (this.cam.scale > 0.9 || car.isPlayer) {
      ctx.font = `bold ${9 * this.dpr}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = car.isPlayer ? 'rgba(255,215,94,0.95)' : 'rgba(232,236,244,0.8)';
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = 3 * this.dpr;
      const label = car.isPlayer ? 'YOU' : car.driverName;
      ctx.strokeText(label, x, y - px * 0.75);
      ctx.fillText(label, x, y - px * 0.75);
      ctx.textAlign = 'left';
    }
  }

  /**
   * Draw one frame. `interp` holds per-car totalDist at the previous and
   * current tick; `alpha` in [0,1] blends between them for smooth motion.
   */
  draw(
    state: RaceState,
    interp: InterpState,
    alpha: number,
    dt = 0.016,
    playerId = '',
  ): void {
    this.cam = this.director.update(state, playerId, dt, this.wideMode);
    if (!this.propsBuilt) this.buildProps();
    const ctx = this.ctx;
    const widthPx = Math.max(4, this.track.def.widthM * this.cam.scale);

    this.drawGround();

    // verge, run-off, then the road itself
    this.strokeCentreline(widthPx + 22 * this.dpr, '#0c1420');
    this.strokeCentreline(widthPx + 10 * this.dpr, 'rgba(120,104,78,0.55)');

    const asphalt = getImage(`tracks/tiles/${this.biome}-asphalt.png`);
    if (ready(asphalt)) {
      const pat = ctx.createPattern(asphalt, 'repeat')!;
      const k = (this.cam.scale * 2.4) / asphalt.naturalWidth;
      pat.setTransform(
        new DOMMatrix().translate(this.cam.offsetX % 256, this.cam.offsetY % 256).scale(k, k),
      );
      this.strokeCentreline(widthPx, pat);
    } else {
      this.strokeCentreline(widthPx, '#3a4150');
    }

    this.drawElevation(widthPx);
    this.strokeCentreline(widthPx, 'rgba(0,0,0,0)'); // reset path state
    this.drawScars(dt);

    // edge lines and the dashed centre
    this.strokeCentreline(widthPx * 0.02 + 1, 'rgba(180,190,205,0.35)');
    ctx.setLineDash([7 * this.dpr, 12 * this.dpr]);
    this.strokeCentreline(Math.max(1, this.dpr), 'rgba(255,255,255,0.14)');
    ctx.setLineDash([]);

    this.drawKerbs(widthPx);
    this.drawPitLane(widthPx);
    this.drawStartLine(widthPx);
    this.drawProps();

    // back to front so the player lands on top
    const cars = [...state.cars].sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const car of cars) {
      if (car.mistake?.severity === 'spin' && Math.random() < 0.5) {
        const p = posAt(this.track, car.s);
        this.addScar(p.x, p.y, p.heading, 'skid');
      } else if (Math.abs(car.lateral) > 0.75 && car.speed > 12 && Math.random() < 0.12) {
        const p = this.offsetPoint(car.s, car.lateral * (this.track.def.widthM / 2) * 0.62);
        this.addScar(p.x, p.y, p.heading, 'dust');
      }
      this.drawCar(state, car, interp, alpha);
      this.lastSpeed.set(car.carId, car.speed);
    }

    this.drawParticles(dt);
  }

  private addScar(x: number, y: number, heading: number, kind: 'skid' | 'dust'): void {
    this.scars.push({ x, y, heading, life: 1, kind });
    if (this.scars.length > MAX_SCARS) this.scars.shift();
  }
}
