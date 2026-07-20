import { CAR_LIST } from '../../data/cars';
import { fmtCr, menuShell } from '../menuCommon';
import type { AppContext } from '../screenManager';
import type { CarSpec } from '../../sim/types';

function carCard(ctx: AppContext, car: CarSpec): string {
  const gs = ctx.gs!;
  const owned = gs.ownedCarIds.includes(car.id);
  const affordable = gs.credits >= car.priceCr;
  const kmh = Math.round(car.topSpeedMs * 3.6);
  return `
    <div class="car-card ${owned ? 'owned' : ''}">
      <div class="car-chip" style="background:${car.color}"></div>
      <div class="car-info">
        <b>${car.name}</b>
        <span class="label">Class ${car.class}</span>
        <span class="car-specs">${car.powerKw} kW · ${car.massKg} kg · ${kmh} km/h · grip ${car.grip.toFixed(2)}</span>
      </div>
      <div class="car-buy">
        <span class="car-price">${fmtCr(car.priceCr)}</span>
        ${
          owned
            ? '<span class="owned-tag">OWNED</span>'
            : `<button class="btn primary" data-buy="${car.id}" ${affordable ? '' : 'disabled'}>Buy</button>`
        }
      </div>
    </div>`;
}

export function dealershipScreen(ctx: AppContext): void {
  const gs = ctx.gs!;
  const content = menuShell(ctx, 'Dealership', { backTo: 'home' });
  const byClass: Array<['C' | 'B' | 'A', string]> = [
    ['C', 'Class C — Compacts'],
    ['B', 'Class B — Sports'],
    ['A', 'Class A — Flagships'],
  ];
  content.innerHTML = byClass
    .map(
      ([cls, label]) => `
      <h2 class="section-title">${label}</h2>
      <div class="car-list">
        ${CAR_LIST.filter((c) => c.class === cls)
          .map((c) => carCard(ctx, c))
          .join('')}
      </div>`,
    )
    .join('');

  content.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const car = CAR_LIST.find((c) => c.id === btn.dataset.buy)!;
      if (gs.credits < car.priceCr || gs.ownedCarIds.includes(car.id)) return;
      gs.credits -= car.priceCr;
      gs.ownedCarIds.push(car.id);
      if (!gs.activeCarId) gs.activeCarId = car.id;
      ctx.save();
      ctx.go('dealership');
    });
  });
}
