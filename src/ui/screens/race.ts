// The race screen: wires player commands → sim ticks → canvas renderer and
// DOM HUD. Fixed-timestep accumulator; time acceleration just runs more
// ticks per frame, so outcomes are identical at any speed.

import { RaceRenderer, type InterpState } from '../../render/raceRenderer';
import { buildResult, createRace, tick, TICK_S } from '../../sim/engine';
import { biomeOf } from '../../data/tracks';
import {
  clearRaceInProgress,
  saveRaceInProgress,
  snapshotRace,
} from '../../state/raceSave';
import type {
  CarRaceState,
  Command,
  RaceConfig,
  RaceEvent,
  RaceResult,
  RaceState,
  TrackDef,
} from '../../sim/types';
import { RaceHud } from '../raceHud';
import { highlightFor, type Highlight } from '../highlights';
import { nextTip } from '../coaching';
import { nextRadioPrompt, type RadioPrompt } from '../radio';
import { SOUND, type AudioScene } from '../sound';

export interface RaceScreenOptions {
  config: RaceConfig;
  title: string;
  subtitle: string;
  /** coaching tips already shown; mutated as new ones are taught */
  coachSeen?: Record<string, number>;
  onCoachSeen?(id: string): void;
  /** enough context to write a resumable snapshot; omit to disable saving */
  resume?: { trackDef: TrackDef; params: unknown };
  /** a race restored from a snapshot, instead of a fresh one */
  restored?: RaceState;
  onFinished(result: RaceResult, state: RaceState): void;
  /** retire without rewards (defaults to reloading into onFinished flow) */
  onRetire?(): void;
  /** initial audio setting; toggle persisted via onAudioToggle */
  audio?: boolean;
  onAudioToggle?(on: boolean): void;
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

  const state = opts.restored ?? createRace(opts.config);
  const playerId = opts.config.entries.find((e) => e.isPlayer)?.carId ?? '';
  const renderer = new RaceRenderer(canvas, opts.config.track);

  SOUND.setEnabled(opts.audio ?? true);

  let speedMult = 1;
  let paused = false;
  const pending: Command[] = [];
  const hud = new RaceHud(screen, opts.title, opts.subtitle, {
    onOrder: (order) => pending.push({ type: 'SET_ORDER', carId: playerId, order }),
    onPit: (tires, refuel, fuelTargetL) =>
      pending.push({ type: 'PIT', carId: playerId, tires, refuel, fuelTargetL }),
    onSpeed: (mult) => (speedMult = mult),
    onPause: (on) => (paused = on),
    onWideView: (on) => renderer.setWideMode(on),
    onRetire: () => opts.onRetire?.(),
    audioOn: opts.audio ?? true,
    onAudioToggle: (on) => {
      SOUND.setEnabled(on);
      opts.onAudioToggle?.(on);
    },
  });

  // -- team radio -----------------------------------------------------------
  // A call is offered, counts down, and if the player says nothing the driver
  // takes the default. It never pauses the race: the clock keeps running,
  // which is what makes hesitating cost something.
  const askedRadio = new Set<string>();
  let radio: { prompt: RadioPrompt; remainingS: number } | null = null;

  const answerRadio = (index: number): void => {
    if (!radio) return;
    const player = state.cars.find((c) => c.carId === playerId);
    if (player) pending.push(...radio.prompt.options[index].commands(playerId, player));
    radio = null;
    hud.clearRadio();
  };

  const updateRadio = (dt: number): void => {
    if (radio) {
      radio.remainingS -= dt;
      hud.tickRadio(radio.remainingS / radio.prompt.timeoutS);
      if (radio.remainingS <= 0) answerRadio(radio.prompt.defaultIndex);
      return;
    }
    const player = state.cars.find((c) => c.carId === playerId);
    if (!player) return;
    const prompt = nextRadioPrompt(state, player, askedRadio);
    if (!prompt) return;
    askedRadio.add(prompt.id);
    radio = { prompt, remainingS: prompt.timeoutS };
    SOUND.radioIn();
    hud.showRadio(prompt, answerRadio);
  };

  // -- coaching -------------------------------------------------------------
  const coachSeen = opts.coachSeen ?? {};
  const updateCoaching = (): void => {
    if (hud.hasTip() || radio) return;
    const player = state.cars.find((c) => c.carId === playerId);
    if (!player || player.finished) return;
    const tip = nextTip(state, player, coachSeen);
    if (!tip) return;
    coachSeen[tip.id] = Date.now();
    opts.onCoachSeen?.(tip.id);
    paused = true;
    hud.showTip(tip, () => {
      paused = false;
    });
  };

  // The sim already emits a complete typed record of everything that
  // happened, so a highlight reel is nearly free — it is a filter over the
  // event log, not a second system that has to be kept in sync with it.
  const highlights: Highlight[] = [];
  const recordHighlight = (s: RaceState, e: RaceEvent): void => {
    const h = highlightFor(s, e, playerId);
    if (h) highlights.push(h);
  };

  /**
   * Translates the race into something the mixer can use: where the nearby
   * cars are relative to the player, how hard the player is working, and how
   * tense the moment is. Keeping this here rather than in the audio module
   * means the mixer never has to know what a RaceState is.
   */
  const buildScene = (s: RaceState, me: CarRaceState): AudioScene => {
    const L = s.track.lengthM;
    const rivals = s.cars
      .filter((c) => c !== me && !c.finished && !c.pit)
      .map((c) => {
        const ahead = (c.s - me.s + L) % L;
        const distM = ahead <= L / 2 ? ahead : ahead - L;
        return { distM, speedFrac: c.speed / c.spec.topSpeedMs, lateral: c.lateral };
      });
    // tension: wheel-to-wheel is the peak, being closed down is most of it
    const tension =
      me.battle?.phase === 'COMMITTED' || me.defence === 'cover'
        ? 1
        : me.battle?.phase === 'FOLLOWING' || me.underAttack
          ? 0.6
          : 0;
    // cornering load, read off how far below the car's own top speed it is
    // while still on the power
    const cornering = Math.max(0, Math.min(1, 1.35 - me.speed / (me.profileMax || 1)));
    return {
      playerSpeedFrac: me.speed / me.spec.topSpeedMs,
      rivals,
      tension,
      cornering,
      underCaution: s.caution !== null,
      finished: s.phase === 'finished',
    };
  };

  const playSoundFor = (e: RaceEvent): void => {
    switch (e.type) {
      case 'GREEN_FLAG':
        SOUND.greenFlag();
        SOUND.startEngine(biomeOf(opts.config.track.def.id));
        break;
      case 'OVERTAKE':
        if (e.carId === playerId) SOUND.goodSting();
        else if (e.passedId === playerId) SOUND.badSting();
        break;
      case 'SIDE_BY_SIDE':
        if (e.carId === playerId || e.defenderId === playerId) SOUND.tension();
        break;
      case 'CONTACT':
        if (e.carId === playerId || e.otherId === playerId) SOUND.impact(e.severity === 'heavy');
        break;
      case 'MISTAKE':
        if (e.carId === playerId) SOUND.badSting();
        break;
      case 'CAUTION_START':
        SOUND.caution();
        break;
      case 'PIT_IN':
        if (e.carId === playerId) SOUND.pitChime();
        break;
      case 'FINISH':
        if (e.carId === playerId) {
          if (e.position <= 3) SOUND.fanfare();
          SOUND.stopEngine();
        }
        break;
      case 'RETIREMENT':
        if (e.carId === playerId) SOUND.stopEngine();
        break;
    }
  };

  const effectFor = (e: RaceEvent): void => {
    const carOf = (id: string): { s: number } | undefined =>
      state.cars.find((c) => c.carId === id);
    switch (e.type) {
      case 'MISTAKE': {
        const c = carOf(e.carId);
        if (c) renderer.burst(c, e.severity === 'spin' ? 'smoke' : 'dust');
        break;
      }
      case 'CONTACT': {
        const c = carOf(e.carId);
        if (c) renderer.burst(c, 'spark');
        break;
      }
      case 'OVERTAKE': {
        const c = carOf(e.carId);
        if (c) renderer.burst(c, 'spark');
        break;
      }
      case 'FINISH': {
        if (e.carId === playerId && e.position <= 3) {
          const c = carOf(e.carId);
          if (c) renderer.burst(c, 'confetti');
        }
        break;
      }
    }
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement) return;
    // while a radio call is live the arrow keys answer it
    if (radio && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      answerRadio(e.key === 'ArrowLeft' ? 0 : 1);
      e.preventDefault();
      return;
    }
    if (hud.handleKey(e.key)) e.preventDefault();
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
  let saveClock = 0;

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

    const running = !document.hidden && !paused && state.phase !== 'finished';
    if (running) {
      acc += dt * speedMult;
      let ticks = 0;
      while (acc >= TICK_S && ticks < MAX_TICKS_PER_FRAME) {
        capture(interp.prev);
        const events = tick(state, pending.splice(0, pending.length));
        capture(interp.cur);
        for (const e of events) {
          hud.pushEvent(state, e);
          playSoundFor(e);
          effectFor(e);
          recordHighlight(state, e);
        }
        acc -= TICK_S;
        ticks++;
      }
      if (ticks === MAX_TICKS_PER_FRAME) acc = 0; // shed backlog, keep frame rate
      // the radio counts down in race time, so a call is as urgent at x4 as x1
      updateRadio(dt * speedMult);
      updateCoaching();
      hudClock += dt;
      if (hudClock >= 0.25) {
        hudClock = 0;
        hud.update(state);
        const me = state.cars.find((c) => c.carId === playerId);
        if (me && state.phase === 'racing') SOUND.updateScene(buildScene(state, me));
      }
      if (hud.updateCountdown(state)) SOUND.countdownTick();

      // Snapshot every few seconds of race time. Cheap, and it means the
      // worst a closed tab can cost is a handful of corners.
      if (opts.resume && state.phase === 'racing') {
        saveClock += dt * speedMult;
        if (saveClock >= 5) {
          saveClock = 0;
          saveRaceInProgress(
            snapshotRace(state, opts.resume.trackDef, opts.title, opts.subtitle, opts.resume.params),
          );
        }
      }
    }

    renderer.draw(
      state,
      interp,
      Math.max(0, Math.min(1, acc / TICK_S)),
      running ? dt : 0,
      playerId,
    );
    hud.setShotCaption(renderer.caption());

    if (state.phase === 'finished' && !finishedShown) {
      finishedShown = true;
      clearRaceInProgress();
      hud.clearRadio();
      hud.update(state);
      const result = buildResult(state);
      setTimeout(() => {
        hud.showResults(state, result, highlights, () => opts.onFinished(result, state));
      }, 900);
    }

    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    stopped = true;
    SOUND.stopEngine();
    hud.clearTip();
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
    root.innerHTML = '';
  };
}
