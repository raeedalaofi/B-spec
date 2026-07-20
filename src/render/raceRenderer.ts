// Canvas race view: track ribbon (cached to an offscreen canvas once per
// resize) and car chevrons interpolated between sim ticks.

import { biomeOf } from '../data/tracks';
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

export class RaceRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private track: Track;
  private cam: Camera = { scale: 1, offsetX: 0, offsetY: 0 };
  private ribbon: HTMLCanvasElement | null = null;
  private dpr = 1;

  private biome: string;
  private tilesApplied = false;

  constructor(canvas: HTMLCanvasElement, track: Track) {
    this.canvas = canvas;
    this.track = track;
    this.biome = biomeOf(track.def.id);
    preload([
      `tracks/tiles/${this.biome}-ground.png`,
      `tracks/tiles/${this.biome}-asphalt.png`,
    ]);
    this.ctx = canvas.getContext('2d')!;
    this.resize();
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

  /** generated surface tiles may finish loading after construction —
   *  rebuild the cached ribbon once, when they become drawable */
  private refreshRibbonIfTilesReady(): void {
    if (this.tilesApplied) return;
    const ground = getImage(`tracks/tiles/${this.biome}-ground.png`);
    const asphalt = getImage(`tracks/tiles/${this.biome}-asphalt.png`);
    if (ready(ground) && ready(asphalt)) {
      this.tilesApplied = true;
      this.ribbon = this.buildRibbon();
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

    return off;
  }

  /**
   * Draw one frame. `interp` holds per-car totalDist at the previous and
   * current tick; `alpha` in [0,1] blends between them for smooth motion.
   */
  draw(state: RaceState, interp: InterpState, alpha: number): void {
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

      // lateral offset: passing lane, plus pit-lane offset
      let lateral = car.lane === 1 ? 4.5 : 0;
      if (car.pit?.phase === 'in-lane') lateral = -(this.track.def.widthM / 2 + 4);
      const nx = -Math.sin(pos.heading);
      const ny = Math.cos(pos.heading);
      const wx = pos.x + nx * lateral;
      const wy = pos.y + ny * lateral;
      const [x, y] = toScreen(this.cam, wx, wy);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-pos.heading);
      if (car.mistake?.severity === 'spin') {
        ctx.rotate((state.tickCount % 20) * 0.31); // spinning wildly
      }
      const sprite = getImage(`cars/${car.spec.id}-topdown.png`);
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
  }
}
