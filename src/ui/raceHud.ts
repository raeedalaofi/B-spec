// DOM HUD overlaid on the race canvas: timing tower, condition panel,
// order bar, pit dialog, rival intel, radio prompts, sim controls, message
// log and countdown/results overlays. Updated at ~4 Hz plus event pushes —
// the canvas handles 60 fps.

import { AI_BY_ID, TRAIT_INFO, type DriverTrait } from '../data/aidrivers';
import { COMPOUNDS, ORDERS } from '../data/strategy';
import { raceOrder } from '../sim/engine';
import type {
  CarRaceState,
  DriverOrder,
  RaceEvent,
  RaceResult,
  RaceState,
  TireCompound,
} from '../sim/types';
import { DRIVER_ORDERS, TIRE_COMPOUNDS } from '../sim/types';
import { imgTag } from './assets';
import { buildReel, type Highlight } from './highlights';
import { messageFor } from './messages';
import type { RadioPrompt } from './radio';

export interface HudCallbacks {
  onOrder(order: DriverOrder): void;
  onPit(tires: TireCompound | null, refuel: boolean, fuelTargetL?: number): void;
  onSpeed(mult: number): void;
  onPause(paused: boolean): void;
  onWideView(on: boolean): void;
  onRetire(): void;
  audioOn: boolean;
  onAudioToggle(on: boolean): void;
}

const MAX_MESSAGES = 7;

function fmtLap(t: number | null): string {
  if (t === null) return '--:--.---';
  const m = Math.floor(t / 60);
  return `${m}'${(t - m * 60).toFixed(3).padStart(6, '0')}`;
}

/** the driver id behind an AI carId ('ai-rossi' -> 'rossi') */
function aiDriverId(carId: string): string {
  return carId.replace(/^ai-/, '').replace(/-\d+$/, '');
}

function traitOf(carId: string): DriverTrait | null {
  return AI_BY_ID[aiDriverId(carId)]?.trait ?? null;
}

export class RaceHud {
  private root: HTMLElement;
  private cb: HudCallbacks;
  private tower!: HTMLElement;
  private cond!: HTMLElement;
  private intel!: HTMLElement;
  private log!: HTMLElement;
  private lapCounter!: HTMLElement;
  private flag!: HTMLElement;
  private overlay: HTMLElement | null = null;
  private orderBtns = new Map<DriverOrder, HTMLButtonElement>();
  private pitBtn!: HTMLButtonElement;
  private speedBtns: HTMLButtonElement[] = [];
  private pauseBtn!: HTMLButtonElement;
  private shotCaption!: HTMLElement;
  private wideBtn!: HTMLButtonElement;
  private wideOn = false;
  private radioEl: HTMLElement | null = null;
  private radioId: string | null = null;
  private currentOrder: DriverOrder = 'push';
  private lastCountdownShown = -1;
  private paused = false;

  constructor(root: HTMLElement, title: string, subtitle: string, cb: HudCallbacks) {
    this.root = root;
    this.cb = cb;
    this.build(title, subtitle);
  }

  private build(title: string, subtitle: string): void {
    const top = document.createElement('div');
    top.className = 'hud-top';
    top.innerHTML = `
      <div class="race-title">${title}<small>${subtitle}</small></div>
      <div class="lap-block"><div class="lap-counter"></div><div class="flag-state"></div></div>
      <div class="speed-controls"></div>`;
    this.root.appendChild(top);
    this.lapCounter = top.querySelector('.lap-counter')!;
    this.flag = top.querySelector('.flag-state')!;
    const speeds = top.querySelector('.speed-controls')!;

    this.wideBtn = document.createElement('button');
    this.wideBtn.textContent = '⛶';
    this.wideBtn.title = 'Whole circuit view (V)';
    this.wideBtn.setAttribute('aria-label', 'Toggle the whole-circuit view');
    this.wideBtn.addEventListener('click', () => this.toggleWide());
    speeds.appendChild(this.wideBtn);

    this.pauseBtn = document.createElement('button');
    this.pauseBtn.textContent = '❚❚';
    this.pauseBtn.title = 'Pause (Space)';
    this.pauseBtn.setAttribute('aria-label', 'Pause the race');
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    speeds.appendChild(this.pauseBtn);

    for (const mult of [1, 2, 4]) {
      const b = document.createElement('button');
      b.textContent = `x${mult}`;
      b.setAttribute('aria-label', `Run at ${mult} times speed`);
      if (mult === 1) b.classList.add('active');
      b.addEventListener('click', () => {
        this.speedBtns.forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        this.cb.onSpeed(mult);
      });
      this.speedBtns.push(b);
      speeds.appendChild(b);
    }
    let audioOn = this.cb.audioOn;
    const audio = document.createElement('button');
    audio.textContent = audioOn ? '🔊' : '🔇';
    audio.title = 'Toggle sound';
    audio.setAttribute('aria-label', 'Toggle sound');
    audio.addEventListener('click', () => {
      audioOn = !audioOn;
      audio.textContent = audioOn ? '🔊' : '🔇';
      this.cb.onAudioToggle(audioOn);
    });
    speeds.appendChild(audio);

    const retire = document.createElement('button');
    retire.textContent = '✕';
    retire.title = 'Retire from the race';
    retire.setAttribute('aria-label', 'Retire from the race');
    retire.addEventListener('click', () => {
      if (confirm('Retire from this race? No prizes or points will be awarded.')) {
        this.cb.onRetire();
      }
    });
    speeds.appendChild(retire);

    this.tower = document.createElement('div');
    this.tower.className = 'timing-tower';
    this.tower.setAttribute('aria-label', 'Timing tower');
    this.root.appendChild(this.tower);

    this.cond = document.createElement('div');
    this.cond.className = 'condition-panel';
    this.root.appendChild(this.cond);

    this.intel = document.createElement('div');
    this.intel.className = 'intel-panel';
    this.root.appendChild(this.intel);

    this.root.appendChild(this.buildCommandBar());

    this.shotCaption = document.createElement('div');
    this.shotCaption.className = 'shot-caption';
    this.root.appendChild(this.shotCaption);

    this.log = document.createElement('div');
    this.log.className = 'message-log';
    this.log.setAttribute('aria-live', 'polite');
    this.root.appendChild(this.log);
  }

  /**
   * The command bar is deliberately a list of *orders* rather than a pace
   * dial. A dial has one obviously right answer; an order is a trade the
   * player has to think about.
   */
  private buildCommandBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'command-bar';

    const group = document.createElement('div');
    group.className = 'order-group';
    group.innerHTML = `<span class="label">Team radio — 1-6 orders · P pit · Space pause · V view · S speed</span>`;
    const row = document.createElement('div');
    row.className = 'order-buttons';
    DRIVER_ORDERS.forEach((id, i) => {
      const spec = ORDERS[id];
      const b = document.createElement('button');
      b.innerHTML = `<b>${spec.label}</b><small>${spec.desc}</small>`;
      b.className = `order-btn order-${id}`;
      b.title = spec.desc;
      b.setAttribute('aria-label', `${spec.label}: ${spec.desc}`);
      b.dataset.key = String(i + 1);
      if (id === 'push') b.classList.add('active');
      b.addEventListener('click', () => this.setOrder(id));
      this.orderBtns.set(id, b);
      row.appendChild(b);
    });
    group.appendChild(row);
    bar.appendChild(group);

    this.pitBtn = document.createElement('button');
    this.pitBtn.className = 'cmd-toggle pit-btn';
    this.pitBtn.innerHTML = '<b>Pit In</b><small>tires · fuel</small>';
    this.pitBtn.setAttribute('aria-label', 'Open the pit stop dialog');
    this.pitBtn.addEventListener('click', () => this.openPitDialog());
    bar.appendChild(this.pitBtn);

    return bar;
  }

  setOrder(order: DriverOrder): void {
    this.currentOrder = order;
    for (const [id, btn] of this.orderBtns) btn.classList.toggle('active', id === order);
    this.cb.onOrder(order);
  }

  /** the camera caption: what the current shot is showing */
  setShotCaption(text: string): void {
    if (this.shotCaption.textContent === text) return;
    this.shotCaption.textContent = text;
    this.shotCaption.classList.toggle('visible', text.length > 0);
  }

  toggleWide(): void {
    this.wideOn = !this.wideOn;
    this.wideBtn.classList.toggle('active', this.wideOn);
    this.cb.onWideView(this.wideOn);
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.pauseBtn.textContent = this.paused ? '▶' : '❚❚';
    this.pauseBtn.classList.toggle('active', this.paused);
    this.cb.onPause(this.paused);
  }

  /**
   * The pit dialog is where a stop stops being a button and becomes a plan:
   * which compound for the rest of the race, and how much fuel to take —
   * a splash is quicker in the box but might not reach the flag.
   */
  private openPitDialog(): void {
    const wasPaused = this.paused;
    if (!wasPaused) this.togglePause();
    const state = this.lastState;
    const player = state?.cars.find((c) => c.isPlayer);
    const tank = player?.spec.fuelTankL ?? 50;
    const lapsLeft = state ? Math.max(1, state.lapsTotal - (player?.lap ?? 1) + 1) : 1;

    const compoundRows = TIRE_COMPOUNDS.map((id) => {
      const c = COMPOUNDS[id];
      return `<button class="pit-choice" data-compound="${id}" aria-label="Fit ${c.label} tires">
        <b>${c.label}</b><small>${c.desc}</small></button>`;
    }).join('');

    this.showOverlay(`
      <div class="pit-dialog">
        <h2>Pit Stop</h2>
        <p class="pit-sub">${lapsLeft} lap(s) remaining. Tires cost time in the box; fuel costs time on track.</p>
        <div class="label">Tires</div>
        <div class="pit-choices">
          ${compoundRows}
          <button class="pit-choice" data-compound="" aria-label="Stay on the current tires">
            <b>Stay Out</b><small>Keep the set you are on. Fastest stop there is.</small></button>
        </div>
        <div class="label">Fuel</div>
        <div class="pit-fuel">
          <input type="range" id="pit-fuel" min="0" max="${Math.round(tank)}" value="${Math.round(tank)}"
                 aria-label="Fuel to fill to, in litres" />
          <span class="pit-fuel-val">${Math.round(tank)} L</span>
        </div>
        <div class="results-actions">
          <button class="btn primary" id="pit-go">Box This Lap</button>
          <button class="btn" id="pit-cancel">Stay Out</button>
        </div>
      </div>`);

    const overlay = this.overlay!;
    let compound: TireCompound | null = 'medium';
    const marks = overlay.querySelectorAll<HTMLButtonElement>('.pit-choice');
    const select = (btn: HTMLButtonElement): void => {
      marks.forEach((m) => m.classList.remove('active'));
      btn.classList.add('active');
      compound = (btn.dataset.compound || null) as TireCompound | null;
    };
    marks.forEach((m) => m.addEventListener('click', () => select(m)));
    select(overlay.querySelector<HTMLButtonElement>('[data-compound="medium"]')!);

    const fuel = overlay.querySelector<HTMLInputElement>('#pit-fuel')!;
    const fuelVal = overlay.querySelector<HTMLElement>('.pit-fuel-val')!;
    fuel.addEventListener('input', () => (fuelVal.textContent = `${fuel.value} L`));

    const close = (): void => {
      this.hideOverlay();
      if (!wasPaused && this.paused) this.togglePause();
    };
    overlay.querySelector('#pit-cancel')!.addEventListener('click', close);
    overlay.querySelector('#pit-go')!.addEventListener('click', () => {
      const target = Number(fuel.value);
      this.cb.onPit(compound, target > (player?.fuelL ?? 0), target);
      this.pitBtn.classList.add('armed');
      this.pitBtn.disabled = true;
      close();
    });
  }

  /** keyboard shortcuts: 1-6 orders, P pit, Space pause, S cycle speed */
  handleKey(key: string): boolean {
    const n = Number(key);
    if (n >= 1 && n <= DRIVER_ORDERS.length) {
      this.setOrder(DRIVER_ORDERS[n - 1]);
      return true;
    }
    if (key === 'p' || key === 'P') {
      if (!this.pitBtn.disabled) this.pitBtn.click();
      return true;
    }
    if (key === ' ') {
      this.togglePause();
      return true;
    }
    if (key === 'v' || key === 'V') {
      this.toggleWide();
      return true;
    }
    if (key === 's' || key === 'S') {
      const active = this.speedBtns.findIndex((b) => b.classList.contains('active'));
      this.speedBtns[(active + 1) % this.speedBtns.length].click();
      return true;
    }
    return false;
  }

  private lastState: RaceState | null = null;

  /** periodic refresh (~4 Hz) */
  update(state: RaceState): void {
    this.lastState = state;
    const player = state.cars.find((c) => c.isPlayer);
    const order = raceOrder(state);
    const leader = order[0];

    this.lapCounter.innerHTML = `<span>LAP</span> ${Math.min(leader?.lap || 1, state.lapsTotal)}<span>/${state.lapsTotal}</span>`;
    this.flag.className = `flag-state ${state.caution ? 'caution' : ''}`;
    this.flag.textContent = state.caution
      ? `SAFETY CAR · ${state.caution.lapsLeft} lap(s)`
      : '';

    this.tower.innerHTML = order.map((car, i) => this.towerRow(state, car, i, leader)).join('');

    if (player) {
      this.renderCondition(state, player, order.indexOf(player) + 1);
      this.renderIntel(state, player, order);
      if (!player.pit && this.pitBtn.disabled && !this.pitBtn.dataset.lock) {
        this.pitBtn.disabled = false;
        this.pitBtn.classList.remove('armed');
      }
      if (player.pit) this.pitBtn.dataset.lock = '';
      else delete this.pitBtn.dataset.lock;
      if (player.order !== this.currentOrder) {
        this.currentOrder = player.order;
        for (const [id, btn] of this.orderBtns) btn.classList.toggle('active', id === player.order);
      }
    }
  }

  private towerRow(
    state: RaceState,
    car: CarRaceState,
    i: number,
    leader: CarRaceState,
  ): string {
    let gap: string;
    if (car.retired) {
      gap = 'OUT';
    } else if (i === 0) {
      gap = 'Leader';
    } else if (car.finished && car.finishTime !== null && leader.finishTime !== null) {
      gap = `+${(car.finishTime - leader.finishTime).toFixed(1)}`;
    } else if (car.finished) {
      gap = 'DNF';
    } else {
      const distBehind = leader.totalDist - car.totalDist;
      const t = distBehind / Math.max(car.speed, 20);
      gap =
        distBehind > state.track.lengthM
          ? `+${Math.floor(distBehind / state.track.lengthM)}L`
          : `+${t.toFixed(1)}`;
    }
    const status = car.retired
      ? '<span class="st bad">OUT</span>'
      : car.pit
        ? '<span class="st">PIT</span>'
        : car.mistake?.severity === 'spin'
          ? '<span class="st bad">SPIN</span>'
          : car.battle?.phase === 'COMMITTED'
            ? '<span class="st atk">ATTACK</span>'
            : car.defence === 'cover'
              ? '<span class="st def">DEFEND</span>'
              : '';
    const comp = COMPOUNDS[car.compound];
    const wearPct = Math.round((1 - car.tireWear) * 100);
    return `<div class="tower-row${car.isPlayer ? ' player' : ''}${car.retired ? ' out' : ''}">
      <span class="tower-pos">${i + 1}</span>
      <span class="tower-chip" style="background:${car.spec.color}"></span>
      <span class="tower-name">${car.driverName} ${status}<small>${fmtLap(car.lastLapS)}</small></span>
      <span class="tower-tire tire-${car.compound}" title="${comp.label}, ${wearPct}% left">${comp.short}</span>
      <span class="tower-gap">${gap}</span>
    </div>`;
  }

  private renderCondition(state: RaceState, player: CarRaceState, pos: number): void {
    const tire = 1 - player.tireWear;
    const fuelPct = player.fuelL / player.spec.fuelTankL;
    const barClass = (v: number): string => (v < 0.18 ? 'crit' : v < 0.4 ? 'warn' : '');
    const comp = COMPOUNDS[player.compound];
    // laps of life left in the current set, so "should I box" is answerable
    const lapsRun = Math.max(1, player.lap);
    const wearPerLap = player.tireWear / lapsRun;
    const tireLaps = wearPerLap > 1e-4 ? Math.floor(tire / wearPerLap) : 99;
    const fuelPerLap = (player.spec.fuelTankL - player.fuelL) / lapsRun;
    const fuelLaps = fuelPerLap > 1e-4 ? Math.floor(player.fuelL / fuelPerLap) : 99;
    const lapsLeft = state.lapsTotal - player.lap + 1;

    this.cond.innerHTML = `
      <div class="cond-pos"><b>P${pos}</b><span class="cond-driver">${player.driverName}</span></div>
      <div class="cond-car">${player.spec.name}</div>
      <div class="cond-row"><span class="label">Tires <i class="tire-${player.compound}">${comp.short}</i></span><span class="val">${Math.round(tire * 100)}%</span></div>
      <div class="bar"><i class="${barClass(tire)}" style="width:${Math.max(0, tire * 100)}%"></i></div>
      <div class="cond-note ${tireLaps < lapsLeft ? 'warn' : ''}">${tireLaps >= 99 ? 'plenty left' : `~${tireLaps} lap(s) of life · ${lapsLeft} to go`}</div>
      <div class="cond-row"><span class="label">Fuel</span><span class="val">${player.fuelL.toFixed(1)} L</span></div>
      <div class="bar"><i class="${barClass(fuelPct)}" style="width:${Math.max(0, fuelPct * 100)}%"></i></div>
      <div class="cond-note ${fuelLaps < lapsLeft ? 'warn' : ''}">${fuelLaps >= 99 ? 'plenty left' : `~${fuelLaps} lap(s) of fuel`}</div>
      <div class="cond-row"><span class="label">Fatigue</span><span class="val">${Math.round(player.fatigue * 100)}%</span></div>
      <div class="bar"><i class="${player.fatigue > 0.7 ? 'crit' : ''}" style="width:${Math.max(2, (1 - player.fatigue) * 100)}%"></i></div>
      ${player.damage > 0.05 ? `<div class="cond-row"><span class="label">Damage</span><span class="val bad">${Math.round(player.damage * 100)}%</span></div>` : ''}
      <div class="cond-lastlap"><span class="label">Last lap</span><span>${fmtLap(player.lastLapS)}</span></div>
      <div class="cond-lastlap"><span class="label">Best</span><span>${fmtLap(player.bestLapS)}</span></div>`;
  }

  /**
   * Rival intel: who is immediately ahead and behind, and what they are known
   * for. Turns "a car is close" into "a car I know something about is close",
   * which is the difference between watching and deciding.
   */
  private renderIntel(state: RaceState, player: CarRaceState, order: CarRaceState[]): void {
    const idx = order.indexOf(player);
    const card = (car: CarRaceState | undefined, role: string): string => {
      if (!car) return '';
      const trait = traitOf(car.carId);
      const info = trait ? TRAIT_INFO[trait] : null;
      const L = state.track.lengthM;
      const gapM = ((role === 'AHEAD' ? car.s - player.s : player.s - car.s) + L) % L;
      const gapS = gapM / Math.max(player.speed, 15);
      return `<div class="intel-card">
        <div class="intel-role">${role}<span class="intel-gap">${gapS < 90 ? `${gapS.toFixed(1)}s` : '—'}</span></div>
        <div class="intel-name"><i class="tower-chip" style="background:${car.spec.color}"></i>${car.driverName}</div>
        ${info ? `<div class="intel-trait">${info.label}</div><div class="intel-hint">${info.hint}</div>` : ''}
        <div class="intel-cond">tires ${Math.round((1 - car.tireWear) * 100)}% · ${COMPOUNDS[car.compound].short}</div>
      </div>`;
    };
    this.intel.innerHTML = card(order[idx - 1], 'AHEAD') + card(order[idx + 1], 'BEHIND');
  }

  // -- radio ----------------------------------------------------------------

  /**
   * A timed decision from the driver. This is the game's moment-to-moment
   * loop: something changes, the driver asks, and the player has a few
   * seconds to answer before the driver decides for themselves.
   */
  showRadio(prompt: RadioPrompt, onChoice: (index: number) => void): void {
    if (this.radioId === prompt.id) return;
    this.clearRadio();
    this.radioId = prompt.id;
    const el = document.createElement('div');
    el.className = 'radio-prompt';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-live', 'assertive');
    el.innerHTML = `
      <div class="radio-head"><span class="radio-tag">RADIO</span><i class="radio-timer"></i></div>
      <div class="radio-text">“${prompt.text}”</div>
      <div class="radio-options">
        ${prompt.options.map((o, i) => `<button class="radio-opt" data-i="${i}">${o.label}</button>`).join('')}
      </div>`;
    this.root.appendChild(el);
    this.radioEl = el;
    el.querySelectorAll<HTMLButtonElement>('.radio-opt').forEach((b) => {
      b.addEventListener('click', () => {
        onChoice(Number(b.dataset.i));
        this.clearRadio();
      });
    });
  }

  /** advance the visible countdown; returns true once it has expired */
  tickRadio(fraction: number): void {
    const bar = this.radioEl?.querySelector<HTMLElement>('.radio-timer');
    if (bar) bar.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  }

  clearRadio(): void {
    this.radioEl?.remove();
    this.radioEl = null;
    this.radioId = null;
  }

  activeRadioId(): string | null {
    return this.radioId;
  }

  pushEvent(state: RaceState, e: RaceEvent): void {
    const msg = messageFor(state, e);
    if (!msg) return;
    const div = document.createElement('div');
    div.className = `msg ${msg.tone}`;
    div.textContent = msg.text;
    this.log.prepend(div);
    while (this.log.children.length > MAX_MESSAGES) {
      this.log.lastElementChild?.remove();
    }
  }

  /** countdown / green-flag overlay; returns true when a new digit shows */
  updateCountdown(state: RaceState): boolean {
    if (state.phase === 'countdown') {
      const n = Math.ceil(state.countdown);
      if (n !== this.lastCountdownShown) {
        this.lastCountdownShown = n;
        this.showOverlay(`
          <div class="countdown-stack">
            ${imgTag('fx/start-lights.png', `lights-img lit-${n}`)}
            <div class="countdown-num">${n}</div>
          </div>`);
        return true;
      }
    } else if (this.lastCountdownShown !== -2 && this.overlay) {
      this.lastCountdownShown = -2;
      this.showOverlay(`
        <div class="countdown-stack">
          ${imgTag('fx/flag-green.png', 'flag-img')}
          <div class="countdown-num green">GO!</div>
        </div>`);
      const el = this.overlay;
      setTimeout(() => {
        if (this.overlay === el) this.hideOverlay();
      }, 900);
    }
    return false;
  }

  showOverlay(html: string): void {
    this.hideOverlay();
    this.overlay = document.createElement('div');
    this.overlay.className = 'race-overlay';
    this.overlay.innerHTML = html;
    this.root.appendChild(this.overlay);
  }

  hideOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  showResults(
    state: RaceState,
    result: RaceResult,
    highlights: Highlight[],
    onContinue: () => void,
  ): void {
    const rows = result.rows
      .map(
        (r) => `<tr class="${r.isPlayer ? 'player' : ''}${r.retired ? ' out' : ''}">
          <td class="mono">${r.retired ? '—' : r.position}</td>
          <td>${r.driverName}</td>
          <td>${r.carName}</td>
          <td class="mono">${
            r.retired
              ? 'RETIRED'
              : r.position === 1
                ? 'Winner'
                : r.gapS !== null
                  ? `+${r.gapS.toFixed(1)}s`
                  : `+${r.lapsDown}L`
          }</td>
          <td class="mono">${r.bestLapS ? fmtLap(r.bestLapS) : '-'}${r.fastestLap ? ' ★' : ''}</td>
        </tr>`,
      )
      .join('');
    const reel = buildReel(highlights);
    const fmtClock = (t: number): string => {
      const m = Math.floor(t / 60);
      return `${m}:${Math.floor(t - m * 60).toString().padStart(2, '0')}`;
    };
    const reelHtml = reel.length
      ? `<div class="reel">
          <div class="label">How the race went</div>
          ${reel
            .map(
              (h) => `<div class="reel-row ${h.tone}">
                <span class="reel-time">L${h.lap} · ${fmtClock(h.atS)}</span>
                <span class="reel-text">${h.text}</span>
              </div>`,
            )
            .join('')}
        </div>`
      : '';
    this.showOverlay(`
      <div class="results-card">
        <h2>${imgTag('fx/flag-checkered.png', 'flag-img inline')}Race Result</h2>
        <div class="results-body">
          <table class="results-table">
            <thead><tr><th>P</th><th>Driver</th><th>Car</th><th>Gap</th><th>Best</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          ${reelHtml}
        </div>
        <div class="results-actions"><button class="btn primary" id="race-continue">Continue</button></div>
      </div>`);
    this.overlay!.querySelector('#race-continue')!.addEventListener('click', onContinue);
    void state;
  }
}
