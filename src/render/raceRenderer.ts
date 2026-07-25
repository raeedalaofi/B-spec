// Canvas race view: track ribbon (cached to an offscreen canvas once per
// resize) and car chevrons interpolated between sim ticks.

import { biomeOf } from '../data/tracks';
import { hashSeed, rngNext } from '../sim/rng';
import { posAt } from '../sim/trackCompiler';
import type { RaceState, Track } from '../sim/types';
import { getImage, preload, ready } from '../ui/assets';
import { fitTrack, toScreen, type Camera } from './camera';

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

export class RaceRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private track: Track;
  private cam: Camera = { scale: 1, offsetX: 0, offsetY: 0 };
  private ribbon: HTMLCanvasElement | null = null;
  private dpr = 1;
  private particles: Particle[] = [];

  private biome: string;
  private tilesApplied = false;
  private propsApplied = false;

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
    this.resize();
  }

  private propRels(): string[] {
    return [
      ...[1, 2, 3, 4, 5, 6].map((n) => `tracks/props/${this.biome}-${n}.png`),
      'tracks/props/shared-4.png', // tire wall
      'tracks/props/shared-8.png', // paddock tent
    ];
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
      const s = p.size * this.dpr * (0.6 + t * 0.9);
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.translate(x, y);
      ctx.rotate(p.rot);
      ctx.drawImage(img, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.cam = fitTrack(this.track, this.canvas.width, this.canvas.height, 60 * this.dpr);
    this.tilesApplied = false;
    this.ribbon = this.buildRibbon();
  }

  /** generated tiles/props may finish loading after construction —
   *  rebuild the cached ribbon (at most twice) as they become drawable */
  private refreshRibbonIfTilesReady(): void {
    if (!this.tilesApplied) {
      const ground = getImage(`tracks/tiles/${this.biome}-ground.png`);
      const asphalt = getImage(`tracks/tiles/${this.biome}-asphalt.png`);
      if (ready(ground) && ready(asphalt)) {
        this.tilesApplied = true;
        this.ribbon = this.buildRibbon();
      }
    }
    if (!this.propsApplied) {
      const imgs = this.propRels().map((r) => getImage(r));
      // wait until every prop settles (loaded or known-missing)
      if (imgs.every((im) => im === null || im.complete)) {
        this.propsApplied = true;
        if (imgs.some((im) => ready(im))) this.ribbon = this.buildRibbon();
      }
    }
  }

  /** deterministic scenery scatter: seeded per track, never on the road */
  private drawProps(ctx: CanvasRenderingContext2D): void {
    const props = this.propRels()
      .map((r) => getImage(r))
      .filter((im): im is HTMLImageElement => ready(im));
    if (!props.length) return;
    const rng = { rngState: hashSeed(`props-${this.track.def.id}`) };
    const samples = this.track.samples;
    const halfRoad = this.track.def.widthM / 2;
    const placed: Array<[number, number]> = [];
    const COUNT = Math.min(34, Math.round(this.track.lengthM / 90));
    for (let k = 0; k < COUNT * 3 && placed.length < COUNT; k++) {
      const i = Math.floor(rngNext(rng) * samples.length);
      const s = samples[i];
      const side = rngNext(rng) < 0.5 ? -1 : 1;
      const dist = halfRoad + 14 + rngNext(rng) * 60;
      const nx = -Math.sin(s.heading) * side;
      const ny = Math.cos(s.heading) * side;
      const wx = s.x + nx * dist;
      const wy = s.y + ny * dist;
      // reject spots too close to any other part of the road or other props
      let ok = true;
      for (let j = 0; j < samples.length; j += 6) {
        const d = Math.hypot(samples[j].x - wx, samples[j].y - wy);
        if (d < halfRoad + 10) {
          ok = false;
          break;
        }
      }
      if (ok) {
        for (const [px, py] of placed) {
          if (Math.hypot(px - wx, py - wy) < 30) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) continue;
      placed.push([wx, wy]);
      const img = props[Math.floor(rngNext(rng) * props.length)];
      const [x, y] = toScreen(this.cam, wx, wy);
      const h = (26 + rngNext(rng) * 22) * this.dpr;
      const w = h * (img.naturalWidth / img.naturalHeight);
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 4 * this.dpr;
      ctx.shadowOffsetY = 2 * this.dpr;
      ctx.drawImage(img, x - w / 2, y - h, w, h);
      ctx.restore();
    }
  }

  private buildRibbon(): HTMLCanvasElement {
    const off = document.createElement('canvas');
    off.width = this.canvas.width;
    off.height = this.canvas.height;
    const ctx = off.getContext('2d')!;
    const cam = this.cam;
    const samples = this.track.samples;
    const widthPx = Math.max(6, this.track.def.widthM * cam.scale);

    const path = new Path2D();
    const [x0, y0] = toScreen(cam, samples[0].x, samples[0].y);
    path.moveTo(x0, y0);
    for (let i = 1; i < samples.length; i++) {
      const [x, y] = toScreen(cam, samples[i].x, samples[i].y);
      path.lineTo(x, y);
    }
    path.closePath();

    // ground: generated biome tile when available, flat navy otherwise
    const ground = getImage(`tracks/tiles/${this.biome}-ground.png`);
    if (ready(ground)) {
      const pat = ctx.createPattern(ground, 'repeat')!;
      const s = (140 * this.dpr) / ground.naturalWidth;
      pat.setTransform(new DOMMatrix().scale(s, s));
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, off.width, off.height);
      // soften toward the broadcast navy so HUD panels still sit well
      ctx.fillStyle = 'rgba(8, 14, 26, 0.45)';
      ctx.fillRect(0, 0, off.width, off.height);
    }

    // grass shadow / outline
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0c1420';
    ctx.lineWidth = widthPx + 8 * this.dpr;
    ctx.stroke(path);
    // tarmac: generated asphalt tile when available
    const asphalt = getImage(`tracks/tiles/${this.biome}-asphalt.png`);
    if (ready(asphalt)) {
      const pat = ctx.createPattern(asphalt, 'repeat')!;
      const s = (90 * this.dpr) / asphalt.naturalWidth;
      pat.setTransform(new DOMMatrix().scale(s, s));
      ctx.strokeStyle = pat;
    } else {
      ctx.strokeStyle = '#3a4150';
    }
    ctx.lineWidth = widthPx;
    ctx.stroke(path);
    // edge lines
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1.2 * this.dpr;
    ctx.setLineDash([]);
    ctx.stroke(path);
    // centerline
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1 * this.dpr;
    ctx.setLineDash([6 * this.dpr, 10 * this.dpr]);
    ctx.stroke(path);
    ctx.setLineDash([]);

    // start/finish line
    const sf = posAt(this.track, 0);
    const [sx, sy] = toScreen(cam, sf.x, sf.y);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-sf.heading + Math.PI / 2);
    ctx.fillStyle = '#e8e6df';
    const lw = widthPx * 0.62;
    ctx.fillRect(-lw / 2, -2.5 * this.dpr, lw, 5 * this.dpr);
    ctx.fillStyle = '#111';
    const sq = 2.5 * this.dpr;
    for (let i = 0; i < Math.floor(lw / sq); i += 2) {
      ctx.fillRect(-lw / 2 + i * sq, -2.5 * this.dpr, sq, sq);
      ctx.fillRect(-lw / 2 + (i + 1) * sq, -2.5 * this.dpr + sq, sq, sq);
    }
    ctx.restore();

    // pit zone marker
    const pitEntry = posAt(this.track, this.track.def.pit.entryT * this.track.lengthM);
    const [px, py] = toScreen(cam, pitEntry.x, pitEntry.y);
    ctx.fillStyle = 'rgba(240,200,80,0.8)';
    ctx.font = `${10 * this.dpr}px sans-serif`;
    ctx.fillText('PIT', px + 8 * this.dpr, py - 6 * this.dpr);

    this.drawProps(ctx);

    return off;
  }

  /**
   * Draw one frame. `interp` holds per-car totalDist at the previous and
   * current tick; `alpha` in [0,1] blends between them for smooth motion.
   */
  draw(state: RaceState, interp: InterpState, alpha: number, dt = 0.016): void {
    this.refreshRibbonIfTilesReady();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.ribbon) ctx.drawImage(this.ribbon, 0, 0);

    const L = this.track.lengthM;
    // draw back-to-front so the player's chevron lands on top
    const cars = [...state.cars].sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const car of cars) {
      const prev = interp.prev.get(car.carId) ?? car.totalDist;
      const cur = interp.cur.get(car.carId) ?? car.totalDist;
      const lerped = prev + (cur - prev) * alpha;
      const sDraw = (((car.s - (cur - lerped)) % L) + L) % L;
      const pos = posAt(this.track, sDraw);

      // the sim tracks a continuous position across the road; render it
      // honestly so side-by-side racing actually looks side by side
      const halfRoad = this.track.def.widthM / 2;
      let lateral = car.lateral * halfRoad * 0.62;
      if (car.pit?.phase === 'in-lane') lateral = -(halfRoad + 4);
      const nx = -Math.sin(pos.heading);
      const ny = Math.cos(pos.heading);
      const wx = pos.x + nx * lateral;
      const wy = pos.y + ny * lateral;
      const [x, y] = toScreen(this.cam, wx, wy);

      if (car.mistake?.severity === 'spin') {
        // skid mark laid under the spinning car
        const skid = getImage('fx/skid.png');
        if (ready(skid)) {
          const sw = 26 * this.dpr;
          const sh = sw * (skid.naturalHeight / skid.naturalWidth);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(-pos.heading);
          ctx.globalAlpha = 0.55;
          ctx.drawImage(skid, -sw / 2, -sh / 2, sw, sh);
          ctx.restore();
        }
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-pos.heading);
      if (car.mistake?.severity === 'spin') {
        ctx.rotate((state.tickCount % 20) * 0.31); // spinning wildly
      }
      // heavily worn tires swap in the battle-scarred render
      const damaged = car.tireWear > 0.65 ? getImage(`cars/${car.spec.id}-damaged.png`) : null;
      const sprite = ready(damaged) ? damaged : getImage(`cars/${car.spec.id}-topdown.png`);
      if (ready(sprite)) {
        // generated sprite is nose-up; +90° aligns it with +x heading
        ctx.rotate(Math.PI / 2);
        const h = Math.max(4.7 * this.cam.scale, (car.isPlayer ? 17 : 15) * this.dpr);
        const w = h * (sprite.naturalWidth / sprite.naturalHeight);
        if (car.isPlayer) {
          ctx.shadowColor = '#ffd75e';
          ctx.shadowBlur = 7 * this.dpr;
        } else {
          // team-color underglow keeps identical models distinguishable
          ctx.shadowColor = car.spec.color;
          ctx.shadowBlur = 4 * this.dpr;
        }
        ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
        ctx.shadowBlur = 0;
      } else {
        const size = (car.isPlayer ? 7.5 : 6) * this.dpr;
        // chevron pointing along heading (+x before rotation)
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

      if (car.isPlayer) {
        ctx.fillStyle = 'rgba(255,215,94,0.9)';
        ctx.font = `bold ${9 * this.dpr}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('YOU', x, y - 12 * this.dpr);
        ctx.textAlign = 'left';
      }
    }

    this.drawParticles(dt);
  }
}
