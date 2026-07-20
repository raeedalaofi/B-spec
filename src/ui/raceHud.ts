// DOM HUD overlaid on the race canvas: timing tower, condition panel,
// command bar, sim-speed controls, message log and countdown/results
// overlays. Updated at ~4 Hz plus event pushes — the canvas handles 60 fps.

import { raceOrder } from '../sim/engine';
import type { PaceLevel, RaceEvent, RaceResult, RaceState } from '../sim/types';
import { messageFor } from './messages';

export interface HudCallbacks {
  onPace(level: PaceLevel): void;
  onOvertake(on: boolean): void;
  onPit(): void;
  onSpeed(mult: number): void;
  onRetire(): void;
}

const MAX_MESSAGES = 7;

function fmtLap(t: number | null): string {
  if (t === null) return '--:--.---';
  const m = Math.floor(t / 60);
  return `${m}'${(t - m * 60).toFixed(3).padStart(6, '0')}`;
}

export class RaceHud {
  private root: HTMLElement;
  private cb: HudCallbacks;
  private tower!: HTMLElement;
  private cond!: HTMLElement;
  private log!: HTMLElement;
  private lapCounter!: HTMLElement;
  private overlay: HTMLElement | null = null;
  private paceBtns: HTMLButtonElement[] = [];
  private overtakeBtn!: HTMLButtonElement;
  private pitBtn!: HTMLButtonElement;
  private speedBtns: HTMLButtonElement[] = [];
  private overtakeOn = false;
  private lastCountdownShown = -1;

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
      <div class="lap-counter"></div>
      <div class="speed-controls"></div>`;
    this.root.appendChild(top);
    this.lapCounter = top.querySelector('.lap-counter')!;
    const speeds = top.querySelector('.speed-controls')!;
    for (const mult of [1, 2, 4]) {
      const b = document.createElement('button');
      b.textContent = `x${mult}`;
      if (mult === 1) b.classList.add('active');
      b.addEventListener('click', () => {
        this.speedBtns.forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        this.cb.onSpeed(mult);
      });
      this.speedBtns.push(b);
      speeds.appendChild(b);
    }
    const retire = document.createElement('button');
    retire.textContent = '✕';
    retire.title = 'Retire from the race';
    retire.addEventListener('click', () => {
      if (confirm('Retire from this race? No prizes or points will be awarded.')) {
        this.cb.onRetire();
      }
    });
    speeds.appendChild(retire);

    this.tower = document.createElement('div');
    this.tower.className = 'timing-tower';
    this.root.appendChild(this.tower);

    this.cond = document.createElement('div');
    this.cond.className = 'condition-panel';
    this.root.appendChild(this.cond);

    const bar = document.createElement('div');
    bar.className = 'command-bar';
    const paceGroup = document.createElement('div');
    paceGroup.className = 'pace-group';
    paceGroup.innerHTML = `<span class="label">Pace 1-5 · O overtake · P pit · S speed</span>`;
    const paceRow = document.createElement('div');
    paceRow.className = 'pace-buttons';
    for (let lvl = 1; lvl <= 5; lvl++) {
      const b = document.createElement('button');
      b.textContent = String(lvl);
      if (lvl === 3) b.classList.add('active');
      b.addEventListener('click', () => {
        this.setPaceActive(lvl as PaceLevel);
        this.cb.onPace(lvl as PaceLevel);
      });
      this.paceBtns.push(b);
      paceRow.appendChild(b);
    }
    paceGroup.appendChild(paceRow);
    bar.appendChild(paceGroup);

    this.overtakeBtn = document.createElement('button');
    this.overtakeBtn.className = 'cmd-toggle';
    this.overtakeBtn.textContent = 'Overtake';
    this.overtakeBtn.addEventListener('click', () => {
      this.overtakeOn = !this.overtakeOn;
      this.overtakeBtn.classList.toggle('active', this.overtakeOn);
      this.cb.onOvertake(this.overtakeOn);
    });
    bar.appendChild(this.overtakeBtn);

    this.pitBtn = document.createElement('button');
    this.pitBtn.className = 'cmd-toggle';
    this.pitBtn.textContent = 'Pit In';
    this.pitBtn.addEventListener('click', () => {
      this.pitBtn.classList.add('armed');
      this.pitBtn.disabled = true;
      this.cb.onPit();
    });
    bar.appendChild(this.pitBtn);

    this.root.appendChild(bar);

    this.log = document.createElement('div');
    this.log.className = 'message-log';
    this.root.appendChild(this.log);
  }

  setPaceActive(level: PaceLevel): void {
    this.paceBtns.forEach((b, i) => b.classList.toggle('active', i + 1 === level));
  }

  /** keyboard shortcuts: 1-5 pace, O overtake, P pit, S cycle speed */
  handleKey(key: string): void {
    if (key >= '1' && key <= '5') {
      this.paceBtns[Number(key) - 1].click();
    } else if (key === 'o' || key === 'O') {
      this.overtakeBtn.click();
    } else if (key === 'p' || key === 'P') {
      if (!this.pitBtn.disabled) this.pitBtn.click();
    } else if (key === 's' || key === 'S') {
      const active = this.speedBtns.findIndex((b) => b.classList.contains('active'));
      this.speedBtns[(active + 1) % this.speedBtns.length].click();
    }
  }

  /** periodic refresh (~4 Hz) */
  update(state: RaceState): void {
    const player = state.cars.find((c) => c.isPlayer);
    const order = raceOrder(state);
    const leader = order[0];

    this.lapCounter.innerHTML = `<span>LAP</span> ${Math.min(leader?.lap || 1, state.lapsTotal)}<span>/${state.lapsTotal}</span>`;

    // timing tower
    const rows = order.map((car, i) => {
      let gap: string;
      if (i === 0) {
        gap = 'Leader';
      } else if (car.finished && car.finishTime !== null && leader.finishTime !== null) {
        gap = `+${(car.finishTime - leader.finishTime).toFixed(1)}`;
      } else if (car.finished) {
        gap = 'DNF';
      } else {
        const distBehind = leader.totalDist - car.totalDist;
        const t = distBehind / Math.max(car.speed, 20);
        gap = distBehind > state.track.lengthM ? `+${Math.floor(distBehind / state.track.lengthM)}L` : `+${t.toFixed(1)}`;
      }
      const status = car.pit
        ? '<span class="st">PIT</span>'
        : car.mistake?.severity === 'spin'
          ? '<span class="st" style="color:var(--bad)">SPIN</span>'
          : car.battle?.phase === 'PASSING'
            ? '<span class="st">ATTACK</span>'
            : '';
      return `<div class="tower-row${car.isPlayer ? ' player' : ''}">
        <span class="tower-pos">${i + 1}</span>
        <span class="tower-chip" style="background:${car.spec.color}"></span>
        <span class="tower-name">${car.driverName} ${status}<small>${fmtLap(car.lastLapS)}</small></span>
        <span class="tower-gap">${gap}</span>
      </div>`;
    });
    this.tower.innerHTML = rows.join('');

    // condition panel
    if (player) {
      const pos = order.indexOf(player) + 1;
      const tire = 1 - player.tireWear;
      const fuelPct = player.fuelL / player.spec.fuelTankL;
      const barClass = (v: number): string => (v < 0.18 ? 'crit' : v < 0.4 ? 'warn' : '');
      this.cond.innerHTML = `
        <div class="cond-pos"><b>P${pos}</b><span class="cond-driver">${player.driverName}</span></div>
        <div class="cond-car">${player.spec.name}</div>
        <div class="cond-row"><span class="label">Tires</span><span class="val">${Math.round(tire * 100)}%</span></div>
        <div class="bar"><i class="${barClass(tire)}" style="width:${Math.max(0, tire * 100)}%"></i></div>
        <div class="cond-row"><span class="label">Fuel</span><span class="val">${player.fuelL.toFixed(1)} L</span></div>
        <div class="bar"><i class="${barClass(fuelPct)}" style="width:${Math.max(0, fuelPct * 100)}%"></i></div>
        <div class="cond-row"><span class="label">Fatigue</span><span class="val">${Math.round(player.fatigue * 100)}%</span></div>
        <div class="bar"><i class="${player.fatigue > 0.7 ? 'crit' : ''}" style="width:${Math.max(2, (1 - player.fatigue) * 100)}%"></i></div>
        <div class="cond-lastlap"><span class="label">Last lap</span><span>${fmtLap(player.lastLapS)}</span></div>
        <div class="cond-lastlap"><span class="label">Best</span><span>${fmtLap(player.bestLapS)}</span></div>`;

      if (!player.pit && this.pitBtn.disabled && !this.pitBtn.dataset.lock) {
        // re-enable after a completed stop
        this.pitBtn.disabled = false;
        this.pitBtn.classList.remove('armed');
      }
      if (player.pit) this.pitBtn.dataset.lock = '';
      else delete this.pitBtn.dataset.lock;
      if (player.overtakeMode !== this.overtakeOn) {
        this.overtakeOn = player.overtakeMode;
        this.overtakeBtn.classList.toggle('active', this.overtakeOn);
      }
    }
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

  /** countdown / green-flag overlay driven from the race loop */
  updateCountdown(state: RaceState): void {
    if (state.phase === 'countdown') {
      const n = Math.ceil(state.countdown);
      if (n !== this.lastCountdownShown) {
        this.lastCountdownShown = n;
        this.showOverlay(`<div class="countdown-num">${n}</div>`);
      }
    } else if (this.lastCountdownShown !== -2 && this.overlay) {
      this.lastCountdownShown = -2;
      this.showOverlay(`<div class="countdown-num green">GO!</div>`);
      const el = this.overlay;
      setTimeout(() => {
        if (this.overlay === el) this.hideOverlay();
      }, 900);
    }
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

  showResults(state: RaceState, result: RaceResult, onContinue: () => void): void {
    const rows = result.rows
      .map(
        (r) => `<tr class="${r.isPlayer ? 'player' : ''}">
          <td class="mono">${r.position}</td>
          <td>${r.driverName}</td>
          <td>${r.carName}</td>
          <td class="mono">${r.position === 1 ? 'Winner' : r.gapS !== null ? `+${r.gapS.toFixed(1)}s` : `+${r.lapsDown}L`}</td>
          <td class="mono">${r.bestLapS ? fmtLap(r.bestLapS) : '-'}${r.fastestLap ? ' ★' : ''}</td>
        </tr>`,
      )
      .join('');
    this.showOverlay(`
      <div class="results-card">
        <h2>Race Result</h2>
        <table class="results-table">
          <thead><tr><th>P</th><th>Driver</th><th>Car</th><th>Gap</th><th>Best</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="results-actions"><button class="btn primary" id="race-continue">Continue</button></div>
      </div>`);
    this.overlay!.querySelector('#race-continue')!.addEventListener('click', onContinue);
    void state;
  }
}
