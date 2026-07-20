// The race screen: wires player commands → sim ticks → canvas renderer and
// DOM HUD. Fixed-timestep accumulator; time acceleration just runs more
// ticks per frame, so outcomes are identical at any speed.

import { RaceRenderer, type InterpState } from '../../render/raceRenderer';
import { buildResult, createRace, tick, TICK_S } from '../../sim/engine';
import type { Command, RaceConfig, RaceResult, RaceState } from '../../sim/types';
import { RaceHud } from '../raceHud';

export interface RaceScreenOptions {
  config: RaceConfig;
  title: string;
  subtitle: string;
  onFinished(result: RaceResult, state: RaceState): void;
  /** retire without rewards (defaults to reloading into onFinished flow) */
  onRetire?(): void;
}

const MAX_TICKS_PER_FRAME = 40;

export function mountRaceScreen(root: HTMLElement, opts: RaceScreenOptions): () => void {
  root.innerHTML = '';
  const screen = document.createElement('div');
  screen.className = 'race-screen';
  const canvas = document.createElement('canvas');
  canvas.className = 'race-canvas';
  screen.appendChild(canvas);
  root.appendChild(screen);

  const state = createRace(opts.config);
  const playerId = opts.config.entries.find((e) => e.isPlayer)?.carId ?? '';
  const renderer = new RaceRenderer(canvas, opts.config.track);

  let speedMult = 1;
  const pending: Command[] = [];
  const hud = new RaceHud(screen, opts.title, opts.subtitle, {
    onPace: (level) => pending.push({ type: 'SET_PACE', carId: playerId, level }),
    onOvertake: (on) => pending.push({ type: 'OVERTAKE_MODE', carId: playerId, on }),
    onPit: () => pending.push({ type: 'PIT', carId: playerId, tires: true, refuel: true }),
    onSpeed: (mult) => (speedMult = mult),
    onRetire: () => opts.onRetire?.(),
  });

  const onKey = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement) return;
    hud.handleKey(e.key);
  };
  window.addEventListener('keydown', onKey);

  const interp: InterpState = { prev: new Map(), cur: new Map() };
  const capture = (into: Map<string, number>): void => {
    for (const car of state.cars) into.set(car.carId, car.totalDist);
  };
  capture(interp.prev);
  capture(interp.cur);

  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let stopped = false;
  let finishedShown = false;
  let hudClock = 0;

  const onVisibility = (): void => {
    last = performance.now(); // don't fast-forward after a hidden period
  };
  document.addEventListener('visibilitychange', onVisibility);
  const onResize = (): void => renderer.resize();
  window.addEventListener('resize', onResize);

  function frame(now: number): void {
    if (stopped) return;
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;

    if (!document.hidden && state.phase !== 'finished') {
      acc += dt * speedMult;
      let ticks = 0;
      while (acc >= TICK_S && ticks < MAX_TICKS_PER_FRAME) {
        capture(interp.prev);
        const events = tick(state, pending.splice(0, pending.length));
        capture(interp.cur);
        for (const e of events) hud.pushEvent(state, e);
        acc -= TICK_S;
        ticks++;
      }
      if (ticks === MAX_TICKS_PER_FRAME) acc = 0; // shed backlog, keep frame rate
      hudClock += dt;
      if (hudClock >= 0.25) {
        hudClock = 0;
        hud.update(state);
      }
      hud.updateCountdown(state);
    }

    renderer.draw(state, interp, Math.max(0, Math.min(1, acc / TICK_S)));

    if (state.phase === 'finished' && !finishedShown) {
      finishedShown = true;
      hud.update(state);
      const result = buildResult(state);
      setTimeout(() => {
        hud.showResults(state, result, () => opts.onFinished(result, state));
      }, 800);
    }

    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
    root.innerHTML = '';
  };
}
