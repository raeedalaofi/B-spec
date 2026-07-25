// The pre-race strategy panel.
//
// This is the game's first real decision, and it happens before the lights go
// out: which compound to start on, and how much fuel to carry. Both are
// genuine trades — softs are quicker but will not reach the flag, a light car
// is faster but buys a stop — and both are made with incomplete information,
// which is what makes them interesting rather than arithmetic.

import { COMPOUNDS, MIN_FUEL_FRAC, ORDERS, type RaceStrategy } from '../data/strategy';
import { fuelFactor, tireFactor } from '../sim/pace';
import type { CarSpec, DriverOrder, Track, TireCompound } from '../sim/types';
import { DRIVER_ORDERS, TIRE_COMPOUNDS } from '../sim/types';

export interface PreRaceOptions {
  title: string;
  subtitle: string;
  track: Track;
  laps: number;
  car: CarSpec;
  /** wear per lap the car will actually see, for the stint estimate */
  wearPerLapBase: number;
  fuelPerLapBase: number;
  initial: RaceStrategy;
  onStart(strategy: RaceStrategy): void;
  onBack(): void;
}

/** how many laps a compound will last at this car's wear rate */
function stintLaps(wearPerLapBase: number, compound: TireCompound): number {
  const rate = wearPerLapBase * COMPOUNDS[compound].wearMult;
  return rate > 1e-5 ? 1 / rate : 99;
}

export function mountPreRace(root: HTMLElement, opts: PreRaceOptions): () => void {
  const strategy: RaceStrategy = { ...opts.initial };
  root.innerHTML = '';
  const screen = document.createElement('div');
  screen.className = 'prerace-screen';
  root.appendChild(screen);

  const tank = opts.car.fuelTankL;
  const fuelLapsAt = (frac: number): number =>
    (tank * frac) / Math.max(0.01, opts.fuelPerLapBase);

  const render = (): void => {
    const laps = opts.laps;
    const tyreLaps = stintLaps(opts.wearPerLapBase, strategy.compound);
    const fuelLaps = fuelLapsAt(strategy.fuelFrac);
    const startL = tank * strategy.fuelFrac;

    // The two headline numbers: does this plan actually reach the flag, and
    // what does it cost per lap if it does.
    const tyreStops = Math.max(0, Math.ceil(laps / Math.max(1, tyreLaps)) - 1);
    const fuelStops = Math.max(0, Math.ceil(laps / Math.max(1, fuelLaps)) - 1);
    const stops = Math.max(tyreStops, fuelStops);
    const gripDelta = (tireFactor(0, strategy.compound) / tireFactor(0, 'medium') - 1) * 100;
    const weightDelta = (fuelFactor(startL) / fuelFactor(tank) - 1) * 100;

    screen.innerHTML = `
      <div class="prerace-head">
        <button class="btn ghost" id="pr-back" aria-label="Back">‹ Back</button>
        <div><h1>${opts.title}</h1><p class="prerace-sub">${opts.subtitle}</p></div>
      </div>

      <div class="prerace-grid">
        <section class="prerace-card">
          <div class="label">Starting Tires</div>
          <div class="prerace-choices">
            ${TIRE_COMPOUNDS.map((id) => {
              const c = COMPOUNDS[id];
              const life = stintLaps(opts.wearPerLapBase, id);
              const covers = life >= laps;
              return `<button class="prerace-choice tire-choice-${id} ${id === strategy.compound ? 'active' : ''}"
                data-compound="${id}" aria-pressed="${id === strategy.compound}">
                <b>${c.label}</b>
                <small>${c.desc}</small>
                <em class="${covers ? 'good' : 'warn'}">~${Math.min(99, Math.round(life))} lap stint${covers ? ' · goes the distance' : ' · needs a stop'}</em>
              </button>`;
            }).join('')}
          </div>
        </section>

        <section class="prerace-card">
          <div class="label">Fuel Load</div>
          <div class="prerace-fuel">
            <input type="range" id="pr-fuel" min="${Math.round(MIN_FUEL_FRAC * 100)}" max="100"
                   value="${Math.round(strategy.fuelFrac * 100)}"
                   aria-label="Starting fuel, percentage of the tank" />
            <div class="prerace-fuel-read">
              <b>${startL.toFixed(1)} L</b>
              <span class="${fuelLaps >= laps ? 'good' : 'warn'}">~${Math.round(fuelLaps)} laps of range</span>
            </div>
          </div>
          <p class="prerace-note">Running light is worth about
            <b>${weightDelta >= 0 ? '+' : ''}${weightDelta.toFixed(2)}%</b> lap time — and a trip down the pit lane.</p>
        </section>

        <section class="prerace-card">
          <div class="label">Opening Order</div>
          <div class="prerace-choices compact">
            ${DRIVER_ORDERS.filter((o) => o !== 'let-by')
              .map((id) => {
                const o = ORDERS[id];
                return `<button class="prerace-choice ${id === strategy.order ? 'active' : ''}"
                  data-order="${id}" aria-pressed="${id === strategy.order}">
                  <b>${o.label}</b><small>${o.desc}</small></button>`;
              })
              .join('')}
          </div>
        </section>

        <section class="prerace-card prerace-summary">
          <div class="label">The Plan</div>
          <div class="plan-row"><span>Race</span><b>${laps} laps · ${(
            (opts.track.lengthM * laps) /
            1000
          ).toFixed(1)} km</b></div>
          <div class="plan-row"><span>Tire pace</span><b class="${gripDelta >= 0 ? 'good' : 'warn'}">${gripDelta >= 0 ? '+' : ''}${gripDelta.toFixed(2)}%</b></div>
          <div class="plan-row"><span>Stops needed</span><b class="${stops === 0 ? 'good' : ''}">${stops === 0 ? 'None — flat out to the flag' : `${stops}`}</b></div>
          <p class="prerace-note">${
            stops === 0
              ? 'Nothing forces you into the pit lane. Anything that happens out there is your call.'
              : 'You will have to stop. When you do it is up to you — and to whatever the race throws up.'
          }</p>
          <button class="btn primary big" id="pr-start">Go Racing</button>
        </section>
      </div>`;

    screen.querySelector('#pr-back')!.addEventListener('click', opts.onBack);
    screen.querySelector('#pr-start')!.addEventListener('click', () => opts.onStart(strategy));
    screen.querySelectorAll<HTMLButtonElement>('[data-compound]').forEach((b) =>
      b.addEventListener('click', () => {
        strategy.compound = b.dataset.compound as TireCompound;
        render();
      }),
    );
    screen.querySelectorAll<HTMLButtonElement>('[data-order]').forEach((b) =>
      b.addEventListener('click', () => {
        strategy.order = b.dataset.order as DriverOrder;
        render();
      }),
    );
    const fuel = screen.querySelector<HTMLInputElement>('#pr-fuel')!;
    fuel.addEventListener('input', () => {
      strategy.fuelFrac = Number(fuel.value) / 100;
      render();
      // keep the slider usable across the re-render
      const next = screen.querySelector<HTMLInputElement>('#pr-fuel')!;
      next.focus();
    });
  };

  render();
  return () => {
    root.innerHTML = '';
  };
}
